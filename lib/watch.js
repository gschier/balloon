var chokidar = require('chokidar');
var path = require('path');

module.exports = function (sourcePath, buildPath, changedCallback) {
    var msg = sourcePath + ' --> ' + buildPath;
    console.log('\x1b[44m * \x1b[0m\033[1m watch:\033[0m ' + msg);

    changedCallback(null);

    var watcher = chokidar.watch(sourcePath, {
        ignored: function (p) {
            return p.indexOf(path.relative('./', buildPath)) === 0;
        },
        persistent: true, // Don't die
        ignoreInitial: true // Ignore initiall "add" events
    });

    var handleChange = function (event, path, stats) {
        console.log('\x1b[43m * \x1b[0m\033[1m ' + event + '\033[0m ' + path);
        changedCallback(null, path);
    };

    watcher.on('change', handleChange.bind(null, 'change:'));
    watcher.on('add', handleChange.bind(null, 'add:   '));
    watcher.on('unlink', handleChange.bind(null, 'delete:'));
};

