var fs = require('fs');
var pathHelper = require('path');
var spawn = require('child_process').spawn;

var fsSync = require('fs-sync');
var ncp = require('ncp');
var slug = require('slug');
var program = require('commander');
var swig = require('swig');
var extend = require('extend');
var marked = require('marked');
var minify = require('html-minifier').minify;
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var ncp = require('ncp');
var chokidar = require('chokidar');

var pkg = require('../package.json');
var server;

// Augment Date
require('date-utils');


module.exports.run = function () {
    program
        .version(pkg.version)
        .usage('[options]')
        .option('-d, --destination [dir]', 'build directory')
        .option('-s, --source [dir]', 'source directory')
        .option('-w, --watch', 'watch and serve')
        .parse(process.argv);

    var buildPath = program.args.shift();
    var srcPath = program.source || '.';

    if (program.watch && buildPath) { watch(srcPath, buildPath); }
    else if (buildPath) { build(srcPath, buildPath); }
    else { program.help(); }
};

function watch (srcPath, buildPath) {
    console.log('watch: ' + srcPath + ' --> ' + buildPath);
    build(srcPath, buildPath, serve.bind(null, buildPath));

    var watcher = chokidar.watch(srcPath, {
        ignored: function (path) {
            return path.indexOf(pathHelper.relative('./', buildPath)) === 0;
        },
        persistent: true, // Don't die
        ignoreInitial: true // Ignore initiall "add" events
    });

    var handleChange = function (event, path, stats) {
        console.log('\x1b[43m * \x1b[0m\033[1m ' + event + '\033[0m ' + path);
        build(srcPath, buildPath, serve.bind(null, buildPath));
    };

    watcher.on('change', handleChange.bind(null, 'change:'));
    watcher.on('add', handleChange.bind(null, 'add:   '));
    watcher.on('unlink', handleChange.bind(null, 'delete:'));
}

function serve (buildPath) {
    if (server) { server.kill('SIGHUP'); }

    server = spawn('balloon-server', [ buildPath ]);

    server.stdout.on('data', function (data) {
        process.stdout.write('\033[40m # \033[0m\033[1m server:\033[0m ' + data);
    });

    server.stderr.on('data', function (data) {
        process.stdout.write('\033[40m # \033[0m\033[1m server:\033[0m err  ' + data);
    });

    server.on('error', function (code, signal) {
        process.stdout.write('\033[40m # \033[0m\033[1m server:\033[0m error ' + code);
    });
}

function build (srcPath, buildPath, callback) {
    setupDefaults();

    var staticSourcePath = pathHelper.join(srcPath, 'static');
    var staticbuildPath = pathHelper.join(buildPath);
    var config = getJSON(pathHelper.join(srcPath, 'config.json'));

    var templatesPath = pathHelper.join(srcPath, 'templates');
    var pagesPath = pathHelper.join(srcPath, 'content');

    // First recreate the build folder
    remakeDir(buildPath);

    var layoutPath = pathHelper.join(templatesPath, 'layout.html');

    var allPages = [ ];
    var paths = getPagePaths(pagesPath);
    paths.sort();

    for (var i = 0; i < paths.length; i++) {
        var path = paths[i];

        // For each page, ensure the dirs exist
        var relativeBuildPath = path.replace(pathHelper.join(srcPath, '/content'), '');
        var fullBuildPath = pathHelper.join(buildPath, relativeBuildPath);

        var outputDirectoryPath = pathHelper.dirname(fullBuildPath);
        var ext = pathHelper.extname(fullBuildPath);
        var pageTitle = pathHelper.basename(fullBuildPath, ext);
        var outputFileName = slug(pageTitle.replace('–', '-')).toLowerCase() + '.html';

        // Set some things on the context
        var pageContext = JSON.parse(JSON.stringify(config.baseContext));
        pageContext.page = pageContext.page || { };
        pageContext.page.title = outputFileName === 'index.html' ? null : pageTitle;
        pageContext.page.date = extractDateFromPath(outputDirectoryPath);
        pageContext.page.fileName = outputFileName;
        pageContext.page.urlPath = pathHelper.dirname(relativeBuildPath) + '/' + outputFileName;

        allPages.push(pageContext.page);
        pageContext.allPages = allPages;

        // Create the directory (if wasn't already)
        fsSync.mkdir(outputDirectoryPath);

        // Compile the things!
        (function (p, odp, ofn, ctx) {
            renderPage(layoutPath, p, ctx, function (err, html) {
                if (err) { return console.error('failed to render', err); }
                var minified = minify(html, {
                    removeAttributeQuotes: true,
                    collapseWhitespace: true
                });

                // Write HTML files
                write(pathHelper.join(odp, ofn), minified);
            });
        }(path, outputDirectoryPath, outputFileName, pageContext));
    }

    // Copy static files over
    ncp(staticSourcePath, staticbuildPath, function (err) {
        if (err) {
            console.error('Failed to copy static dir', err);
        } else {
            console.log( '\033[44m ~ \033[0m\033[1m built:\033[0m  ' +
                paths.length + ' files ' + srcPath + ' to ' + buildPath);
            callback && callback();
        }
    });

}

function getContext (baseContext, mergeContext) {
    return extend(true, baseContext || { }, mergeContext || { });
}

function extractDateFromPath (path) {
    var date = null;

    var match = path.match(/\/([0-9]{2,4})\/([0-9]{1,2})\/([0-9]{1,2})\/?/);

    if (match) {
        date = new Date(0);
        date.setYear(match[1]);
        date.setMonth(match[2]);
        date.setDate(match[3]);
    }

    return date;
}

function write (path, str, mode) {
    fsSync.write(path, str, { mode: mode || 0666 });
    // console.log('\x1b[42m + \x1b[0m\033[1m mk:\033[0m     ' + path + ' : ' + str.length / 1000 + ' kB');
}

function mkdir (path) {
    fsSync.mkdir(path);
    // console.log('\x1b[42m + \x1b[0m\033[1m mkdir:\033[0m  ' + path);
}

function rmdir (path) {
    fsSync.remove(path)
    // console.log('\x1b[41m - \x1b[0m\033[1m rmdir:\033[0m  ' + path);
}

function remakeDir (path, callback) {
    rmdir(path);
    mkdir(path);
}

function readFile (path) {
    return fsSync.read(path);
}

function getJSON (path) {
    return fsSync.readJSON(path);
}

function getPagePaths (path) {
    var filesInThisDir = [ ];
    fs.readdirSync(path).forEach(function (file) {
        var stats = fs.statSync(path + '/' + file);
        if (stats.isFile()) {
            filesInThisDir.push(path + '/' + file);
        } else if (stats.isDirectory()) {
            filesInThisDir = filesInThisDir.concat(getPagePaths(path + '/' + file));
        }
    });
    return filesInThisDir;
}

function renderPage (layoutPath, pagePath, context, callback) {
    var ext = pathHelper.extname(pagePath);
    var pageRendered = swig.render(readFile(pagePath), { locals: context });

    if (ext === '.md') {
        context.body = marked(pageRendered, function(err, body) {
            if (err) { return callback(err); }

            context.body = body;

            var html = swig.render(readFile(layoutPath), { locals: context });
            callback(err, html);
        });
    } else {
        context.body = pageRendered;
        callback(null, swig.render(readFile(layoutPath), { locals: context }));
    }
}

function setupDefaults () {
    marked.setOptions({
        renderer: new marked.Renderer(),
        highlight: function (code, lang, callback) {
            require('pygmentize-bundled')({
                lang: lang,
                format: 'html'
            }, code, function (err, result) {
                callback(err, result.toString());
            });
        },
        gfm: true,
        tables: true,
        breaks: false,
        pedantic: false,
        sanitize: false,
        smartLists: true,
        smartypants: false
    });

    swig.setDefaults({ autoescape: false });

    ncp.clobber = true;
}
