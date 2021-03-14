var express = require('express');
var router = express.Router();

var awskey = 'AKIA3SWAVHGBVCTRO7GX';
var awssecretkey = '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';
var awsregion = 'us-east-1';
var AWS = require('aws-sdk');
AWS.config.update({accessKeyId: awskey, secretAccessKey: awssecretkey, region: awsregion});
var s3 = new AWS.S3();

//var IMAGE_TYPEFILTER = process.env.IMAGE_TYPEFILTER || '.png,.jpg';

//----------------------------------------------------------------------------
// validate the images and filter them according to prefs
//----------------------------------------------------------------------------
function filterImages(data) {
    const encodedImages = [];
    // data.forEach(img=> {
        let buf = Buffer.from(data);
        let base64 = buf.toString('base64');
        encodedImages.push(base64);
    // });
    return encodedImages;
}

//----------------------------------------------------------------------------
// loop through S3 formatted API results and build an images list
//----------------------------------------------------------------------------
async function buildImagesListFromS3Data(bucketname, data) {
    const S3_PREFIX = 'https://s3.amazonaws.com/' + bucketname + '/';
     var images = [];
    // var contents = data.Contents
    // console.log("iterating " + JSON.stringify(contents));
    // for (var iter in contents) {
    //     any validation of key can go here
    //     console.log("adding " + S3_PREFIX + contents[iter].Key)
        // images.push(S3_PREFIX + contents[iter].Key);
    // }
    let items = await (s3.getObject(
        {
            Bucket: bucketname,
            Key: '96802-1.jpg'
        }
    ).promise()).Body;
    console.log(items);
    images.push(items);
    
    return images;
}

//----------------------------------------------------------------------------
// GET on the main page.
//----------------------------------------------------------------------------
router.get('/', function (req, res, next) {

    // TODO pull these from ENV vars + user added buckets
    var bucketIds = ['images-store-bucket'];

    var imagesArray = [];
    var showBucket = req.query.showBucket;
    if (!showBucket) {
        console.log('no bucket, forcing to first bucket');
        showBucket = bucketIds[0]
    }
    console.log('loading bucket: ' + showBucket);

    // for DEBUGGING
    if (showBucket === 'FakeBucket') {
        imagesArray = ['https://www.google.com/url?sa=i&url=https%3A%2F%2Fpixabay.com%2Fimages%2Fsearch%2Fweekend%2F&psig=AOvVaw3Rud8NdupqGA75h8PSjHVX&ust=1615804542835000&source=images&cd=vfe&ved=0CAYQjRxqFwoTCNCDoJHLr-8CFQAAAAAdAAAAABAD'];
        res.render('index', {
            title: 'AWS S3 Image Viewer',
            showBucket: showBucket,
            images: JSON.stringify(imagesArray),
            buckets: JSON.stringify(bucketIds)
        });
    } else {
        // query for images
        console.log('querying S3 for objects in ' + showBucket);
        var params = {
            Bucket: showBucket
            //ContinuationToken: 'STRING_VALUE',
            //Delimiter: 'STRING_VALUE',
            //EncodingType: url,
            //FetchOwner: false,
            //MaxKeys: 50,
            //Prefix: 'STRING_VALUE',
            //RequestPayer: requester,
            //StartAfter: 'STRING_VALUE'
        };
        s3.listObjectsV2(params, function (err, data) {
            if (err) {
                console.log(err, err.stack); // an error occurred
            } else {
                const keys = data.Contents.map(content => content.Key);
                let promises = [], images = [];
                keys.forEach(key => {
                    promises.push(s3.getObject({"Bucket": 'images-store-bucket', "Key": key}).promise());
                });
                Promise.all(promises).then(s3Responses => {
                    s3Responses.forEach(s3Response => {
                        let image = new Buffer(s3Response.Body).toString('base64');
                        image = "data:" + s3Response.ContentType + ";base64," + image;
                        images.push(image);
                    })
                    res.render('index', {
                        title: 'AWS S3 Image Viewer',
                        showBucket: showBucket,
                        images: images,
                        buckets: JSON.stringify(bucketIds)
                    });
                })
            }
        });
    }
});

router.post('/index', function(req, res) {
    console.log('yoohuoo');
});

async function getImageByName() {
    var params = {
        "Bucket": 'images-store-bucket',
        "Key": "96802-1.jpg"
    };
    const data = await s3.getObject(params).promise();
    
    let image = new Buffer(data.Body).toString('base64');
    image = "data:" + data.ContentType + ";base64," + image;
    return [image];
}

router.get('/imageId', function(req, res, next) {
    var params = {
        "Bucket": 'images-store-bucket',
        "Key": "96802-1.jpg"
    };
    s3.getObject(params, function (err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
        } else {
            let image = new Buffer(data.Body).toString('base64');
            image = "data:" + data.ContentType + ";base64," + image;
            let response = {
                "statusCode": 200,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    'Content-Type': data.ContentType
                },
                "body": image,
                "isBase64Encoded": true
            };
            res.send(response);
        }
    });});

module.exports = router;
