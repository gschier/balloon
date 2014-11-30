var extend = require('extend');
var fs = require('fs');
var path = require('path');
var marked = require('marked');
var mkdirp = require('mkdirp');
var swig = require('swig');

/**
 * Render a page
 */
module.exports = function (defaults, sourcePath, buildPath, page, callback) {
    setupDefaults();

    var pageConfig = getPageConfig(page, defaults);

    var layoutPath = path.join('layouts', pageConfig._layout);
    var templatePath = path.join(sourcePath, pageConfig._file);

    // console.log(pageConfig);
    // DEBUG
    // var debug = JSON.parse(JSON.stringify(pageConfig));
    // delete debug._content;
    // delete debug.socialIcons;
    // delete debug.header;
    // console.log(debug);
    // console.log('');

    renderPage(layoutPath, templatePath, pageConfig, function (err, content) {
        if (err) { return callback(err); }
        var fullPath = path.join(buildPath, pageConfig._path);
        writePage(fullPath, content, callback);
    });
};

function writePage (fullPath, content, callback) {
    mkdirp(path.dirname(fullPath), function (err) {
        if (err) { return callback(err); }
        fs.writeFile(fullPath, content, callback);
    });
}

/**
 * Get fully-qualified context with fallbacks cascaded (from config)
 */
function getPageConfig (page, defaults) {
    var finalPage = { };

    var _render = function (page, context) {
        return JSON.parse(
            swig.render(JSON.stringify(page), { locals: context })
        );
    };

    // Get context based on defaults in config (top to bottom)
    for (var pattern in defaults) {

        // Need to copy the final page becuse extend modifies first arg (UHG)
        // NOTE: This may produce bugs because we're merging the page into each step. Should
        //       figure out how to remove the last `page` argument.
        var finalPageCopy = extend({ }, finalPage);
        var localPage = extend(true, finalPageCopy, defaults[pattern], page);

        // Render defaults with the defaults so far
        // Render twice so we can support nested renders
        localPage = _render(localPage, localPage);
        localPage = _render(localPage, localPage);

        // Replace finalPage with this if it matches the regex pattern
        var re = RegExp(pattern);
        if (localPage._path.match(re)) {
            finalPage = localPage;
        }
    }

    return finalPage;
}

/**
 * Actually render the page
 */
function renderPage (layoutPath, templatePath, pageConfig, callback) {
    var layout = String(fs.readFileSync(layoutPath));
    var template = String(fs.readFileSync(templatePath));

    var templateExtension = path.extname(templatePath);

    var templateBody = swig.render(template, { locals: pageConfig });

    if (templateExtension === '.md') {
        marked(templateBody, function (err, content) {
            if (err) { return callback(err); }

            pageConfig._content = content;
            return callback(null, swig.render(layout, { locals: pageConfig }));
        });
    } else {
        pageConfig._content = templateBody;
        return callback(null, swig.render(layout, { locals: pageConfig }));
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
}
