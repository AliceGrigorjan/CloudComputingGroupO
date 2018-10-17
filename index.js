var express = require('express'),
    index = express(),
    server = require('http').createServer(index),
    io = require('socket.io').listen(server),
    users = {},
    port = 3000;


server.listen(port, function() {
    console.log('listening on *: ' + port);
});

//routing
index.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket) {
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

    function updateNicknames() {
        io.sockets.emit('usernames', Object.keys(users));
    }

    socket.on('send message', function(data, callback) {
        var msg = data.trim();
        if (msg.substring(0, 3) === '\\w ') {
            msg = msg.substr(3);
            var ind = msg.indexOf(' ');
            if (ind !== -1) {
                var name = msg.substring(0, ind);
                var msg = msg.substring(ind + 1);
                if (name in users) {
                    socket.emit('whisper', {
                        recipient: name,
                        msg: msg,
                        nick: socket.nickname,
                        timestamp: new Date()
                    });
                    users[name].emit('whisper', {
                        recipient: name,
                        msg: msg,
                        nick: socket.nickname,
                        timestamp: new Date()
                    });
                    console.log('Whisper!');
                } else {
                    callback('error! enter a valid user');
                }
            } else {
                callback('Failure: Please enter your message to whisper! ')
            }
        } else if (msg.substring(0, 5) === '\\ list') {
            msg = msg.substr(5);
            var ind = msg.indexOf(' ');
            if (ind == -1) {
                console.log('Show Users!')
                socket.emit('list', Object.keys(users));
            } else {
                callback('Error! Please enter a correct command to show the online users')
            }
        } else {
            io.sockets.emit('new message', {
                msg: msg,
                nick: socket.nickname,
                timestamp: new Date()
            });
        }
    });

    socket.on('enter user', function(msg) {
        socket.nickname = msg;
        console.log('User ' + socket.nickname + ' entered the chat!');
        let json = {
            nickname: socket.nickname,
            timestamp: new Date()
        };
        io.emit('enter user', json);
    });

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