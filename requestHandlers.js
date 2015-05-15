var mysql = require('mysql');
var mkdirp = require('mkdirp');
var fs = require('fs');
var mime = require('mime');
var FileQueue = require('filequeue');
var fq = new FileQueue(200);
var rmdir = require('rimraf');

var connection = mysql.createConnection({
		host		: 'localhost',
		user		: 'root',
		password	: '',
		database	: 'csp2p',
	});

var connections = [],
	messagesFor = [],
	live = [],
	uploadList = [];

function webrtcResponse(response, res) {
	res.writeHead(200, {"Content-Type": "application/json"});
	res.write(JSON.stringify(response));
	res.end();
}

function webrtcError(err, res) {
	webrtcResponse({"err": err}, res);
}

Array.prototype.clean = function(deleteValue) {
	for (var i = 0; i < this.length; i++) {
		if (this[i] == deleteValue) {
			this.splice(i, 1);
			i--;
		}
	}
	return this;
};

function connect(info) {
	var res = info.res;

	function newID() {
		return Math.floor(Math.random()*1000);
	};

	function existId(id) {
		for (var i = 0; i < connections.length; i++)
			if (id == connections[i]) return true;
		return false;
	}

	while (1) {
		var id = newID();
		if (!existId(id)) break;
	}
	
	for (var i = 0; i < connections.length; i++)
		if (typeof (connections[i]) === "undefined") {
			connections[i] = id;
			break;
		}
	if (i >= connections.length) connections.push(id);
	messagesFor[id] = []
	messagesFor[id].push({'from': "server", 'msg': "Check live"});
	live[id] = false;
	console.log('Id: ' + id + ' join network');
	webrtcResponse({"id": id, "list": connections}, res);
}
exports.connect = connect;

function sendMessage(info) {
	var postData = JSON.parse(info.postData),
		res = info.res;
	
	if (typeof postData === "undefined") {
		webrtcError("No posted data in JSON format!", res);
		return;
	}
	
	if (typeof (postData.message) === "undefined") {
		webrtcError("No message received", res);
		return;
	}
	
	if (typeof (postData.id) === "undefined") {
		webrtcError("No sender\'s id", res);
		return;
	}
	
	if (typeof (postData.to) === "undefined") {
		webrtcError("No recipient\'s id", res);
		return;
	}
	
	try {
		messagesFor[postData.to].push({'from':postData.id, 'msg':postData.message});
		webrtcResponse("Saving message from " + postData.id + " to " + postData.to, res);
	} catch (e) {
		// TODO: handle exception
	}
}
exports.send = sendMessage;

function getMessages(info) {
	var postData = JSON.parse(info.postData),
		res = info.res;
	
	if (typeof postData === "undefined") {
		webrtcError("No posted data in JSON format!", res);
		return;
	}
	if (typeof (postData.id) === "undefined") {
		webrtcError("No id received on get", res);
		return;
	}
	
	try {
		if ((messagesFor[postData.id]).length == 0) {
			webrtcError("No message for " + postData.id, res);
			return;
		}
		else {
			webrtcResponse({'msgs':messagesFor[postData.id]}, res);
			messagesFor[postData.id] = [];
		}
	} catch (e) {
		// TODO: handle exception
	}	
}
exports.get = getMessages;

function sendCheckOutMessage() {
	console.log("Sending message to check peers\'s live");
	console.log(connections);
	for (var i = 0; i < connections.length; i++) {
		try {
			messagesFor[connections[i]].push({'from': "server", 'msg': "Check live"});
			live[connections[i]] = false;
		} catch (e) {
			// TODO: handle exception
		}
	}
	setTimeout(clearMemory, 5000);
}
exports.sendcheck = sendCheckOutMessage;

function showNewFile() {
	for (var i = 0; i < connections.length; i++) {
		try {
			messagesFor[connections[i]].push({'from': "server", 'msg': "New file"});
		} catch (e) {
			// TODO: handle exception
		}
	}
}

function getResponseCheckOutMessage(info) {
	var postData = JSON.parse(info.postData),
		res = info.res;
	
	try {
		live[postData.id] = true;
		webrtcResponse("Peer is living", res);
	} catch (e) {
		// TODO: handle exception
	}
}
exports.getcheck = getResponseCheckOutMessage;

function clearMemory() {
	console.log("Cleaning memory");
	for (var i = 0; i < connections.length; i++) {
		if (typeof (connections[i]) === "undefined") continue;
		if (!live[connections[i]]) {
			console.log('Peer id ' + connections[i] + ' left network(dis)');
			for (var j = 0; j < connections.length; j++) {
				if (typeof (connections[j]) !== "undefined" && connections[i] != connections[j])
					try {
						messagesFor[connections[j]].push({'from': connections[i], 'msg': "Disconnect"});
					} catch (e) {
						// TODO: handle exception
					}
			}
			delete messagesFor[connections[i]];
			delete live[connections[i]];
			delete connections[i];
		}
	}
	connections.clean(undefined);
	sendCheckOutMessage();
}

function closeBrowser(info) {
	var index,
		postData = JSON.parse(info.postData),
		res = info.res;
	
	console.log('Peer id ' + postData.id + ' left network(close)');
	for (var i = 0; i < connections.length; i++) {
		if (typeof (connections[i]) === "undefined") continue;
		if (connections[i] != postData.id) {
			try {
				messagesFor[connections[i]].push({'from': postData.id, 'msg': "Disconnect"});
			} catch (e) {
				// TODO: handle exception
			}
		} else index = i;
	}
	delete messagesFor[postData.id];
	delete live[postData.id];
	delete connections[index];
}
exports.close = closeBrowser;

function getListFile(info) {
	var res = info.res;
	connection.connect(function(err) {
	});
	var query = connection.query('SELECT * FROM file_info WHERE del_flg = 0', function(err, result) {
		webrtcResponse(result, res);
	});
}
exports.getfile = getListFile;

function download(info) {
	var postData = JSON.parse(info.postData),
		res = info.res;
	var filename = postData.filename,
		partNum = postData.part,
		mimetype = mime.lookup(postData.filename);

	var partName = filename.replace(/\.[^/.]+$/, "") + '-' + partNum;
	var file = postData.path + '/' + partName;
	
	try {
//		fs.readFile(file, function(err, data){
//			if (err) throw err;
//			res.write(data, 'binary');
//			res.end();
//		});
		fs.readFile(file, 'binary', function(err, data){
			if (!err){
				webrtcResponse({'content': data, 'part': partNum}, res);
			} else {
				console.log(err);
			}
		});
	} catch (e) {
		// TODO: handle exception
	}
}
exports.download = download;

function saveToDisk(content, filename, size, uploader, res) {
	connection.connect(function(err) {
	});
	var foldername = filename.replace(/\.[^/.]+$/, "");
	var type = mime.lookup(filename);
	var post = {filename: filename, size: size, piece: content.length, type: type, uploader: uploader};
	var query = connection.query('INSERT INTO file_info SET ?', post, function(err, result) {
		var fileId = result.insertId;
		foldername = foldername + '-' + fileId;
		query = connection.query('UPDATE file_info SET path = ? WHERE id = ?', [__dirname + '/up-downloads/' + foldername, fileId], function(err, result) {});
		mkdirp(__dirname + '/up-downloads/' + foldername, function(err) {});
		
		setTimeout(function () {
			for (var i = 0; i < content.length; i++) {
				var partname = filename.replace(/\.[^/.]+$/, "") + '-' + i;
				fq.writeFile(__dirname + '/up-downloads/' + foldername + '/' + partname, content[i], 'binary', function(err) {
					if (err) return console.log(err);
				});
			}
		}, 500);
		console.log("The file was saved!");
		showNewFile();
		webrtcResponse('completed', res);
	});
}
	
function upload(info) {
	var postData = JSON.parse(info.postData),
		res = info.res,
		packet = postData.data;

	if (packet.finish) {
		(uploadList[packet.index].buff).push(packet.msg);
		saveToDisk(uploadList[packet.index].buff, uploadList[packet.index].filename, uploadList[packet.index].size, uploadList[packet.index].uploader, res);
		delete uploadList[packet.index];
	}
	else {
		(uploadList[packet.index].buff).push(packet.msg);
		webrtcResponse('Saved packet', res);
	}
}
exports.upload = upload;

function requestupload(info) {
	var postData = JSON.parse(info.postData),
		res = info.res;
	for (var i=0; i<uploadList.length; i++)
		if (typeof (uploadList[i]) === "undefined") {
			uploadList[i] = {"filename": postData.filename, "size": postData.size, "buff": new Array(), "uploader": postData.uploader};
			webrtcResponse({'index': i}, res);
			return;
		}
	uploadList[i] = {"filename": postData.filename, "size": postData.size, "buff": new Array(), "uploader": postData.uploader};
	webrtcResponse({'index': i}, res);
}
exports.requestupload = requestupload;

function signup(info) {
	var postData = JSON.parse(info.postData),
	res = info.res;
	var username = postData.username,
	password = postData.password,
	email = postData.email;
	connection.connect(function(err) {});
	var query = connection.query('SELECT * FROM users WHERE username = ?', [username], function(err, result) {
		if (result.length == 0) {
			var post = {username: username, password: password, email: email};
			query = connection.query('INSERT INTO users SET ?', post, function(err, result) {});
			webrtcResponse({'message': "Signup success", "success": true}, res);
		}
		else {
			webrtcResponse({'message': "Username is used (server)", "success": false}, res);
		}
	});
}
exports.signup = signup;

function signin(info) {
	var postData = JSON.parse(info.postData),
	res = info.res;
	var username = postData.username,
	password = postData.password;
	connection.connect(function(err) {});
	var query = connection.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], function(err, result) {
		if (result.length == 0) webrtcResponse({'message': "Sign in fail (server)", "success": false}, res);
		else webrtcResponse({'message': "Sign in success(server)", "success": true}, res);
	});
}
exports.signin = signin;

function myfiles(info) {
	var postData = JSON.parse(info.postData),
	res = info.res;
	var username = postData.username;
	connection.connect(function(err) {});
	var query = connection.query('SELECT * FROM file_info WHERE uploader = ? AND del_flg = 0', username, function(err, result) {
		webrtcResponse(result, res);
	});
}
exports.myfiles = myfiles;

function deletefile(info) {
	var postData = JSON.parse(info.postData),
	res = info.res;
	var fileId = postData.fileId,
		filename = postData.filename;
	connection.connect(function(err) {});
	var query = connection.query('UPDATE file_info SET del_flg = ? WHERE id = ?', [1, fileId], function(err, result) {});
	var foldername = filename.replace(/\.[^/.]+$/, "") + '-' + fileId;
	rmdir(__dirname + '/up-downloads/' + foldername, function(error){});
	webrtcResponse("File was removed!", res);
}
exports.deletefile = deletefile;

function asynfile(info) {
	var res = info.res;
	connection.connect(function(err) {});
	var query = connection.query('SELECT id FROM file_info WHERE del_flg = 1', function(err, result) {
		webrtcResponse(result, res);
	});
}
exports.asynfile = asynfile;