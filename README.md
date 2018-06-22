# module-override-webpack-plugin
This plugin extends works with `module-override-loader` to load module overrides and compile additional builds.

## Install
```bash
npm install module-override-webpack-plugin module-override-loader --save-dev
```

## Usage

### Example
Let's say you imported `header.js` and you have `header.batman.js` and `header.superman.js` in same location.

```js
const ModuleOverrideWebpackPlugin = require('module-override-webpack-plugin');

module.exports = {
    entry: {
        main: 'src/app.js'
    },
    output: {
        path: 'dist/',
        filename: '[name]/script.js',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'module-override-loader',
                        options: {
                            overrides: ['batman', 'superman'],
                            pattern: '[name].[override].[ext]'
                        }
                    },
                    'babel-loader'
                ]
            }
        ]
    },
    plugins: [
        new ModuleOverrideWebpackPlugin({
            overrides: ['batman', 'superman'],
            outputPath: '[name]/overrides/[override]'
        })
    ]
}
```

Then you end up with this result:
```
dist/
-- main/
  -- script.js
  -- overrides/
    -- batman/
      -- script.js
    -- superman/
      -- script.js
```


