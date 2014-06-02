/* 
 * Global configuration
 */
var config = {};

/* Database config*/
config.db = {
	host: 'YOUR_HOST',
	user: 'YOUR_USER',
	password: 'YOUR_PASSWORD',
	database: 'YOUR_DATABASE'
};

/* Players per game */
config.minPlayers = 3;
config.maxPlayers = 8;

module.exports = config