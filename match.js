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

		var result = this.throwDice();
		playerTurns[matchId][playerId].diceValue = result;

		// TODO: check if everyone threw the dice and calculate who goes first

		return result;
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
