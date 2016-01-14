var chokidar = require('chokidar');
var path = require('path');

module.exports = function (sourcePath, buildPath, changedCallback) {
    var msg = sourcePath + ' --> ' + buildPath;
    console.log('\x1b[44m * \x1b[0m\033[1m watch:\033[0m ' + msg);

    changedCallback(null);

    var fullPath = path.relative('./', sourcePath);
    var watcher = chokidar.watch(path.resolve(fullPath), {
        ignored: function (p) {
            if (typeof p !== 'string') { return; }

            var buildDirectory = path.resolve(buildPath);

            var isBuild = p.indexOf(buildDirectory) === 0;
            var isHidden = p.match(/[\/\\]\./) != null;

            return isBuild || isHidden;
        },
        persistent: true, // Don't die
        ignoreInitial: true // Ignore initial "add" events
    });

    var handleChange = function (event, p, stats) {
        var relativePath = path.relative('.', p);
        console.log('\x1b[43m * \x1b[0m\033[1m ' + event + '\033[0m ' + relativePath);
        changedCallback(null, relativePath);
    };

    watcher.on('change', handleChange.bind(null, 'change:'));
    watcher.on('add', handleChange.bind(null, 'add:   '));
    watcher.on('unlink', handleChange.bind(null, 'delete:'));
};

