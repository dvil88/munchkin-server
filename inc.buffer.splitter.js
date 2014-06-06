	/* INI-extending buffer */
	if(!Buffer.indexOf){Buffer.prototype.indexOf = function(needle,pad){
		if(!(needle instanceof Buffer)){needle = new Buffer(needle + '');}
		if(!pad){pad = 0;}
		var nl = needle.length;
		if(nl == 1){for(var i = pad,l = this.length;i < l;++i){
			if(needle[0] === this[i]){return i;}
		}return -1;}

		var length = this.length, needleLength = needle.length,pos = 0,index = 0;
		for(var i = pad,l = this.length;i < l;++i){
		        if(needle[pos] === this[i]){
		                if((pos + 1) === needleLength){return index;}
				if(pos === 0){index = i;}
		                ++pos;
		        }else if(pos){pos = 0;i = index;}
		}
		return -1; 
	};}
	/* END-extending buffer */

	var stream = require('stream');
	function splitter(delim){
		var src = null;
		var strm = new stream();
		var buf = new Buffer([]);
		if(!Buffer.isBuffer(delim)){delim = new Buffer(delim);}
		this.delim = delim;
		var delimLen = delim.length;

		var errorHandler = function(err){if(src.listeners('error').length){return strm.emit('error',err);}};
		strm.writable = true;
		strm.write = function(data,encoding){
			strm.emit('data',data);
			if('string' === typeof data){data = new Buffer(data,encoding);}
			buf = Buffer.concat([buf,data]);
			buf = splitter.split(buf,delim,strm);
			return true;
		};
		strm.end = function(data,encoding){
			if(data){strm.write(data,encoding);}
			strm.writable = false;
			if(buf.length){this.token(buf.toBuffer(),strm);}
			strm.emit('done');
      			return src && src.removeListener('error',errorHandler);
		};
		strm.on('pipe', function(_src){
			src = _src;
			return src.on('error',errorHandler);
		});
		return strm;
	};


	splitter.split = function(buf,delim,stream){
		var finalIndex = -1,l = delim.length,index;

		while((index = buf.indexOf(delim,Math.max(finalIndex,0))) > -1){
        		this.token(buf.slice(Math.max(finalIndex,0),index),stream);
			finalIndex = index+l;
			if(finalIndex >= buf.length){
				buf = new Buffer([]);
				return buf;
			}
		}
		if(finalIndex > -1){
			buf = buf.slice(0,finalIndex);
			return buf;
		}
	}
	splitter.token = function(token,stream){
		if(stream.encoding){token = token.toString(stream.encoding);}
		return stream.emit('token',token);
	}

	module.exports = splitter;
