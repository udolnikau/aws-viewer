var express = require('express');
var mysql = require('mysql');
var router = express.Router();

var awskey = 'AKIA3SWAVHGBVCTRO7GX';
var awssecretkey = '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';
var awsregion = 'us-east-1';
var AWS = require('aws-sdk');
AWS.config.update({accessKeyId: awskey, secretAccessKey: awssecretkey, region: awsregion});
var s3 = new AWS.S3();
var dbConnection = mysql.createConnection({
    host: 'image-viewer.c4eskojl0xwl.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'adminadmin',
    database: 'images'
})
dbConnection.connect();

router.get('/', function (req, res, next) {
    dbConnection.query('SELECT * from metadata AS metadata', null, function (err, rows) {
        if (err) {
            console.log(err, err.stack);
        } else {
            const titles = rows.map(row => row.title);
            let promises = [], images = [];
            rows.forEach(row => {
                let imagePromise = s3.getObject({"Bucket": 'images-store-bucket', "Key": row.s3Key}).promise();
                promises.push(imagePromise);
            });
            Promise.all(promises).then(promise => {
                promise.forEach((s3ResponseImage, index) => {
                    let image = new Buffer(s3ResponseImage.Body).toString('base64');
                    image = {
                        image: "data:" + s3ResponseImage.ContentType + ";base64," + image,
                        title: titles[index]
                    };
                    images.push(image);
                })
                res.render('index', {
                    title: 'AWS S3 Image Viewer',
                    showBucket: req.query.showBucket,
                    images: images,
                    buckets: JSON.stringify(['images-store-bucket'])
                });
            })
        }
    });
});

router.post('/index', function (req, res) {
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

router.get('/imageId', function (req, res, next) {
    var params = {
        "Bucket": 'images-store-bucket',
        "Key": "96802-1.jpg"
    };
    s3.getObject(params, function (err, data) {
        if (err) {
            console.log(err, err.stack);
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
    });
});

module.exports = router;

