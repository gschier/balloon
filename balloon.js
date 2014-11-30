var fs = require('fs');
var path = require('path');
var extend = require('extend');

var program = require('commander');
var chokidar = require('chokidar');
var rimraf = require('rimraf');
var slug = require('slug');

var pkg = require('./package.json');

var watch = require('./lib/watch.js');
var render = require('./lib/render.js');
var serve = require('./lib/serve.js');
var static = require('./lib/static.js');

// Augment Date
require('date-utils');

/** MAIN ENTRYPOINT **/
module.exports.run = function () {
    program
        .version(pkg.version)
        .usage('[options] <BUILD_PATH>')
        .option('-s, --source <DIRECTORY>', 'source directory')
        .option('-w, --watch', 'watch and serve')
        .parse(process.argv);

    var CONFIG_PATH = 'balloon.json';
    var BALLOON_CONFIG = getConfig(CONFIG_PATH);

    var SOURCE_PATH = BALLOON_CONFIG.source;
    var BUILD_PATH = BALLOON_CONFIG.build;

    var CONTENT_PATH = path.join(SOURCE_PATH, 'content');

    if (program.watch && BUILD_PATH) {
        watch(SOURCE_PATH, BUILD_PATH, function (err, changedPath) {
            if (err) { return console.log('Failed to watch files:', err); }
            rimraf(BUILD_PATH, function (err) {
                if (err) { return console.log('Failed wipe build directory:', err); }

                var pagePaths = getPagePaths(path.join(SOURCE_PATH, CONTENT_PATH), '.');

                renderPages(BALLOON_CONFIG.defaults, CONTENT_PATH, BUILD_PATH, pagePaths, function (err) {
                    serve(BUILD_PATH);
                    static(SOURCE_PATH, BUILD_PATH, function (err) {
                        if (err) { return console.log('Failed to copy static files:', err); }
                        // Done
                    });
                });
            });
        });
    }

    else if (BUILD_PATH) {
        build(SOURCE_PATH, BUILD_PATH);
    }

    else {
        program.help();
    }
};

/**
 * For each page, render
 */
function renderPages (defaults, sourcePath, buildPath, pagePaths, callback) {
    var numFinished = 0;

    for (var i = 0; i < pagePaths.length; i++) {
        var pageFile = pagePaths[i];
        var pageExt = path.extname(pageFile);
        var pageTitle = path.basename(pageFile, pageExt);
        var pageSlug = slug(pageTitle.replace('–', '-')).toLowerCase();
        var pagePath = path.join(path.dirname(pageFile), pageSlug) + '.html';

        var pageConfig = {
            _path: pagePath,
            _file: pageFile
        };

        render(defaults, sourcePath, buildPath, pageConfig, function (err, content) {
            if (err) { return console.log('Failed to render', pageConfig._path, err); }

            // TODO: Use better way of detecting done
            if (++numFinished === pagePaths.length) {
                callback(null);
            }
        });
    }
}

/**
 * Recursively find all page paths
 */
function getPagePaths (basePath, childPath) {
    var filesInThisDir = [ ];

    var joinedPath = path.join(basePath, childPath);

    fs.readdirSync(joinedPath).forEach(function (filePath) {
        var fullPath = path.join(basePath, childPath, filePath);
        var relativePath = path.join(childPath, filePath);

        var stats = fs.statSync(fullPath);

        if (stats.isFile()) {
            filesInThisDir.push(relativePath);
        } else if (stats.isDirectory()) {
            var morePaths = getPagePaths(basePath, relativePath);
            filesInThisDir = filesInThisDir.concat(morePaths);
        }
    });
    return filesInThisDir;
}

/**
 * Get sanitized config with defaults
 */
function getConfig (configPath) {
    var config = JSON.parse(fs.readFileSync(configPath));

    return extend(true, {
        build: './build',
        source: './',
        defaults: { },
        pages: [ ]
    }, config);
}
