"use strict";
/**
 * Chat Group O
 * @authors Merve Tagmut 761399, Alice Grigorjan 751206
 */

//Variables
let ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3');
//Require express framework
let express = require('express'),
    //Start the app by creating an express application
    index = express(),
    //Start the server
    server = require('http').createServer(index),
    //Require socket.io library and start the socket
    io = require('socket.io').listen(server),
    //Array in which the users will be stored
    users = {};
    let port = process.env.PORT || 3000;

    let db = require('ibm_db');

    let sanitizer = require('sanitizer');

    let md5 = require('md5');

//Start the server, which listens on port 3000
server.listen(port, function() {
    console.log('listening on *: ' + port);
});

//database implement
var connStr = 'HOSTNAME=dashdb-txn-sbox-yp-lon02-01.services.eu-gb.bluemix.net;' +
    'PORT=50000;' +
    'DATABASE=BLUDB;' +
    'UID=qrt96392;' +
    'PWD=9vv9s02^kp3pz8rf';



//Routing a client to index.html everytime they visit localhost:3000 (default)
index.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

let toneAnalyzer = new ToneAnalyzerV3({
    version_date: '2017-09-21',
    username: '5f530461-85fb-4cb3-8225-22286d6f5d21',
    password: 'qFaQY2zU0lmd',
    url: 'https://gateway-fra.watsonplatform.net/tone-analyzer/api'
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
        //TODO: CHECK IF USERNAME PATTERN IS OKAY & PASSWORD
        let sanitizedUsername = sanitizer.sanitize(json.nickname).trim();
        let invalidUsername = false;
        if(sanitizedUsername == '' || sanitizedUsername.length < 3){
            invalidUsername = true;
        }
        let cleanpassword = sanitizer.sanitize(json.password);
        let pwhash = md5(cleanpassword);
        socket.userrrr = sanitizedUsername;
        if (sanitizedUsername in users || invalidUsername) {
            callback(false);
            socket.emit('failedLogin', {message: 'Invalid input or user is already online', errorcode: 1});
        } else {
            callback(true);
            //database implement
            db.open(connStr, function (err,conn) {
                if (err) return console.log(err);
                
                try{
                    let selectUserStatement = conn.prepareSync("SELECT USERNAME, PWHASH FROM USER WHERE USERNAME = ?");
                    let resultSet = selectUserStatement.executeSync([sanitizedUsername]); 
                    var resultData = resultSet.fetchAllSync({fetchMode:3}); 

                    if(resultData[0]){
                        let storedPwHash = resultData[0][1];
                        if(pwhash == storedPwHash){
                            successfulLogin(socket, sanitizedUsername, users);
                        }else{
                            socket.emit('failedLogin', {message: 'Credentials invalid', errorcode: 0});
                            socket.disconnect();
                        }
                    }else{
                        let insertUserStatement = conn.prepareSync("INSERT INTO USER (USERNAME, PWHASH) VALUES (?, ?)");
                        insertUserStatement.executeSync([sanitizedUsername, pwhash]);
                        successfulLogin(socket, sanitizedUsername, users);
                        
                    }
                }catch(exc){
                    console.log(exc);
                }finally{
                    conn.close();
                }
            });
        }
    });


    //Updates the users {} when a user enters or leaves
    function updateNicknames() {
        io.sockets.emit('usernames', Object.keys(users));
    }

    function successfulLogin(socket, sanitizedUsername, users){
        socket.emit('successfulLogin', {success: true});
        socket.nickname = sanitizedUsername;
        users[sanitizedUsername] = socket;
        updateNicknames();
        console.log(sanitizedUsername + ' is now logged in!');
        userHasEntered(socket);
    }

    function userHasEntered(socket){
        console.log('User ' + socket.nickname + ' entered the chat!');
        let json = {
            nickname: socket.nickname,
            timestamp: new Date()
        };
        io.emit('enter user', json);
    }

     /**
     * Command for sending a file (broadcast)
     * 
     * @param {any} data Data which is passed by the client
     */
    socket.on('send file group', function(data) {
        let sanitizedMessage = sanitizer.sanitize(data.message);
        let json = {nickname: socket.nickname, message: sanitizedMessage, file: data.uploadfile, timestamp: new Date()};
        io.emit('send file group', json);
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
        if(array[2] === undefined){
            msgtext = ' ';
        }
        let json = {nickname: socket.nickname, message: msgtext, file: data.uploadfile, timestamp: new Date(), recipient: data.recipient};

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
                            'tone_input': {'text': msg},
                            'content_type': 'application/json'
                        }
                        toneAnalyzer.tone(toneParams, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                if (!(response.document_tone.tones[0] == null)) {
                                    feeling = response.document_tone.tones[0].tone_id;
                                    //msg = msgtext + " " + feeling; //i.wo hier ist glaub fehler auf console zeigt mood an aber client nicht

                                    socket.emit('whisper', {
                                        recipient: name,
                                        msg: msgtext + " " + feeling, // oder hier fehler
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
                    socket.emit('list', Object.keys(users));
                } else {
                    callback('Error! Please enter a correct command to show the online users!')
                }
                //Emit 'new message' command, visible for everyone
            } else {
                var feeling = "";
                var toneParams = {
                    'tone_input': {'text': msg},
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
                    io.sockets.emit('new message', {
                        msg: msg,
                        nick: socket.nickname,
                        timestamp: new Date()
                    });
                });
                //In der Variable feeling ist es drin binde es in die message ein

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
        console.log('User ' + socket.nickname + ' left the chat!');
        updateNicknames();
        let json = {
            nickname: socket.nickname,
            timestamp: new Date()
        };
        io.emit('user left', json);
    });
});

