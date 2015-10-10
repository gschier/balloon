var fs = require('fs');
var path = require('path');
var extend = require('extend');

var program = require('commander');
var chokidar = require('chokidar');
var rimraf = require('rimraf');
var slug = require('slug');
var sortBy = require('sort-by');

var pkg = require('./package.json');

var watch = require('./lib/watch.js');
var render = require('./lib/render.js');
var serve = require('./lib/serve.js');
var static = require('./lib/static.js');
var deploy = require('./lib/deploy.js');

var ARCHIVE_PAGES_REGEX = /(index.html|rss.xml)$/;
var BALLOON_CONFIG_PATH = 'balloon.json';

/** MAIN ENTRYPOINT **/
module.exports.run = function () {
    program
        .version(pkg.version)
        .usage('[options]')
        .option('-s, --serve [port]', 'watch and serve files')
        .option('-b, --build <path>', 'override build path')
        .option('-d, --deploy [domain]', 'deploy to S3')
        .parse(process.argv);

    var BALLOON_CONFIG = getConfig(BALLOON_CONFIG_PATH);

    var SOURCE_PATH = program.source || BALLOON_CONFIG.source;
    var BUILD_PATH = program.output || BALLOON_CONFIG.build;

    var CONTENT_PATH = path.join(SOURCE_PATH, 'content');

    if (program.deploy) {
        var domain = typeof(program.deploy) === 'string' ? program.deploy : BALLOON_CONFIG.domain;
        deploy(BUILD_PATH, domain);
    } else if (program.serve && BUILD_PATH) {
        rimraf(BUILD_PATH, function (err) {
            if (err) { return console.log('Failed wipe build directory:', err); }

            watch(SOURCE_PATH, BUILD_PATH, function (err, changedPath) {
                if (err) { return console.log('Failed to watch files:', err); }

                // Reload the things
                // TODO: Move this somewhere else
                BALLOON_CONFIG = getConfig(BALLOON_CONFIG_PATH);
                SOURCE_PATH = program.source || BALLOON_CONFIG.source;
                BUILD_PATH = program.output || BALLOON_CONFIG.build;
                CONTENT_PATH = path.join(SOURCE_PATH, 'content');

                var pagePaths;

                // Only static was changed. Don't render again
                if (changedPath && changedPath.match(/^static\/.*/)) {
                    pagePaths = null;
                }

                // Single content file was changed that isn't an archive file (ex: index.html)
                else if (
                    changedPath &&
                    changedPath.match(CONTENT_PATH) &&
                    !changedPath.match(ARCHIVE_PAGES_REGEX)
                ) {
                    pagePaths = [ path.relative(CONTENT_PATH, changedPath) ];
                }

                // No specific file changed. Compile all again.
                else {
                    pagePaths = getPagePaths(path.join(SOURCE_PATH, CONTENT_PATH), '.');
                }

                renderPages(BALLOON_CONFIG.defaults, CONTENT_PATH, BUILD_PATH, pagePaths, function (err) {
                    var port = parseInt(program.serve, 10);
                    serve(BUILD_PATH, port);
                    static(SOURCE_PATH, BUILD_PATH, function (err) {
                        if (err) { return console.log('Failed to copy static files:', err); }
                        // Done
                    });
                });
            });
        });
    }

    else if (BUILD_PATH) {
        var pagePaths = getPagePaths(path.join(SOURCE_PATH, CONTENT_PATH), '.');

        var msg = SOURCE_PATH + ' --> ' + BUILD_PATH;
        console.log('\x1b[45m * \x1b[0m\033[1m build:\033[0m ' + msg);

        rimraf(BUILD_PATH, function (err) {
            if (err) { return console.log('Failed wipe build directory:', err); }

            renderPages(BALLOON_CONFIG.defaults, CONTENT_PATH, BUILD_PATH, pagePaths, function (err) {
                static(SOURCE_PATH, BUILD_PATH, function (err) {
                    if (err) { return console.log('Failed to copy static files:', err); }
                    // Done
                });
            });
        });
    }

    else {
        program.help();
    }
};

/**
 * For each page, render
 */
function renderPages (defaults, sourcePath, buildPath, pagePaths, callback) {
    var pageCount = 0;
    var allPageConfigs = [ ];
    var lastPages = [ ];

    var extensionMap = { '.md': '.html' };

    if (!pagePaths || pagePaths.length === 0) { return callback(null); }

    for (var i = 0; i < pagePaths.length; i++) {
        var pageFile = pagePaths[i];
        var pageExt = path.extname(pageFile);
        var pageTitle = path.basename(pageFile, pageExt);
        var pageSlug = slug(pageTitle.replace('–', '-')).toLowerCase();
        var pagePath = '/' + path.join(path.dirname(pageFile), pageSlug) + (extensionMap[pageExt] || pageExt);

        var pageConfig = {
            _path: pagePath,
            _file: pageFile,
            _ext: pageExt,
            _slug: pageSlug,
            _created: extractDateFromPath(pagePath)
        };

        if (pagePath.match(ARCHIVE_PAGES_REGEX)) {
            lastPages.push(pageConfig);
            continue;
        } else {
            // This is a content page
            pageCount++;
            pageConfig._title = pageTitle;
        }
        render(defaults, sourcePath, buildPath, pageConfig, null, function (err, localPageConfig) {
            if (err) { return console.log('Failed to render', pageConfig._path, err); }

            allPageConfigs.push(localPageConfig);

            // TODO: Use better way of detecting done
            // TODO: This is such a mess
            if (--pageCount === 0) {
                numFinished = 0;

                allPageConfigs.sort(sortBy('_created.timestamp'));

                for (var j = 0; j < lastPages.length; j++) {

                    render(defaults, sourcePath, buildPath, lastPages[j], allPageConfigs, function (err, pageConfig) {
                        if (err) { return console.log('Failed to render', pageConfig._path, err); }
                        if (++numFinished === lastPages.length) {
                            callback(null);
                        }
                    });
                }
                if (lastPages.length === 0) {
                    callback(null);
                }
            }
        });
    }
}

function extractDateFromPath (path) {
    var match = path.match(/\/([0-9]{2,4})\/([0-9]{1,2})\/([0-9]{1,2})\/?/);

    if (match) {

        var year = parseInt(match[1], 10);
        var month = parseInt(match[2], 10);
        var day = parseInt(match[3], 10);

        var d = new Date(year, month - 1, day);

        var created = {
            timestamp: d.getTime(),
            year: year,
            month: month,
            day: day
        };

        return created;
    }

    return null;
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
