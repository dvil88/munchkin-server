/*
 * Match controller
 */
var sqlite3 = require('./inc.sqlite3.bin');
var main = require('./server');

var tables = {
	players: {_id_:'INTEGER AUTOINCREMENT',playerId:'INTEGER',turn:'INTEGER'},
	turns: {_turn_: 'INTEGER AUTOINCREMENT',playerId:'INTEGER',turnData:'TEXT',timestamp:'TIMESTAMP'},
}

var playerTurns = {};
var matchesTurns = {};

var match = {
	newMatch: function(matchId,playerList){
		sqlite3.open('matches/'+matchId+'.db',function(db){
			// create tables
			sqlite3.createTable(db,'turns',tables.turns,function(){});
			sqlite3.createTable(db,'players',tables.players,function(data){
				// insert players
				var turn = 1;
				var data = [];
				playerTurns[matchId] = {};
				matchesTurns[matchId] = {diceValue: '0', players: []};

				for(var key in playerList){
					data.push({playerId : playerList[key].playerId, turn: turn});
					playerTurns[matchId][playerList[key].playerId] = {turn: turn++, diceValue: 0};
				}

				sqlite3.insertInto(db,'players',data,function(data){
					sqlite3.close(db);
					startMatch(matchId);
				});
			});
		});

	},
	setTurnValue: function(matchId,playerId){
		if(playerTurns[matchId][playerId].diceValue > 0){return -1;}
		var mt = matchesTurns[matchId];
		var maxPlayers = parseFloat(Object.keys(playerTurns[matchId]).length);

		var diceValue = this.throwDice();
		playerTurns[matchId][playerId].diceValue = diceValue;

		if(diceValue >= mt.diceValue){
			if(diceValue > mt.diceValue){mt.players = [];}
			mt.diceValue = diceValue;
			mt.players.push(playerId);
		}

		// check if everyone threw the dice and calculate who goes first
		var turnCompleted = true;
		for(key in playerTurns[matchId]){if(playerTurns[matchId][key].diceValue == 0){turnCompleted = false;}}
		if(turnCompleted){
			var roomPlayers = main.rooms[matchId].players;
			for(var clientId in roomPlayers){
				var player = main.players[clientId];

				var data = {matchId: matchId};
				if(mt.players.length > 1 && mt.players.indexOf(player.uniqId) !== false){
					playerTurns[matchId][player.uniqId].diceValue = '0';
					player.socket.emit('turnRepeat',data);
				}
				else{player.socket.emit('turnCompleted',data);}
			}
			if(mt.players.length > 1){mt = {diceValue: '0', players: []};}
			else{
				var initPlayer = mt.players.pop();
				var turnDiff = parseFloat(playerTurns[matchId][initPlayer].turn - 1);

				for(playerId in playerTurns[matchId]){
					var newTurn = parseFloat(playerTurns[matchId][playerId].turn) - parseFloat(turnDiff);
					if(newTurn <= 0){newTurn = parseFloat(newTurn)+maxPlayers;}
					playerTurns[matchId][playerId].turn = newTurn;
				}
			}
		}


		return diceValue;
	},


	throwDice: function(){return Math.floor((Math.random() * 6) + 1);},
}

function startMatch(matchId){
	main.rooms[matchId].status = 'playing';

	// Send match confirmation to all the players in the room
	var roomPlayers = main.rooms[matchId].players;
	for(var playerId in roomPlayers){
		var player = main.players[playerId];

		var data = {roomId: matchId};
		player.socket.emit('matchStartResult',data);
	}
}

module.exports = match;
