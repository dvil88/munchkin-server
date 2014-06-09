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
var matches = {};

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
				matches[matchId] = {cards: {}, players: {}};

				for(var key in playerList){
					data.push({playerId : playerList[key].playerId, turn: turn});
					playerTurns[matchId][playerList[key].playerId] = {turn: turn++, diceValue: 0, level: 1, cards: {hand: [], play: []}};
				}

				sqlite3.insertInto(db,'players',data,function(data){
					sqlite3.close(db);

					// Generate decks
					match.generateDecks(matchId,1);

					// Start match
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
				if(mt.players.length > 1 && mt.players.indexOf(player.uniqId) != -1){
					playerTurns[matchId][player.uniqId].diceValue = '0';
					player.socket.emit('turnRepeat',data);
				}else{
					playerTurns[matchId][player.uniqId].diceValue = '-1';
					player.socket.emit('turnCompleted',data);
				}
			}
			if(mt.players.length > 1){mt = {diceValue: '0', players: {}};}
			else{
				// Calculate who goes first
				var initPlayer = mt.players.pop();
				var turnDiff = parseFloat(playerTurns[matchId][initPlayer].turn - 1);

				var firstPlayer = rightPlayer = '';
				for(playerId in playerTurns[matchId]){
					var newTurn = parseFloat(playerTurns[matchId][playerId].turn) - parseFloat(turnDiff);
					if(newTurn <= 0){newTurn = parseFloat(newTurn)+maxPlayers;}
					playerTurns[matchId][playerId].turn = newTurn;

					// Circular path
					if(firstPlayer == ''){firstPlayer = playerId;}
					if(rightPlayer != ''){
						playerTurns[matchId][playerId].right = rightPlayer;
						playerTurns[matchId][rightPlayer].left = playerId;
					}
					rightPlayer = playerId;
				}
				// First and last players in circular path
				playerTurns[matchId][firstPlayer].right = playerId;
				playerTurns[matchId][playerId].left = firstPlayer;

				// Insert players in match array
				matches[matchId].players = playerTurns[matchId];

				// TODO: Update database with turns

				// Give cards to player
				var roomPlayers = main.rooms[matchId].players;
				for(var clientId in roomPlayers){
					var player = main.players[clientId];
					var playerId = player.uniqId;

					var doors = match.getCards(matchId,playerId,'door',4);
					var treasures = match.getCards(matchId,playerId,'treasure',4);
					var cards = doors.concat(treasures);
					matches[matchId].players[playerId].cards.hand = cards;

					player.socket.emit('playerCards',{matchId: matchId, cards: matches[matchId].players[playerId].cards});
				}
			}
		}

		return diceValue;
	},

	throwDice: function(){return Math.floor((Math.random() * 6) + 1);},
	generateDecks: function(matchId,expansion){
		var db = main.db;
		var cards = {door: [], treasure: []};

		// Get cards
		var sql = 'select * from cards where expansion = '+db.escape(expansion);
		db.query(sql,function (err,rows){
			rows.forEach(function (card){
				if(card.type == 1){cards['door'].push(card);}
				else{cards['treasure'].push(card);}
			});

			cards['door'] = shuffle(cards['door']);
			cards['treasure'] = shuffle(cards['treasure']);
			matches[matchId].cards = cards;
		});
	},
	getCards: function(matchId,playerId,cardType,cardsNumber){
		var cards = [];
		for(var i = 0; i < cardsNumber; i++){
			cards.push(matches[matchId].cards[cardType].pop());
		}
		return cards;
	},
}

function startMatch(matchId){
	main.rooms[matchId].status = 'playing';

	// Get cards and send match confirmation to all the players in the room
	var roomPlayers = main.rooms[matchId].players;
	for(var playerId in roomPlayers){
		var player = main.players[playerId];



		var data = {roomId: matchId};
		player.socket.emit('matchStartResult',data);
	}
}

function shuffle(array) {
	var m = array.length, t, i;
	while (m) {
		i = Math.floor(Math.random() * m--);

		t = array[m];
		array[m] = array[i];
		array[i] = t;
	}

	return array;
}

module.exports = match;
