module.exports = {
    entry: "./webpack.entry.js",
    output: {
        path: __dirname,
        filename: "webpack.bundle.js"
    },
    /*module: {
        loaders: [
            { test: /\.css$/, loader: "style!css" }
        ]
    },*/
    devtool: 'source-map'
};