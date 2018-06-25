import {createHash} from 'crypto'
import validateOptions from 'schema-utils';
import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin';
import MultiEntryPlugin from 'webpack/lib/MultiEntryPlugin';

const PLUGIN_NAME = 'ModuleOverridePlugin';
const NS = '__moduleOverrideWebpackPlugin__';
const LOADER_NS = '__moduleOverrides__';
const REGEXP_NAME = /\[name\]/gi;
const REGEXP_OVERRIDE = /\[override\]/gi;

const schema = {
    type: 'object',
    properties: {
        overrides: {
            type: 'array',
            minItems: 1
        },
        outputPath: {
            type: 'string'
        }
    },
    required: ['overrides', 'outputPath']
};

const getReplacer = (value, allowEmpty) => {
    const fn = (match, ...args) => {
        // last argument in replacer is the entire input string
        const input = args[args.length - 1];
        if (value === null || value === undefined) {
            if (!allowEmpty)
                throw new Error(
                    `Path variable ${match} not implemented in this context: ${input}`
                );
            return "";
        } else {
            return `${value}`;
        }
    };
    return fn;
};

const itemToPlugin = (context, item, name) => {
    if (Array.isArray(item)) {
        return new MultiEntryPlugin(context, item, name);
    }
    return new SingleEntryPlugin(context, item, name);
};

function getModule(compilation, resource) {
    for(let i = 0, length = compilation.modules.length; i < length; i += 1) {
        if(compilation.modules[i].resource === resource) {
            return compilation.modules[i];
        }
    }
}

class ModuleOverrideWebpackPlugin {
    constructor(options) {
        validateOptions(schema, options, 'module-override-webpack-plugin');

        this.options = Object.assign({
            overrides: [],
            outputPath: '[name]/[override]',
            debug: false
        }, options);

        if(!this.options.outputPath.match(REGEXP_OVERRIDE)) {
            throw new Error('[module-override-webpack-plugin] Error: outputPath must contain [override] placeholder');
        }

        this.entryMap = {};
    }

    apply(compiler) {
        compiler.hooks.entryOption.tap(PLUGIN_NAME, (context, entry) => {
            if (typeof entry === "string" || Array.isArray(entry)) {
                this.addEntry(context, entry, '', compiler);
            } else if (typeof entry === "object") {
                for (const name of Object.keys(entry)) {
                    this.addEntry(context, entry[name], name, compiler);
                }
            } else if (typeof entry === "function") {
                throw new Error('Not implemented');
            }
        });

        compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
            compilation[NS] = {
                entryMap: this.entryMap
            };

            compilation.mainTemplate.hooks.bootstrap.tap(PLUGIN_NAME, (source, chunk, hash, moduleTemplate) => {
                moduleTemplate.hooks.content.tap(PLUGIN_NAME, (moduleSource, module, options, dependencyTemplates) => {
                    if(!compilation[LOADER_NS]) {
                        // compilation.errors.push(new Error(`[module-override-webpack-plugin] Error: plugin was used without module-override-loader`));
                    }
                    else {
                        if(compilation[LOADER_NS].overridesMap && compilation[LOADER_NS].overridesMap[module.resource] && compilation[LOADER_NS].overridesMap[module.resource][this.entryMap[options.chunk.name]]) {
                            const overrideResource = compilation[LOADER_NS].overridesMap[module.resource][this.entryMap[options.chunk.name]];
                            const overrideModule = getModule(compilation, overrideResource);

                            if(overrideModule) {
                                return overrideModule.source(dependencyTemplates, moduleTemplate.runtimeTemplate, moduleTemplate.type);
                            }
                        }
                    }


                    return moduleSource;
                });
            });

            compilation.hooks.childCompiler.tap(PLUGIN_NAME, (compiler) => {

                compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
                    compilation[NS] = {
                        entryMap: this.entryMap
                    };

                    compilation.mainTemplate.hooks.renderManifest.tap(PLUGIN_NAME, (result, { chunk }) => {
                        chunk._modules.forEach(module => {
                            if(!compilation[LOADER_NS]) {
                                // compilation.errors.push(new Error(`[module-override-webpack-plugin] Error: plugin was used without module-override-loader`));
                            }
                            else {
                                if (compilation[LOADER_NS].overridesMap && compilation[LOADER_NS].overridesMap[module.resource] && compilation[LOADER_NS].overridesMap[module.resource][this.entryMap[chunk.name]]) {
                                    const overrideModule = getModule(compilation, compilation[LOADER_NS].overridesMap[module.resource][this.entryMap[chunk.name]]);

                                    if (overrideModule) {
                                        chunk._modules.delete(module);
                                        chunk._modules.add(overrideModule);
                                    }
                                }
                            }
                        });
                    });
                })
            });
        });
    }

    getAssetName(name, override) {
        return this.options.outputPath
            .replace(REGEXP_NAME, getReplacer(name))
            .replace(REGEXP_OVERRIDE, getReplacer(override));
    }

    addEntry(context, entry, name, compiler) {
        for(let i = 0, length = this.options.overrides.length; i < length; i += 1) {
            const override = this.options.overrides[i];
            const overrideName = this.getAssetName(name, override);
            this.entryMap[overrideName] = override;

            compiler.apply(itemToPlugin(context, entry, overrideName));
        }
    }
}

export default ModuleOverrideWebpackPlugin;