var fs = require('fs-sync');
var path = require('path');
var spawn = require('child_process').spawn;

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
        .usage('[options] [dir]')
        .option('-c, --config', 'specify a balloon config')
        .option('-b, --build', 'build into [dir]')
        .option('-w, --watch [dir]', 'watch and serve [dir] for development')
        .parse(process.argv);

    var distPath = program.args.shift() || 'dist';
    var srcPath = program.watch || program.build || '.';

    if (program.build) { build(srcPath, distPath); }
    else if (program.watch) { watch(srcPath, distPath); }
    else { program.help(); }
};

function watch (srcPath, distPath) {
    console.log('watch: ' + srcPath + ' --> ' + distPath);
    build(srcPath, distPath, serve.bind(null, distPath));

    var watcher = chokidar.watch(srcPath, { ignored: /[\/\\]\./, persistent: true });
    watcher.on('change', function (path, stats) {
        console.log('\x1b[43m * \x1b[0m\033[1m change:\033[0m ' + path);
        build(srcPath, distPath, serve.bind(null, distPath));
    });
}

function serve (distPath) {
    try {
        server.kill('SIGHUP');
    } catch (e) {
        var foo = 'bar';
    }

    var cmd = __dirname + '/bin/serve';
    server = spawn('bin/serve', [ distPath ]);

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

function build (srcPath, distPath, callback) {
    setupDefaults();

    var staticSourcePath = path.join(srcPath, 'static');
    var staticDistPath = path.join(distPath);
    var config = getJSON(path.join(srcPath, 'config.json'));

    var templatesPath = path.join(srcPath, 'templates');
    var pagesPath = path.join(srcPath, 'pages');

    // Testing for now
    var pagePath = path.join(pagesPath, 'index.md');
    var layoutPath = path.join(templatesPath, 'layout.html');

    var html = renderPage(layoutPath, pagePath, config.baseContext);
    var minified = minify(html, { removeAttributeQuotes: true, collapseWhitespace: true });

    // First recreate the dist folder
    remakeDir(distPath);

    // Write HTML files
    write(path.join(distPath, 'index.html'), minified);
    mkdir(path.join(distPath, 'posts'));
    write(path.join(distPath, 'posts/index.html'), minified);

    // Copy static files over
    cp(staticSourcePath, staticDistPath);

    console.log('\033[44m ~ \033[0m\033[1m build:\033[0m  ' + srcPath + ' to ' + distPath);
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
    fs.write(path, str, { mode: mode || 0666 });
    console.log('\x1b[42m + \x1b[0m\033[1m mk:\033[0m     ' + path);
}

function cp (src, dest) {
    fs.copy(src, dest);
    console.log('\x1b[42m + \x1b[0m\033[1m cp:\033[0m     ' + src + ' > ' + dest);
}

function mkdir (path) {
    fs.mkdir(path);
    console.log('\x1b[42m + \x1b[0m\033[1m mkdir:\033[0m  ' + path);
}

function rmdir (path) {
    fs.remove(path)
    console.log('\x1b[41m - \x1b[0m\033[1m rmdir:\033[0m  ' + path);
}

function remakeDir (path, callback) {
    rmdir(path);
    mkdir(path);
}

function readFile (path) {
    return fs.read(path);
}

function renderPage (layoutPath, pagePath, context) {
    var pageMarkdown = swig.render(readFile(pagePath), { locals: context });

    context.body = marked(pageMarkdown);
    var html = swig.render(readFile(layoutPath), { locals: context });

    return html
}

function getJSON (path) {
    return fs.readJSON(path);
}
