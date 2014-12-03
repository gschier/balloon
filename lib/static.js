var path = require('path');
var ncp = require('ncp');


module.exports = function (sourcePath, buildPath, callback) {
    var staticSourcePath = path.join(sourcePath, 'static');
    var staticDestinationPath = buildPath;

    ncp(staticSourcePath, staticDestinationPath, callback);
};
