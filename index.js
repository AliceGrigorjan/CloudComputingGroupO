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
    socket.on('new user', function(data, callback) {
        if (data in users) {
            callback(false);
        } else {
            callback(true);
            socket.nickname = data;
            var password = "Blabla";
            users[socket.nickname] = socket;
            updateNicknames();
            console.log(socket.nickname);
            //database implement
            db.open(connStr, function (err,conn) {
                if (err) return console.log(err);
                var sql = "INSERT INTO USERREGISTRATION (USERNAME,PASSWORT) VALUES (" + socket.nickname + ',' + password + ")";
                console.log(socket.nickname);
                conn.query(sql, function (err, data) {
                    if (err){
                        console.log(err);
                    }
                    else {
                        console.log(data);
                    }

                    conn.close(function () {
                        console.log('done');
                    });
                });
            });
        }
    });


    //Updates the users {} when a user enters or leaves
    function updateNicknames() {
        io.sockets.emit('usernames', Object.keys(users));
    }

     /**
     * Command for sending a file (broadcast)
     * 
     * @param {any} data Data which is passed by the client
     */
    socket.on('send file group', function(data) {
        let json = {nickname: socket.nickname, message: data.message, file: data.uploadfile, timestamp: new Date()};
        io.emit('send file group', json);
        console.log(socket.nickname + ' sent a file to everyone!');
    });

     /**
     * Command for sending a file privately
     * 
     * @param {any} data Data which is passed by the client
     */
    socket.on('send file private', function(data) {
        let msg = data.message.trim();
        let array = data.message.trim().split(' ');
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
        let msg = data.trim();
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
     * Command for status message when a new user enters
     * 
     * @param {any} msg Data which is passed by the client (nickname)
     */
    socket.on('enter user', function(msg) {
        socket.nickname = msg;
        console.log('User ' + socket.nickname + ' entered the chat!');
        let json = {
            nickname: socket.nickname,
            timestamp: new Date()
        };
        io.emit('enter user', json);
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