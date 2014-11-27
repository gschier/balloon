var extend = require('extend');
var fs = require('fs');
var path = require('path');
var swig = require('swig');

/**
 * Render a page
 */
module.exports = function (config, page, callback) {
    var pageConfig = getPageConfig(page, config.defaults);

    console.log('PAGE CONFIG', pageConfig);
    return callback(null, '<html>TODO</html>');

    var layoutPath = path.join(config.source, pageConfig.layout);
    var layout = fs.readFileSync(layoutPath);

    var templatePath = path.join(config.source, pageConfig.file);
    var template = fs.readFileSync(templatePath);

    var content = renderPage(layout, template, pageConfig);
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
