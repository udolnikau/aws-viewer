var express = require('express');
var mysql = require('mysql');
var AWS = require('aws-sdk');

var router = express.Router();
var awskey = 'AKIA3SWAVHGBVCTRO7GX';
var awssecretkey = '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';
var awsregion = 'us-east-1';
AWS.config.update({accessKeyId: awskey, secretAccessKey: awssecretkey, region: awsregion});
var s3 = new AWS.S3();

var multer = require('multer');
var upload = multer({ storage: multer.memoryStorage() });

var dbConnection = mysql.createConnection({
    host: 'image-viewer.c4eskojl0xwl.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'adminadmin',
    database: 'images'
})
dbConnection.connect();

router.get('/', function (req, res) {
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

router.post('/upload', upload.single('bucketNameTextInput'), function (req, res, next) {
    const params = {
        Key: req.file.originalname,
        Body: req.file.buffer,
        ContentEncoding: 'base64',
        ContentType: 'image/jpeg',
        ACL: 'public-read',
        Bucket: 'images-store-bucket',
    }
    return new Promise((resolve, reject) => {
        s3.putObject(params, (err) => {
            if (err) {
                reject(err);
            } else {
                dbConnection.query('INSERT INTO metadata (s3Key, title) values (?,?)', 
                    [req.file.originalname, req.file.originalname], function (err) {
                    if (err) {
                        console.log(err, err.stack);
                    } else {
                        resolve('success');
                        res.send({"statusCode": 200})
                    }
                });
            }
        })
    })
});

router.get('/random', function (req, res, next) {
    dbConnection.query('SELECT * from metadata AS metadata', null, function (err, rows) {
        if (err) {
            console.log(err, err.stack);
        } else {
            let keys = rows.map(row => row.s3Key);
            const key = keys[Math.floor(Math.random() * keys.length)];
            var params = {
                "Bucket": 'images-store-bucket',
                "Key": key
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
        }
    });
});

router.get('/:imageId', function (req, res, next) {
    var params = {
        "Bucket": 'images-store-bucket',
        "Key": req.params.imageId
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

