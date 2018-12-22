"use strict";
/**
 * Chat Group O
 * @authors Merve Tagmut 761399, Alice Grigorjan 751206
 */

/*Variables*/

let ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3');
let VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
/*Require express framework*/
let express = require('express'),
    /*Start the app by creating an express application*/
    index = express(),
    /*Start the server*/
    server = require('http').createServer(index),
    /*Require socket.io library and start the socket*/
    io = require('socket.io').listen(server);

/*Array in which the users will be stored*/
let users = {};

/*Array in which the pictures will be stored*/
let pictures = {};

let port = process.env.PORT || 3000;
let db = require('ibm_db');
let helmet = require('helmet');
let sanitizer = require('sanitizer');
let bcrypt = require('bcryptjs');
let async = require('async');
let uuid = require('uuid');
let os = require('os');
let path = require('path');
let fs = require('fs');
let TIMESPAN = 40000;
let face = false;
let redis = require('redis');
let adapter = require('socket.io-redis');
let express_enforces_ssl = require('express-enforces-ssl');



let publish = redis.createClient('13801', 'redis-13801.c135.eu-central-1-1.ec2.cloud.redislabs.com', {
    auth_pass: "Z0h6MsgmDi4Lfdzr1QVmXJAOUY3MwDwK"
}); //send
let submission = redis.createClient('13801', 'redis-13801.c135.eu-central-1-1.ec2.cloud.redislabs.com', {
    auth_pass: "Z0h6MsgmDi4Lfdzr1QVmXJAOUY3MwDwK"
}); //recieve

io.adapter(adapter({
    pubClient: publish,
    subClient: submission
}));

/*Start the server, which listens on port 3000*/
server.listen(port, function() {
    console.log('listening on *: ' + port);
});

/*Database connection*/
var connStr = 'HOSTNAME=dashdb-txn-sbox-yp-lon02-01.services.eu-gb.bluemix.net;' +
    'PORT=50000;' +
    'DATABASE=BLUDB;' +
    'UID=qrt96392;' +
    'PWD=9vv9s02^kp3pz8rf';

/*Enforcing SSL*/
index.use(express_enforces_ssl());

/*Using TLS channels between client and server only*/
index.use(helmet());

/*CORS Access Policy*/
index.use(function(req, res, next) {

    // Website we wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', 'https://confident-meitner.eu-de.mybluemix.net/');
    // Request methods we wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    // Request headers we wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    //True, if the website has to include cookies if request is sent
    //to the API (e.g. in case sessions are used)
    res.setHeader('Access-Control-Allow-Credentials', true);
    //XSS
    res.setHeader('X-XSS-Protection', 1);

    next();
})

/*Routing a client to index.html everytime they visit localhost:3000 (default)*/
index.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

/*Watson Tone Analyzer*/
let toneAnalyzer = new ToneAnalyzerV3({
    version_date: '2017-09-21',
    username: '5f530461-85fb-4cb3-8225-22286d6f5d21',
    password: 'qFaQY2zU0lmd',
    url: 'https://gateway-fra.watsonplatform.net/tone-analyzer/api'
});

/*Visual Recognition Server*/
let visualRecognition = new VisualRecognitionV3({
    version: '2018-03-19',
    url: 'https://gateway.watsonplatform.net/visual-recognition/api',
    iam_apikey: 'CIb88eWu5Pn0Nz_X4zcIE3cMkMqF5TaUefXyHiYQsOtL',
    use_unauthenticated: false
});

/**
 * Gets called everytime a client establishes a connection
 * 
 * @param {SocketIO.Socket} socket The Socket of the client
 */
io.sockets.on('connection', function(socket) {
    /**
     * Command for a new user who enters the chatroom
     * Checks if a user with this username is already registered
     * @param {any} data Data which is passed by the client (username)
     * @param {any} callback 
     */
    socket.on('new user', function(json, callback) {
        /*Sanitizing the username and password*/
        let sanitizedUsername = sanitizer.sanitize(json.nickname).trim();
        sanitizedUsername = sanitizedUsername.replace(/\s/g, '');
        let invalidUsername = false;
        if (sanitizedUsername == '' || sanitizedUsername.length < 3 || !sanitizedUsername.match(/^([a-zA-Z0-9]+)$/)) {
            invalidUsername = true;
        }
        let cleanpassword = sanitizer.sanitize(json.password);
        let salt = bcrypt.genSaltSync(10);
        let hashedpw = bcrypt.hashSync(cleanpassword, salt);

        /*Checking if a profile picture has been selected*/
        if (json.pic) {
            if (sanitizedUsername in users || invalidUsername) {
                callback(false);
                socket.emit('failedLogin', {
                    message: 'Invalid input or user is already online.',
                    errorcode: 1
                });
            } else {
                detectFace(json.pic).then((result) => {
                        if (face) {
                            db.open(connStr, function(err, conn) {
                                if (err) return console.log(err);
                                try {
                                    let selectUserStatement = conn.prepareSync("SELECT USERNAME, PWHASH, PICTURE FROM USER WHERE USERNAME = ?");
                                    let resultSet = selectUserStatement.executeSync([sanitizedUsername]);
                                    var resultData = resultSet.fetchAllSync({
                                        fetchMode: 3
                                    });

                                    if (resultData[0]) {
                                        let storedPwHash = resultData[0][1];
                                        let storedPicture = resultData[0][2];
                                        if (sanitizedUsername in users || invalidUsername) {
                                            callback(false);
                                            socket.emit('failedLogin', {
                                                message: 'Invalid input or user is already online.',
                                                errorcode: 1
                                            });
                                        }
                                        if (bcrypt.compareSync(cleanpassword, storedPwHash) && !(sanitizedUsername in users) && !invalidUsername) {
                                            if (json.pic != storedPicture) {
                                                //Update profile picture
                                                let updateUserStatement = conn.prepareSync("UPDATE USER SET PICTURE = ? WHERE USERNAME = ?");
                                                updateUserStatement.executeSync([json.pic, sanitizedUsername]);
                                            }
                                            successfulLogin(socket, sanitizedUsername, users, json, conn);
                                        } else {
                                            socket.emit('failedLogin', {
                                                message: 'Credentials invalid or user already online.',
                                                errorcode: 0
                                            });
                                            socket.disconnect();
                                        }
                                    }
                                    //Insert credentials and picture into the database
                                    else {
                                        let insertUserStatement = conn.prepareSync("INSERT INTO USER (USERNAME, PWHASH, PICTURE) VALUES (?, ?, ?)");
                                        insertUserStatement.executeSync([sanitizedUsername, hashedpw, json.pic]);
                                        successfulLogin(socket, sanitizedUsername, users, json, conn);
                                    }
                                } catch (exc) {
                                    console.log(exc);
                                } finally {
                                    conn.close();
                                }
                            });
                        } else {
                            socket.emit('invalidPicture', {});
                            socket.disconnect();
                        }
                    })
                    .catch((error) => {
                        socket.emit('invalidPicture', {});
                        socket.disconnect();
                    });
            }
        } else {
            if (sanitizedUsername in users || invalidUsername) {
                callback(false);
                socket.emit('failedLogin', {
                    message: 'Invalid input or user is already online.',
                    errorcode: 1
                });
            } else {
                callback(true);
                db.open(connStr, function(err, conn) {
                    if (err) return console.log(err);
                    try {
                        let selectUserStatement = conn.prepareSync("SELECT USERNAME, PWHASH FROM USER WHERE USERNAME = ?");
                        let resultSet = selectUserStatement.executeSync([sanitizedUsername]);
                        var resultData = resultSet.fetchAllSync({
                            fetchMode: 3
                        });

                        if (resultData[0]) {
                            let storedPwHash = resultData[0][1];
                            if (bcrypt.compareSync(cleanpassword, storedPwHash) && !(sanitizedUsername in users) && !invalidUsername) {
                                successfulLogin(socket, sanitizedUsername, users, json, conn);
                            } else {
                                socket.emit('failedLogin', {
                                    message: 'Credentials invalid',
                                    errorcode: 0
                                });
                                socket.disconnect();
                            }
                        } //Insert credentials into the database
                        else {
                            let insertUserStatement = conn.prepareSync("INSERT INTO USER (USERNAME, PWHASH) VALUES (?, ?)");
                            insertUserStatement.executeSync([sanitizedUsername, hashedpw]);
                            successfulLogin(socket, sanitizedUsername, users, json, conn);
                        }
                    } catch (exc) {
                        console.log(exc);
                    } finally {
                        conn.close();
                    }
                });
            }
        }
    });

    /*Broadcasts messages to users which are actually in the chat only */
    function broadcastToAllValidUsers(key, value) {
        for (let username in users) {
            users[username].emit(key, value);
        }
    }

    /*Updates the users {} when a user enters or leaves*/
    function updateNicknames() {
        broadcastToAllValidUsers('usernames', Object.keys(users));
    }

    /**
     * Called if login was successful
     * @param  {socket} socket The image data as base65 string
     * @param {any} sanitizedUsername
     * @param {any} users
     * @param {any} json
     */
    function successfulLogin(socket, sanitizedUsername, users, json, conn) {
        let pictureOfUser = loadPictureFromUser(sanitizedUsername, conn);
        socket.nickname = sanitizedUsername;
        users[socket.nickname] = socket;
        pictures[socket.nickname] = pictureOfUser ? pictureOfUser : '';
        updateNicknames();
        console.log(socket.nickname + ' is now logged in!');
        userHasEntered(socket);
        socket.emit('successfulLogin', {
            success: true
        });
    }

    /**
     * Loads profile picture of the user
     * @param {any} nickname The nickname of the user
     * @param {any} conn The connection
     * @return {any} 
     */

    function loadPictureFromUser(nickname, conn) {
        let selectUserStatement = conn.prepareSync("SELECT PICTURE FROM USER WHERE USERNAME = ?");
        let resultSet = selectUserStatement.executeSync([nickname]);
        var resultData = resultSet.fetchAllSync({
            fetchMode: 3
        });
        return resultData;
    }

    /**
     * Gets called when a user has entered the chat
     * @param  {socket} socket Socket of the client
     */
    function userHasEntered(socket) {
        console.log('User ' + socket.nickname + ' entered the chat!');
        let json = {
            nickname: socket.nickname,
            timestamp: new Date()
        };
        broadcastToAllValidUsers('enter user', json);
    }


    /**
     * Checks if profile picture contains a face
     * @param  {any} img Uploaded image of the client
     */
    function detectFace(img) {
        return new Promise(function(resolve, reject) {
            var params = {
                images_file: null
            };
            //Writes the base64 image to a temporary file
            var resource = parseBase64Image(img);
            var temp = path.join(os.tmpdir(), uuid.v1() + '.' + resource.type);
            fs.writeFileSync(temp, resource.data);
            params.images_file = fs.createReadStream(temp);
            var methods = [];
            //Show images with confidence level of 0.5 or higher only
            params.threshold = 0.5;
            methods.push('detectFaces');
            async.parallel(methods.map(function(method) {
                var fn = visualRecognition[method].bind(visualRecognition, params);
                return async.reflect(async.timeout(fn, TIMESPAN));
            }), function(err, results) {
                results.map(function(result) {
                    if (result.value && result.value.length) {
                        result.value = result.value[0];
                    }
                    //Face detected
                    if (result.value["images"][0]["faces"].length > 0) {
                        face = true;
                        console.log("IT'S A FACE");
                        resolve(true);
                    }
                    //No face detected
                    else {
                        console.log("IT'S NOT A FACE");
                        reject(false);
                    }
                    return result;
                })
            });
        });
    }

    /**
     * Parses a base 64 image
     * @param  {String} imageString The image as a base65 string
     * @return {Object}             { type: String, data: Buffer }
     */
    function parseBase64Image(imageString) {
        var matches = imageString.toString().match(/^data:image\/([A-Za-z-+/]+);base64,(.+)$/);
        var resource = {};
        if (matches.length !== 3) {
            return null;
        }
        resource.type = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        resource.data = new Buffer(matches[2], 'base64');
        return resource;
    }

    /**
     * Command for sending a file (broadcast)
     * 
     * @param {any} data Data which is passed by the client
     */
    socket.on('send file group', function(data) {
        let sanitizedMessage = sanitizer.sanitize(data.message);
        let json = {
            nickname: socket.nickname,
            message: sanitizedMessage,
            file: data.uploadfile,
            timestamp: new Date()
        };
        broadcastToAllValidUsers('send file group', json);
        console.log(socket.nickname + ' sent a file to everyone!');
    });

    /**
     * Command for sending a file privately
     * 
     * @param {any} data Data which is passed by the client
     */
    socket.on('send file private', function(data) {
        let sanitizedMessage = sanitizer.sanitize(data.message);
        let msg = sanitizedMessage.trim();
        let array = sanitizedMessage.trim().split(' ');
        msg = msg.substr(3);
        let ind = msg.indexOf(' ');
        let msgtext = msg.substring(ind + 1);
        if (array[2] === undefined) {
            msgtext = ' ';
        }
        let json = {
            nickname: socket.nickname,
            message: msgtext,
            file: data.uploadfile,
            timestamp: new Date(),
            recipient: data.recipient
        };

        if (data.recipient in users && data.recipient != socket.nickname) {
            //For the recipient
            users[data.recipient].emit('send file private', json);

            //For the sender
            socket.emit('send file private', json);
            console.log(socket.nickname + ' sent a file privately to ' + data.recipient);
        }
    });

    /**
     * Command for sending a message
     * 
     * @param {any} data Data which is passed by the client (messagetext)
     * @param {any} callback 
     */
    socket.on('send message', function(data, callback) {
        let sanitizedMessage = sanitizer.sanitize(data);
        let msg = sanitizedMessage.trim();
        if (msg !== '') {
            //Check if '\w' command was used
            if (msg.substring(0, 3) === '\\w ') {
                msg = msg.substr(3);
                let ind = msg.indexOf(' ');
                if (ind !== -1) {
                    let name = msg.substring(0, ind);
                    let msgtext = msg.substring(ind + 1);
                    if (name in users && name != socket.nickname) {
                        var feeling = "";
                        var toneParams = {
                            'tone_input': {
                                'text': msg
                            },
                            'content_type': 'application/json'
                        }
                        toneAnalyzer.tone(toneParams, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                if (!(response.document_tone.tones[0] == null)) {
                                    feeling = response.document_tone.tones[0].tone_id;

                                    socket.emit('whisper', {
                                        recipient: name,
                                        msg: msgtext + " " + feeling,
                                        nick: socket.nickname,
                                        timestamp: new Date()
                                    });

                                    users[name].emit('whisper', {
                                        recipient: name,
                                        msg: msg,
                                        nick: socket.nickname,
                                        timestamp: new Date()
                                    });
                                    console.log(socket.nickname + ' whispered to ' + name);
                                }
                            }
                        });
                    } else {
                        callback('Enter a valid user!');
                    }
                } else {
                    callback('Please enter your message to whisper!')
                }
                //Check if '\list' command was used
            } else if (msg.substring(0, 5) === '\\list') {
                msg = msg.substr(5);
                let ind = msg.indexOf(' ');
                if (ind == -1) {
                    socket.emit('list', pictures);
                } else {
                    callback('Error! Please enter a correct command to show the online users!')
                }
                //Emit 'new message' command, visible for everyone
            } else {
                var feeling = "";
                var toneParams = {
                    'tone_input': {
                        'text': msg
                    },
                    'content_type': 'application/json'
                }
                toneAnalyzer.tone(toneParams, (err, response) => {
                    if (err) {
                        console.log(err);
                    } else {
                        if (!(response.document_tone.tones[0] == null)) {
                            feeling = response.document_tone.tones[0].tone_id;
                            msg = msg + " " + feeling;
                            console.log(msg + " " + feeling);
                        }
                    }
                    //Broadcasts to users which are logged in only
                    broadcastToAllValidUsers('new message', {
                        msg: msg,
                        nick: socket.nickname,
                        timestamp: new Date()
                    });
                });
            }
        }
    });

    /**
     * Command for status message when a users leaves
     * Deletes user from users {}
     */
    socket.on('disconnect', function() {
        if (!socket.nickname) return;
        delete users[socket.nickname];
        delete pictures[socket.nickname];
        console.log('User ' + socket.nickname + ' left the chat!');
        updateNicknames();
        let json = {
            nickname: socket.nickname,
            timestamp: new Date()
        };
        broadcastToAllValidUsers('user left', json);
    });
});