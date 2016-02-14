module.exports = {
    entry: "./webpack/entry.js",
    output: {
        path: __dirname,
        filename: "./webpack/bundle.js"
    },
    module: {
        loaders: [
            /*{ test: /js\/.*\.js$/, exclude: /node_modules|bower_components|js\/lib/, loader: "babel-loader"}*/
            /*{ test: /city3|terrain\.js/, loader: "babel-loader"}*/
            /*{ test: /\.css$/, loader: "style!css" }*/
        ]
    },
    devtool: 'source-map'
};