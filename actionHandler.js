var mysql = require('mysql');
var mkdirp = require('mkdirp');
var fs = require('fs');
var mime = require('mime');
var FileQueue = require('filequeue');
var fq = new FileQueue(200);
var rmdir = require('rimraf');

var fileHandler = require("./peerConnectionHandler");

var connection = mysql.createConnection({
		host		: 'localhost',
		user		: 'root',
		password	: '',
		database	: 'csp2p',
	});

var uploadList = [];

function webrtcResponse(response, res) {
	res.writeHead(200, {"Content-Type": "application/json"});
	res.write(JSON.stringify(response));
	res.end();
}

function getAllFiles(info) {
	var res = info.res;
	connection.connect(function(err) {
	});
	var query = connection.query('SELECT * FROM file_info WHERE del_flg = 0', function(err, result) {
		webrtcResponse(result, res);
	});
}
exports.getfile = getAllFiles;

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
		fileHandler.showNewFile;
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

function requestUpload(info) {
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
exports.requestupload = requestUpload;

function signUp(info) {
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
exports.signup = signUp;

function signIn(info) {
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
exports.signin = signIn;

function getMyfiles(info) {
	var postData = JSON.parse(info.postData),
	res = info.res;
	var username = postData.username;
	connection.connect(function(err) {});
	var query = connection.query('SELECT * FROM file_info WHERE uploader = ? AND del_flg = 0', username, function(err, result) {
		webrtcResponse(result, res);
	});
}
exports.myfiles = getMyfiles;

function deleteFile(info) {
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
exports.deletefile = deleteFile;