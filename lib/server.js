#!/usr/bin/env node

var http = require('http');
var finalhandler = require('finalhandler');
var serveStatic = require('serve-static');

var serve = serveStatic(process.argv[2]);

server = http.createServer(function (req, res) {
    var done = finalhandler(req, res);
    serve(req, res, done);
});

server.listen(8000);

console.log('Listening on port 8000');
