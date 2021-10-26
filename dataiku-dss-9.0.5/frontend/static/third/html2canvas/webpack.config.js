const Uglify = require("uglifyjs-webpack-plugin");

module.exports =
    {
        entry: "./entry.js",
        context: __dirname,
        output: {
            path: __dirname,
            filename: 'html2canvas_1.0.0-alpha.10.js',
            libraryTarget: 'var',
            library: 'html2canvas_latest'
        },
        plugins: [new Uglify({sourceMap: false})]
    };
