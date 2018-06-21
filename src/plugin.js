import path from 'path'
import {createHash} from 'crypto'
import {ConcatSource} from 'webpack-sources'
import loader from './loader';
import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin';
import MultiEntryPlugin from 'webpack/lib/MultiEntryPlugin';
import { ReplaceSource } from 'webpack-sources';

const PLUGIN_NAME = 'ModuleOverridePlugin';
const REGEXP_NAME = /\[name\]/gi;
const REGEXP_OVERRIDE = /\[override\]/gi;

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

class ModuleOverrideWebpackPlugin {
    constructor(options) {
        this.options = Object.assign({
            overrides: [],
            outputPath: '[name]/[override]',
            debug: false
        }, options);

        if(!this.options.outputPath.match(REGEXP_OVERRIDE)) {
            throw new Error('[webpack-module-override] Error: outputPath must contain [override] arg');
        }

        this.entryMap = {};
        // this.filePathRe = /WebpackMultiOutput-(.*?)-WebpackMultiOutput/;
        this.filePathRe = /\/\* __WebpackModuleOverride-(.*?)-__WebpackModuleOverride__ \*\//;
        this.filePathReG = /\/\* __WebpackModuleOverride-.*?-__WebpackModuleOverride__ \*\/([\S\s]*?)\/* __WebpackModuleOverride__ \*\//g;
        this.jsonpRe = /__WEBPACK_MULTI_OUTPUT_CHUNK_MAP__/;

        this.compilationContext = {
            overrides: this.options.overrides
        };
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
            compilation.__webpackModuleOverride__ = this.compilationContext;

            if (!this.options.overrides.length) {
                compilation.errors.push(new Error(`[webpack-multi-output] Error: option "overrides" must be an array of length >= 1`))
            }

            const getModule = (compilation, resource) => {
                for(let i = 0, length = compilation.modules.length; i < length; i += 1) {
                    if(compilation.modules[i].resource === resource) {
                        return compilation.modules[i];
                    }
                }
            };

            compilation.mainTemplate.hooks.bootstrap.tap(PLUGIN_NAME, (source, chunk, hash, moduleTemplate) => {
                moduleTemplate.hooks.content.tap(PLUGIN_NAME, (moduleSource, module, options, dependencyTemplates) => {
                    if(compilation.__webpackModuleOverride__.overridesMap && compilation.__webpackModuleOverride__.overridesMap[module.resource] && compilation.__webpackModuleOverride__.overridesMap[module.resource][this.entryMap[options.chunk.name]]) {
                        const overrideResource = compilation.__webpackModuleOverride__.overridesMap[module.resource][this.entryMap[options.chunk.name]];
                        const overrideModule = getModule(compilation, overrideResource);

                        if(overrideModule) {
                            return overrideModule.source(dependencyTemplates, moduleTemplate.runtimeTemplate, moduleTemplate.type);
                        }
                    }

                    return moduleSource;
                });
            });

            compilation.hooks.childCompiler.tap(PLUGIN_NAME, (compiler) => {

                compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
                    compilation.__webpackModuleOverride__ = this.compilationContext;

                    compilation.mainTemplate.hooks.renderManifest.tap(PLUGIN_NAME, (result, { chunk }) => {
                        const getModule = (compilation, resource) => {
                            for(let i = 0, length = compilation.modules.length; i < length; i += 1) {
                                if(compilation.modules[i].resource === resource) {
                                    return compilation.modules[i];
                                }
                            }
                        };

                        chunk._modules.forEach(module => {
                            if(compilation.__webpackModuleOverride__.overridesMap && compilation.__webpackModuleOverride__.overridesMap[module.resource] && compilation.__webpackModuleOverride__.overridesMap[module.resource][this.entryMap[chunk.name]]) {
                                const overrideModule = getModule(compilation, compilation.__webpackModuleOverride__.overridesMap[module.resource][this.entryMap[chunk.name]]);

                                if(overrideModule) {
                                    chunk._modules.delete(module);
                                    chunk._modules.add(overrideModule);
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

    getFilePath(string) {
        const match = string.match(this.filePathRe)

        return match ? match[1] : ''
    }
}

ModuleOverrideWebpackPlugin.loader = require.resolve('./loader');

export default ModuleOverrideWebpackPlugin;