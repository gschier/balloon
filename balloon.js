var fs = require('fs');
var path = require('path');
var extend = require('extend');

var program = require('commander');
var chokidar = require('chokidar');

var pkg = require('./package.json');

var watch = require('./lib/watch.js')
var render = require('./lib/render.js')
var serve = require('./lib/serve.js')

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

    var BUILD_PATH = program.args.shift();
    var SOURCE_PATH = program.source || '.';

    var CONFIG_PATH = path.join(SOURCE_PATH, 'balloon.json');
    var BALLOON_CONFIG = getConfig(CONFIG_PATH);

    if (program.watch && BUILD_PATH) {
        watch(SOURCE_PATH, BUILD_PATH, function (changedPath) {
            renderPages(BALLOON_CONFIG);
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
function renderPages (config) {
    var defaults = config.defaults;
    var pages = config.pages;

    for (var i = 0; i < pages.length; i++) {
        render(defaults, pages[i], function (err, content) {
            // console.log('RENDERED PAGE', content);
        });
    }
};

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
