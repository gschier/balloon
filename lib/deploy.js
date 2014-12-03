var s3 = require('s3');

module.exports = function (buildPath, domain) {
    var msg = 'deploying ' + buildPath + ' to S3 bucket ' + domain;
    console.log('\033[40m # \033[0m\033[1m deploy:\033[0m ' + msg);

    var key = process.env.AWS_ACCESS_KEY;
    var secret = process.env.AWS_SECRET_KEY;

    if (!key) { return console.log('Please set AWS_ACCESS_KEY in your environment'); }
    if (!secret) { return console.log('Please set AWS_SECRET_KEY in your environment'); }
    if (!domain) { return console.log('Please set domain in settings'); }

    var bucket = domain;

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
};
