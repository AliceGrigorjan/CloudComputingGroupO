var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

let userSocketsMap = new Map();



app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){

  socket.on('chat message', function(msg){
    let json = {username: socket.username, message: msg, timestamp: Date.now()};
    io.emit('chat message', json);
  });

  socket.on('add user', function(msg){
    socket.username = msg;
    userSocketsMap.set(socket.username, socket);
    console.log('User '+socket.username+' entered the chat');
    let json = {username: socket.username, timestamp: Date.now()};
    io.emit('add user', json);
  });

  socket.on('list users', function(){
   let usernames =  Array.from(userSocketsMap.keys());
   socket.send('list users', usernames);
  });

  socket.on('disconnect', function(){
    userSocketsMap.delete(socket.username);
    console.log('User '+socket.username+' left the chat');
    let json = {username: socket.username, timestamp: Date.now()};
    io.emit('user left', json);
  });
});


http.listen(port, function(){
  console.log('listening on *:' + port);
});
