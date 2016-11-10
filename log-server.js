var http = require('http');
var sockjs = require('sockjs');
var fs = require('fs');
var player = require('play-sound')();
var msgpack = require('msgpack5')({forceFloat64:true});
var zlib = require('zlib');
var moment = require('moment');

function write2file(filename, data) {
    try {
        fs.writeFileSync(filename, data);
        console.log("log written to: " + filename);
    } catch (e) {
        console.log("write to " + filename + "failed!");
        console.log(e.message);
        player.play('error.wav');
    }
}

var socket = sockjs.createServer({ sockjs_url: 'http://localhost:8080/bower_components/sockjs-client/dist/sockjs.js' });
socket.on('connection', function(conn) {
    console.log('new connection from ' + conn.remoteAddress);
    var filename = null;
    conn.on('data', function(msg) {
        if (msg.startsWith('__setFilename')) {
            if (msg.length < 15) {
                console.log('error: missing argument: ' + msg);
                player.play('error.wav');
            } else {
                filename = msg.substring(14);
                console.log('set filename to: ' + filename);
            }
        } else if (msg.startsWith('__loadLog')) {
            // filename = "logs/11/1-O/2016-08-18_17.50.56.json";
            filename = "logs/3/1-O/2016-08-18_14.54.24.json";
            conn.write(fs.readFileSync(filename));
        } else {
            if (!filename) {
                filename = "logs/last/" + moment().format('YYYY-MM-DD_HH.mm.ss');
                console.log("error: no filename provided => using: " + filename);
            }
            // if (filename.search('msgpack')) {
            //     var t = msgpack.decode(msg);
            //     console.log(JSON.stringify(t));
            // }
            write2file(filename + ".json", msg);
            const m = msgpack.encode(JSON.parse(msg));
            write2file(filename + ".msgpack", m);
            write2file(filename + ".json.zip", zlib.gzipSync(msg));
            write2file(filename + ".msgpack.zip", zlib.gzipSync(m));
        }
        //conn.write(message);
    });
    conn.on('close', function() {
        console.log('connection closed');
    });
});

var server = http.createServer();
socket.installHandlers(server, {prefix:'/log-server'});
server.listen(9999, '0.0.0.0');