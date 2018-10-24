"use strict";
/**
 * Chat Group O
 * @authors Merve Tagmut 761399, Alice Grigorjan 751206
 */

//Variables
let express = require('express'),
    index = express(),
    server = require('http').createServer(index),
    io = require('socket.io').listen(server),
    users = {},
    port = 3000;

//Tell server which port it should listen to
server.listen(port, function() {
    console.log('listening on *: ' + port);
});

//Routing a client to index.html everytime they visit localhost:3000
index.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
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
            users[socket.nickname] = socket;
            updateNicknames();
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

            //For sender
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
                        //socket.emit for sender
                        socket.emit('whisper', {
                            recipient: name,
                            msg: msgtext,
                            nick: socket.nickname,
                            timestamp: new Date()
                        });
                        //users[name].emit for recipient
                        users[name].emit('whisper', {
                            recipient: name,
                            msg: msgtext,
                            nick: socket.nickname,
                            timestamp: new Date()
                        });
                        console.log(socket.nickname + ' whispered to ' + name);
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
                io.sockets.emit('new message', {
                    msg: msg,
                    nick: socket.nickname,
                    timestamp: new Date()
                });
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