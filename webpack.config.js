// var path = require("path");
var CommonsChunkPlugin = require("webpack/lib/optimize/CommonsChunkPlugin");
module.exports = {
    entry: {
        "static": ["./js/webpack/static.js"],
        "bundle": "./js/webpack/entry.js"
    },
    output: {
        //path: path.resolve(__dirname, 'webpack'),
        filename: "webpack/[name].js"
        //publicPath: 'http://localhost:8080/webpack'
    },
    module: {
        loaders: [
            /*{ test: /js\/.*\.js$/, exclude: /node_modules|bower_components|js\/lib/, loader: "babel-loader"}*/
            /*{ test: /city3|terrain\.js/, loader: "babel-loader"}*/
            /*{ test: /\.css$/, loader: "style!css" }*/
        ]
    },
    devtool: 'cheap-module-source-map',
    //deubg: true,
    plugins: [
        new CommonsChunkPlugin({
          names: ["static"],

          // filename: "vendor.js"
          // (Give the chunk a different name)

          minChunks: Infinity
          // (with more entries, this ensures that no other module
          //  goes into the vendor chunk)
        })        
    ]
};