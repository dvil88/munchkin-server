/**
 * Munchkin online server
 */

var config = require('./config');
var ws = require('socket.io').listen(1337);
var mysql = require('mysql');
var crypto = require('crypto');

var rooms = {};
var players = {};
var matches = {};


/* MySQL connection */
var db = mysql.createConnection({
	host: config.db.host,
	user: config.db.user,
	password: config.db.password,
	database: config.db.database
});
db.connect();


/* Load rooms */
var sql = 'select * from rooms where status = \'waiting\'';
db.query(sql,function(err,rows){
	rows.forEach(function(room){
		rooms[room.uniqId] = {id: room.id, name: room.name, password: room.password, status: room.status, players: {}};
	});
});
/* Clear roomPlayers */
db.query('truncate roomPlayers');


/* Server code */
ws.sockets.on('connection', function (client) {
	/* Login user */
	client.on('loginUser',function(data){
		userLogin(data);
	});

	/* Register user */
	client.on('registerUser',function(data){
		userRegister(data);
	});

	/* Create room */
	client.on('createRoom',function(data){
		createRoom(data);
	});

	/* List rooms */
	client.on('listRooms',function(){
		var roomList = clone(rooms);

		for(key in roomList){
			if(roomList[key].password != ''){roomList[key].password = 'yes';continue;}
			roomList[key].password = 'no';
		}
		
		client.emit('listRoomsResult',roomList);
	});

	/* Player joins to a room */
	client.on('joinRoom',function(data){
		if(players.hasOwnProperty(client.id) === true){
			joinRoom(client.id,data.roomId,data.password);
		}
	});

	/* Player leaves a room */
	client.on('leaveRoom',function(roomId){
		if(players.hasOwnProperty(client.id) === true){
			leaveRoom(client.id,roomId);
		}
	});

	/* Player ready to play */
	client.on('playerReady',function(data){
		if(players.hasOwnProperty(client.id) === true){
			playerReady(client.id,data.roomId,data.status);
		}
	});

	/* handle client disconnections */
	client.on('disconnect',function(){
		// Delete player from game
		if(players.hasOwnProperty(client.id) === true){
			var player = players[client.id];
			// Delete player from rooms
			if(Object.keys(players[client.id].rooms).length > 0){
				for(var roomId in player.rooms){
					leaveRoom(client.id,roomId);
				}
			}

			delete players[client.id];
		}
	});


	/* Server functions */
	function userLogin(data){
		var sql = 'select * from users where username = '+db.escape(data.username);
		db.query(sql,function(err,user){
			user = user[0];
			
			var loginResult = {success: false, errorMsg:'Login incorrect'};
			if(user && authenticate(data.password,user.password,user.salt)){
				loginResult = {success: true,userId: user.uniqId,username: data.username};
				players[client.id] = { id: user.id, uniqId: user.uniqId, username: user.username, socket: client, rooms: {} };
			}
			client.emit('loginAttemptResult',loginResult);
		});
	}

	function userRegister(data){
		var salt = makeSalt();
		var hashedPassword = encryptPassword(data.password,salt);
		var plainPass = data.password;

		data.uniqId = encryptPassword(makeSalt(),makeSalt()).substr(1,10);
		data.salt = salt;
		data.password = hashedPassword;

		var query = db.query('INSERT INTO users SET ?', data, function(err, result) {
			if(!err){
				data.password = plainPass;
				userLogin(data);
			}
		});
	}

	function createRoom(data){
		var player = players[client.id];

		data.master = player.id;
		data.status = 'waiting';
		data.uniqId = encryptPassword(makeSalt(),makeSalt()).substr(1,10);

		var query = db.query('INSERT INTO rooms SET ?', data, function(err, result) {
			if(!err){
				var roomId = result.insertId;

				rooms[data.uniqId] = {id: data.id ,name: data.name, password: data.password, status: 'waiting', players: {}};
				client.emit('createRoomResult',{ success: true, errorMsg: 'Your room has been created' })
				joinRoom(client.id, data.uniqId);
			}
		});
	}

	function joinRoom(clientId,roomId,password){
		var player = players[clientId];

		// Check if room is full
		if(Object.keys(rooms[roomId].players).length == config.maxPlayers){
			return sendError('The room is full');
		} 

		// Check password
		if(rooms[roomId].password != '' && rooms[roomId].password != password){
			return sendError('Password incorrect');
		}

		// Check if user has already joined
		if(rooms[roomId].players.hasOwnProperty(clientId)){
			return sendError('Player already joined the room');
		}

		var data = {roomId:rooms[roomId].id, playerId:player.id}
		var query = db.query('INSERT INTO roomPlayers SET ?', data, function(err, result) {
			if(!err){
				players[client.id].rooms[roomId] = {};
				rooms[roomId].players[clientId] = {username: players[clientId].username, playerId: players[clientId].uniqId, status: 'notready'};

				var data = {roomId: roomId, players: rooms[roomId].players};
				client.emit('joinRoomResult',data);

				/* Send message to players in rooms */
				var roomPlayers = rooms[roomId].players;
				for(var playerId in roomPlayers){
					var player = players[playerId];

					var data = {roomId: roomId, username: players[clientId].username, playerId: players[clientId].uniqId, status: 'notready' };
					player.socket.emit('roomPlayerJoined',data)
				}
			}
		});
	}

	function leaveRoom(clientId,roomId){
		if(players.hasOwnProperty(clientId) === true){
			var player = players[clientId];

			// Delete player from rooms
			if(players[clientId].rooms.hasOwnProperty(roomId) === true){
				delete rooms[roomId].players[clientId];
				delete player.rooms[roomId];
				db.query('delete from roomPlayers where playerId = '+db.escape(player.id)+' and roomId = '+db.escape(rooms[roomId].id));

				// send room leaving notification
				client.emit('leaveRoomResult',roomId);

				var roomPlayers = rooms[roomId].players;
				for(var playerId in roomPlayers){
					var player = players[playerId];

					var data = {roomId: roomId, username: players[clientId].username, playerId: players[clientId].uniqId };
					player.socket.emit('roomPlayerLeft',data);
				}
			}
		}
	}

	function playerReady(clientId,roomId,status){
		rooms[roomId],players[clientId].status = status;
		client.emit('playerReadyResult',{roomId: roomId, status: status});

		var roomPlayers = rooms[roomId].players;
		for(var playerId in roomPlayers){
			var player = players[playerId];

			var data = {roomId: roomId,username: players[clientId].username, playerId: players[clientId].uniqId, status: status };
			player.socket.emit('roomPlayerReady',data);
		}
	}


	/* Send error */
	function sendError(error){
		client.emit('showError',error);
	}
});


function authenticate(plainText,hashedPassword,salt){return encryptPassword(plainText,salt) === hashedPassword;};
function makeSalt(){return Math.round((new Date().valueOf() * Math.random())) + '';};
function encryptPassword(password,salt){return crypto.createHmac('sha1',salt).update(password).digest('hex');};

/* Function to clone objects */
function clone(obj){
	if(obj == null || typeof(obj) != 'object'){return obj;}
	var temp = obj.constructor();
	for(var key in obj){
		temp[key] = clone(obj[key]);
	}
	return temp;
}