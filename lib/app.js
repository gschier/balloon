var fs = require('fs');serve
var pathJoin = require('path').join;
var spawn = require('child_process').spawn;

var fsSync = require('fs-sync');
var program = require('commander');
var swig = require('swig');
var extend = require('extend');
var marked = require('marked');
var highlight = require('highlight.js');
var minify = require('html-minifier').minify;
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var ncp = require('ncp');
var chokidar = require('chokidar');

var pkg = require('../package.json');
var server;


module.exports.run = function () {
    program
        .version(pkg.version)
        .usage('[options] <build_path>')
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

    var watcher = chokidar.watch(srcPath, { ignored: /[\/\\]\./, persistent: true });
    watcher.on('change', function (path, stats) {
        console.log('\x1b[43m * \x1b[0m\033[1m change:\033[0m ' + path);
        build(srcPath, buildPath, serve.bind(null, buildPath));
    });
}

function serve (buildPath) {
    if (server) { server.kill('SIGHUP'); }

    var cmd = __dirname + '/bin/serve';
    server = spawn('bin/serve', [ buildPath ]);

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

    var staticSourcePath = pathJoin(srcPath, 'static');
    var staticbuildPath = pathJoin(buildPath);
    var config = getJSON(pathJoin(srcPath, 'config.json'));

    var templatesPath = pathJoin(srcPath, 'templates');
    var pagesPath = pathJoin(srcPath, 'pages');

    // First recreate the build folder
    remakeDir(buildPath);

    var layoutPath = pathJoin(templatesPath, 'layout.html');

    var paths = getPagePaths(pagesPath);

    for (var i = 0; i < paths.length; i++) {
        var path = paths[i];

        // Remove the src dir from the path
        var pathWithoutSourceDir = path.replace(pathJoin(srcPath, '/pages'), '');

        // For each page, ensure the dirs exist
        var destPath = pathJoin(buildPath, pathWithoutSourceDir).replace(/\.[^.]*$/g, '');

        // Create the directory (if wasn't already)
        fsSync.mkdir(destPath);

        // Compile the things!
        var html = renderPage(layoutPath, path, config.baseContext);
        var minified = minify(html, { removeAttributeQuotes: true, collapseWhitespace: true });

        // Write HTML files
        write(pathJoin(destPath, 'index.html'), minified);
    }

    // Copy static files over
    cp(staticSourcePath, staticbuildPath);

    console.log('\033[44m ~ \033[0m\033[1m build:\033[0m  ' + srcPath + ' to ' + buildPath);
    callback && callback();
}

function getContext (baseContext, mergeContext) {
    return extend(true, baseContext || { }, mergeContext || { });
}

function setupDefaults () {
    marked.setOptions({
        renderer: new marked.Renderer(),
        highlight: function (code) {
            return highlight.highlightAuto(code).value;
        },
        gfm: true,
        tables: true,
        breaks: false,
        pedantic: false,
        sanitize: true,
        smartLists: true,
        smartypants: false
    });

    swig.setDefaults({ autoescape: false });

    ncp.clobber = true;
}

function write (path, str, mode) {
    fsSync.write(path, str, { mode: mode || 0666 });
    console.log('\x1b[42m + \x1b[0m\033[1m mk:\033[0m     ' + path);
}

function cp (src, dest) {
    fsSync.copy(src, dest);
    console.log('\x1b[42m + \x1b[0m\033[1m cp:\033[0m     ' + src + ' > ' + dest);
}

function mkdir (path) {
    fsSync.mkdir(path);
    console.log('\x1b[42m + \x1b[0m\033[1m mkdir:\033[0m  ' + path);
}

function rmdir (path) {
    fsSync.remove(path)
    console.log('\x1b[41m - \x1b[0m\033[1m rmdir:\033[0m  ' + path);
}

function remakeDir (path, callback) {
    rmdir(path);
    mkdir(path);
}

function readFile (path) {
    return fsSync.read(path);
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

function renderPage (layoutPath, pagePath, context) {
    var pageMarkdown = swig.render(readFile(pagePath), { locals: context });

    context.body = marked(pageMarkdown);
    var html = swig.render(readFile(layoutPath), { locals: context });

    return html
}

function getJSON (path) {
    return fsSync.readJSON(path);
}
