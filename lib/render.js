var extend = require('extend');
var fs = require('fs');
var path = require('path');
var nunjucks = new require('nunjucks').Environment();

/**
 * Render a page
 */
module.exports = function (config, page, callback) {
    var pageConfig = getPageConfig(page, config.defaults);

    var layoutPath = path.join(config.source, pageConfig._layout);
    var templatePath = path.join(config.source, pageConfig._file);

    renderPage(layoutPath, templatePath, pageConfig, callback);
}

/**
 * Get fully-qualified context with fallbacks cascaded (from config)
 */
function getPageConfig (page, defaults) {
    var finalPage = { };

    var _render = function (page, context) {
        return JSON.parse(
            nunjucks.renderString(JSON.stringify(page), context)
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
    var templateBody = nunjucks.renderString(template, pageConfig);

    if (templateExtension === '.md') {
        marked(templateBody, function (err, content) {
            if (err) { return callback(err); }

            pageConfig._content = content;
            callback(err, nunjucks.renderString(layout, pageConfig));
        });
    } else {
        pageConfig._content = templateBody;
        callback(null, nunjucks.renderString(layout, pageConfig));
    }
}

nunjucks.addFilter('dateFormat', function(str, count) {
    return str.slice(0, count || 5);
});

