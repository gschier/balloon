var spawn = require('child_process').spawn;
var server;

module.exports = function (buildPath) {
    if (server) { server.kill('SIGHUP'); }

    server = spawn('balloon-server', [ buildPath, 3000 ]);

    server.stdout.on('data', function (data) {
        process.stdout.write('\033[40m # \033[0m\033[1m server:\033[0m ' + data);
    });

    server.stderr.on('data', function (data) {
        process.stdout.write('\033[40m # \033[0m\033[1m server:\033[0m err  ' + data);
    });

    server.on('error', function (code, signal) {
        process.stdout.write('\033[40m # \033[0m\033[1m server:\033[0m error ' + code);
    });
};
