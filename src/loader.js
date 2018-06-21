const path = require('path');
const fs = require('fs');

export default function(content, map) {
    this.cacheable && this.cacheable();

    const callback = this.async();

    if (!this._compilation.__webpackModuleOverride__) {
        throw new Error(`"webpack-multi-output" loader is used without the corresponding plugin, refer to https://github.com/dailymotion/webpack-multi-output for the usage example`);
    }

    if(this._compilation.__webpackModuleOverride__.loadedOverrides && this._compilation.__webpackModuleOverride__.loadedOverrides.indexOf(this.resourcePath) > -1) {
        callback(null, content, map);
        return;
    }

    this.cacheable(false);

    const dir = path.dirname(this.resourcePath);
    const filename = path.basename(this.resourcePath);
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);

    const promises = [];
    for(let i = 0, length = this._compilation.__webpackModuleOverride__.overrides.length; i < length; i += 1) {
        const override = this._compilation.__webpackModuleOverride__.overrides[i];

        const overridePath = [dir, path.sep, name, '.', override, ext].join('');
        console.log("overridePath: ", overridePath); // eslint-disable-line quotes

        const promise = new Promise((resolve, reject) => {
            fs.stat(overridePath, (error) => {
                if (error) {
                    if (error.code === "ENOENT") {
                        return resolve();
                    }

                    return reject(error);
                }

                // Store module paths loaded by this loader to prevent endless loop
                if(!this._compilation.__webpackModuleOverride__.loadedOverrides) {
                    this._compilation.__webpackModuleOverride__.loadedOverrides = [];
                }
                this._compilation.__webpackModuleOverride__.loadedOverrides.push(overridePath);

                console.log('loadingOverride ' + overridePath);
                this.loadModule(overridePath, (error, result) => {
                    if(error) {
                        return reject(error);
                    }




                    if(!this._compilation.__webpackModuleOverride__.overridesMap) {
                        this._compilation.__webpackModuleOverride__.overridesMap = {};
                    }
                    if(!this._compilation.__webpackModuleOverride__.overridesMap[this.resourcePath]) {
                        this._compilation.__webpackModuleOverride__.overridesMap[this.resourcePath] = {};
                    }

                    this._compilation.__webpackModuleOverride__.overridesMap[this.resourcePath][override] = overridePath;

                    return resolve();
                });
            });
        });

        promises.push(promise);
    }

    Promise.all(promises)
        .then(() => callback(null, content, map))
        .catch(callback);

    return;
};