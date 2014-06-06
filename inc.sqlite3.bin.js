//if(!global._api){global._api = fs.realpathSync('./');}
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');
var buffersp = require('./inc.buffer.splitter');

var sqlite3 = {
	v: {databases:{},tables:{},lastQueryError:'',lastQueryErrno:'',version:'3.7.9'},
	open: function(p,cb){
		if(!fs.existsSync(p)){fs.writeFileSync(p,'');}
		var filePath = fs.realpathSync(p);
		var s = fs.statSync(filePath);
		var fileID = s.dev+'.'+s.ino;
		var fileName = path.basename(p);
		var db = spawn('sqlite3',[filePath]);
		db.stdin.write('.headers on\n.mode tcl\n.separator ¸\n');
		if(!s.size){
			var process = function(data){
				db.stdout.removeListener('data',process);
				cb(db);
			};
			db.stdin.write('PRAGMA main.page_size = 8192;PRAGMA main.cache_size=10000;PRAGMA main.locking_mode=EXCLUSIVE;PRAGMA main.synchronous=NORMAL;PRAGMA main.journal_mode=WAL;PRAGMA temp_store=MEMORY;\n');
			db.stdout.on('data',process);
		}else{
			db.stdin.write('PRAGMA main.page_size = 8192;PRAGMA temp_store=MEMORY;\n');
			sqlite3.v.databases[fileID] = {'resource':db,'path':filePath,'name':fileName};
			cb(db);
		}
	},
	close: function(db){
		db.stdin.write('.exit\n');
	},
	query: function(db,q,cb){
		var fieldNames = false;
		var filedCount = 0;
		var rows = [];
		db.stdin.write(q+'\nSELECT random();\n');
		var splitter = db.stdout.pipe(buffersp('"¸\n'));
		splitter.on('token',function(line){
			if(line == '"random()'){
				cb(rows);
				db.stdout.unpipe(splitter);
				return;
			}

    			line = line.toString();
			if(!fieldNames){line = line.substr(1).split('"¸"');fieldCount = line.length;fieldNames = line;return;}
			var row = {};
			line = line.substr(1).split('"¸"');
			for(j = 0;j < fieldCount;j++){row[fieldNames[j]] = line[j];}
			rows.push(row);
		});
	},
	exec: function(db,q,cb){
		var queryError = '';
		var queryErrno = 0;
		var buffer = '';
		var process = function(data){
			buffer += data.toString();
			if(buffer.indexOf('last_insert_rowid') == -1){return;}
			//console.log(q);
			//console.log('\n'+data);
			// buffer = buffer.split('"¸\n');
			buffer = buffer.replace(/"/g,'').split("\n");
			db.stdout.removeListener('data',process);
			db.stderr.removeListener('data',error);
			/* Little delay for stderr to arrive */
			cb({'changes':parseInt(buffer[1]),'id':parseInt(buffer[3]),'error':queryError,'errno':queryErrno});
		};
		var error = function(data){
			data = data.toString();
			if(data.match(/no such table: .*/)){queryError = 'TABLE_NOT_FOUND';queryErrno = 19;}
			if(data.match(/ ([^ ]+) may not be NULL/)){queryError = 'FIELD_CONSTRAINT';queryErrno = 201;}
			//console.log(data);
		};
		db.stderr.on('data',error);
		db.stdout.on('data',process);
		db.stdin.write(q+'\nSELECT changes();\nSELECT last_insert_rowid();\n');
	},
	createTable: function(db,tableName,fields,cb){
		var q = 'CREATE TABLE ['+tableName+'] (';
		var tableKeys = [];
		var hasAutoIncrement = false;
		var key;
		for(key in fields){
			var value = fields[key];
			//FIXME: falta scapeString de value
			if(key[0] == '_' && key.substr(-1) == '_'){
				key = key.substr(1,key.length-2);
				if(value.indexOf('INTEGER AUTOINCREMENT') > -1){
					/* If is AUTOINCREMENT must be the unique key */
					q += '\''+key+'\' INTEGER PRIMARY KEY AUTOINCREMENT,';
					continue;
				}
				q += '\''+key+'\' '+value+',';
				tableKeys.push(key);
				continue;
			}
			q += '\''+key+'\' '+value+',';
		}
		if(tableKeys.length){q += 'PRIMARY KEY ('+tableKeys.join(',')+'),';}
		q = q.substr(0,q.length-1)+');';
		sqlite3.exec(db,q,cb);
	},
	insertInto: function(db,tableName,rows,cb,params){
		/* Inserting in chunks of [limit] elements */
		//FIXME: dependiendo de la version hay que crear las consultas diferentes
		//FIXME: crear tabla 
		var row = [];
		var limit = 6000;
		var i = 0,j = 0;
		var q = '',ids = '',values = '';

		while((row = rows.shift())){
			if(j > limit){break;}
			q += 'INSERT OR REPLACE INTO ['+tableName+'] ';
			ids = values = '(';
			/* SQL uses single quotes to delimit string literals. */
			for(i in row){ids += '\''+i+'\',';values += '\''+row[i]+'\',';}
			ids = ids.substr(0,ids.length-1)+')';
			values = values.substr(0,values.length-1)+')';
			q += ids+' VALUES '+values+';';
			j++;
		}

		var handler = function(res){
			if(res.errno == 19){
				if(!sqlite3.v.tables[tableName]){/*FIXME: error*/return cb({});}
				sqlite3.createTable(db,tableName,sqlite3.v.tables[tableName],function(){
					//console.log('tabla creada');
					/* Once the table is available, retry the query */
					return sqlite3.exec(db,q,handler);
				});
				return;
			}

			if(rows.length){
				return sqlite3.insertInto(db,tableName,rows,cb,params);
			}
			return cb(res);
		};

		sqlite3.exec(db,q,handler);
	},
	getWhere: function(tableName,whereClause,params){
		if(!params.indexBy){params.indexBy = 'id';}
		if(!params.db){
			if(!params.dbfile){
				//FIXME: error: no database conexion
				return params.cb({});
			}
			return sqlite3.open(params.dbfile,function(db){params.db = db;params.shouldclose = true;sqlite3.getWhere(tableName,whereClause,params);});
		}

		var selectString = '*';if(params.selectString){selectString = params.selectString;}
		var q = 'SELECT '+selectString+' FROM ['+tableName+'] '+(whereClause ? 'WHERE '+whereClause : '');
		//FIXME: escapeString
		if(params.group){q += ' GROUP BY '+params.group;}
		if(params.order){q += ' ORDER BY '+params.order;}
		if(params.limit){q += ' LIMIT '+params.limit;}
		q += ';';
		sqlite3.query(params.db,q,function(rows){
			if(params.shouldclose){sqlite3.close(params.db);}
			params.cb(rows);
		});
	},
	test: function(db){
		db.stdin.write('SELECT * FROM inventory;\n');
		db.stdout.on('data',function(data){
			data = data.toString();
console.log(data);
		});
	}
}

module.exports = sqlite3;
