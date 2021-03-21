var express = require('express');
var mysql = require('mysql');
var AWS = require('aws-sdk');

var router = express.Router();
var awskey = 'AKIA3SWAVHGBVCTRO7GX';
var awssecretkey = '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';
var awsregion = 'us-east-1';
AWS.config.update({accessKeyId: awskey, secretAccessKey: awssecretkey, region: awsregion});
var s3 = new AWS.S3();
var sns = new AWS.SNS();
var lambda = new AWS.Lambda();
const topicArn = 'arn:aws:sns:us-east-1:796046735747:aws-viewer';
const bucket = 'images-store-bucket';

var multer = require('multer');

var upload = multer({storage: multer.memoryStorage()});
var dbConnection = mysql.createConnection({
    host: 'image-viewer.c4eskojl0xwl.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'adminadmin',
    database: 'images'
})

dbConnection.connect();

function handleResponse(err, res, msg) {
    if (err) {
        res.send({"statusCode": 500, err: err});
    } else {
        console.log(msg);
        res.send({"statusCode": 200, "message": msg});
    }
}

async function checkS3Bucket() {
    const buckets = await s3.listBuckets().promise();
    if (buckets && buckets.Buckets.filter(b => b.Name === bucket).length === 0) {
        var params = {
            FunctionName: 'createS3Bucket',
            InvocationType: 'RequestResponse',
            LogType: 'Tail',
            Payload: '{ "name":"' + bucket + '"}'
        };
        console.log('Invoking CreateS3Bucket function.');
        dbConnection.query('DELETE from metadata where s3Key IS NOT NULL', null, ()=>{
            return lambda.invoke(params).promise();
        });
    } else {
        console.log('S3 bucket exist.');
    }
}

router.post('/subscribe', function (req, res) {
    var email = req.body.email.toLowerCase();
    if (email) {
        sns.listSubscriptionsByTopic({TopicArn: topicArn}, function (err, data) {
            if (err) {
                console.log(err);
                res.send({"statusCode": 500, err: err});
            } else {
                let subscription = data.Subscriptions.filter(e => email === e.Endpoint)[0];
                if (subscription) {
                    sns.unsubscribe({SubscriptionArn: subscription.SubscriptionArn}, function () {
                        handleResponse(err, res, 'Subscription for email ' + email + ' has been removed');
                    });
                } else {
                    sns.subscribe({Protocol: 'EMAIL', TopicArn: topicArn, Endpoint: email}, function () {
                        handleResponse(err, res, 'Subscription added for email ' + email);
                    });
                }
            }
        })
    } else {
        res.send({"statusCode": 204})
    }
});

router.get('/', function (req, res) {
    checkS3Bucket().then(function () {
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
                        buckets: JSON.stringify([bucket])
                    });
                })
            }
        });
    });
});

router.post('/upload', upload.single('bucketNameTextInput'), function (req, res, next) {
    const params = {
        Key: req.file.originalname,
        Body: req.file.buffer,
        ContentEncoding: 'base64',
        ContentType: 'image/jpeg',
        ACL: 'public-read',
        Bucket: bucket,
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
                            sns.publish({Message: 'New Image has been uploaded!', TopicArn: topicArn}, function () {
                                console.log('SNS Notification has been published.');
                            })
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
                "Bucket": bucket,
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
        "Bucket": bucket,
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

