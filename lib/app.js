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
var ncp = require('ncp');
var chokidar = require('chokidar');
var s3 = require('s3');
var knox = require('knox');

var pkg = require('../package.json');
var server;

var key = 'KEY';
var secret = 'SECRET';
var bucket = 'BUCKET';

// Augment Date
require('date-utils');


module.exports.run = function () {
    program
        .version(pkg.version)
        .usage('[options] <build_path>')
        .option('-s, --source <dir>', 'source directory')
        .option('-w, --watch', 'watch and serve')
        .option('-d, --deploy', 'deploy')
        .parse(process.argv);

    var buildPath = program.args.shift();
    var sourcePath = program.source || '.';

    if (program.deploy) {
        if (buildPath && sourcePath) { deploy(sourcePath, buildPath); }
        else { system.exit(1); }
    } else if (program.redirects) {
        if (sourcePath && buildPath) { setRedirects(sourcePath, buildPath); }
        else { system.exit(1); }
    }
    else if (program.watch && buildPath) { watch(sourcePath, buildPath); }
    else if (buildPath) { build(sourcePath, buildPath); }
    else { program.help(); }
};

function watch (sourcePath, buildPath) {
    console.log('watch: ' + sourcePath + ' --> ' + buildPath);
    build(sourcePath, buildPath, serve.bind(null, buildPath));

    var watcher = chokidar.watch(sourcePath, {
        ignored: function (path) {
            return path.indexOf(pathHelper.relative('./', buildPath)) === 0;
        },
        persistent: true, // Don't die
        ignoreInitial: true // Ignore initiall "add" events
    });

    var handleChange = function (event, path, stats) {
        console.log('\x1b[43m * \x1b[0m\033[1m ' + event + '\033[0m ' + path);
        build(sourcePath, buildPath, serve.bind(null, buildPath));
    };

    watcher.on('change', handleChange.bind(null, 'change:'));
    watcher.on('add', handleChange.bind(null, 'add:   '));
    watcher.on('unlink', handleChange.bind(null, 'delete:'));
}

function serve (buildPath) {
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
}

function build (sourcePath, buildPath, callback) {
    setupDefaults();

    var staticSourcePath = pathHelper.join(sourcePath, 'static');
    var staticbuildPath = pathHelper.join(buildPath);
    var config = getJSON(pathHelper.join(sourcePath, 'config.json'));

    var templatesPath = pathHelper.join(sourcePath, 'templates');
    var pagesPath = pathHelper.join(sourcePath, 'content');

    // First recreate the build folder
    remakeDir(buildPath);

    var paths = getPagePaths(pagesPath);

    paths.sort();

    var next = function (allPages) {
        // We are done, so do cleanup
        if (allPages.length >= paths.length) {
            // Copy static files over
            ncp(staticSourcePath, staticbuildPath, function (err) {
                if (err) {
                    console.error('Failed to copy static dir', err);
                } else {
                    console.log( '\033[44m ~ \033[0m\033[1m built:\033[0m  ' +
                        paths.length + ' files ' + sourcePath + ' to ' + buildPath);
                    if (typeof callback === 'function') { callback(); }
                }
            });
            return;
        }

        // Do next path
        var path = paths[allPages.length];

        // For each page, ensure the dirs exist
        var relativeBuildPath = path.replace(pathHelper.join(sourcePath, '/content'), '');
        var fullBuildPath = pathHelper.join(buildPath, relativeBuildPath);

        var outputDirectoryPath = pathHelper.dirname(fullBuildPath);
        var ext = pathHelper.extname(fullBuildPath);
        var pageTitle = pathHelper.basename(fullBuildPath, ext);
        var buildExt = ext === '.md' ? '.html' : ext;
        var outputFileName = slug(pageTitle.replace('–', '-')).toLowerCase() + buildExt;
        var urlPath = pathHelper.join(pathHelper.dirname(relativeBuildPath), outputFileName);

        // Generate base context based on config file
        var baseContext = getContextForPath(urlPath, config);
        // console.log('CONTEXT', urlPath, baseContext);
        //
        var layoutPath = pathHelper.join(templatesPath, baseContext.layout);

        // Set some things on the context
        var pageContext = baseContext;
        pageContext.now = new Date();
        pageContext.page = pageContext.page || { };
        pageContext.page.title = outputFileName === 'index.html' ? pageContext.page.title : pageTitle;
        pageContext.page.date = extractDateFromPath(outputDirectoryPath);
        pageContext.page.fileName = outputFileName;
        pageContext.page.urlPath = urlPath;
        pageContext.allPages = allPages;

        // console.log('built', pageContext.page.urlPath, allPages.length);

        // Create the directory (if wasn't already)
        fsSync.mkdir(outputDirectoryPath);

        // Compile the things!
        (function (p, odp, ofn, ctx) {
            renderPage(layoutPath, p, ctx, function (err, content) {
                if (err) { return console.error('failed to render', err); }

                if (ctx.compress) {
                    content = minify(content, {
                        removeAttributeQuotes: true,
                        collapseWhitespace: true
                    });
                }

                // Write HTML files
                write(pathHelper.join(odp, ofn), content);

                allPages.push(ctx.page);

                next(allPages);
            });
        }(path, outputDirectoryPath, outputFileName, pageContext));
    };

    next([ ]);

}

function deploy (sourcePath, buildPath) {
    console.log('Uploading', buildPath, 'to S3');

    var client = s3.createClient({
      maxAsyncS3: 20,     // this is the default
      s3RetryCount: 3,    // this is the default
      s3RetryDelay: 1000, // this is the default
      multipartUploadThreshold: 20971520, // this is the default (20 MB)
      multipartUploadSize: 15728640, // this is the default (15 MB)
      s3Options: {
        accessKeyId: key,
        secretAccessKey: secret,
        // any other options are passed to new AWS.S3()
        // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
      },
    });
    var params = {
      localDir: buildPath,
      deleteRemoved: false,
      s3Params: {
        Bucket: bucket,
        Prefix: '',
        // other options supported by putObject, except Body and ContentLength.
        // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
      },
    };
    var uploader = client.uploadDir(params);
    var lastProgress = 0;
    uploader.on('error', function(err) {
      console.error('unable to sync:', err.stack);
    });
    uploader.on('progress', function() {
        var progress = parseInt(uploader.progressAmount, 10);
        if (progress !== lastProgress) {
            console.log('progress', parseInt(progress / uploader.progressTotal * 100, 10) + '%');
            lastProgress = uploader.progressAmount;
        }
    });
    uploader.on('end', function() {
        console.log("done uploading");
        // deployRedirects(sourcePath);
    });
}

function deployRedirects (sourcePath) {
    s3Config = fsSync.readJSON(pathHelper.join(sourcePath, 's3.json'));

    if (!s3Config.redirects) { return; }

    var client = knox.createClient({
        key: key,
        secret: secret,
        bucket: bucket
    });

    for (var i = 0; i < s3Config.redirects.length; i++) {
        var redirect = s3Config.redirects[i];
        var fromPath = redirect.from;
        var toPath = redirect.to;
        var req = client.put(fromPath, {
            'Content-Length': 0,
            'Content-Type': 'text/plain',
            'x-amz-website-redirect-location': toPath
        });
        req.on('response', function(res){
          if (200 == res.statusCode) {
            console.log('saved to %s', req.url);
          }
        });
        req.end();
    }
}

function getContextForPath (path, config) {
    if (!config.context) { return { }; }

    var context = { };
    for (var pathMatch in config.context) {
        var re = RegExp(pathMatch);
        if (path.match(re)) {
            context = extend(true, context, config.context[pathMatch]);
        }
    }
    return context;
}

function extractDateFromPath (path) {
    var date = null;

    var match = path.match(/\/([0-9]{2,4})\/([0-9]{1,2})\/([0-9]{1,2})\/?/);

    if (match) {
        date = new Date(0);
        date.setYear(parseInt(match[1], 10));
        date.setMonth(parseInt(match[2], 10) - 1);
        date.setDate(parseInt(match[3], 10));
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
        marked(pageRendered, function(err, content) {
            if (err) { return callback(err); }

            context.page.content = content;
            callback(err, swig.render(readFile(layoutPath), { locals: context }));
        });
    } else {
        context.page.content = pageRendered;
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
