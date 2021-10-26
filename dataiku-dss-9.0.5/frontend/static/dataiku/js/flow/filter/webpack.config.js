const Uglify = require("uglifyjs-webpack-plugin");

module.exports =
    {
        context: __dirname + "/compiled-js",
        entry: "./suggester",
        output: {
            path: __dirname + "/dist",
            filename: 'flow-filter-bundle.js',
            libraryTarget: 'var',
            library: 'FlowFilterParser'
        },
        plugins: [new Uglify({sourceMap: false})]
    };
