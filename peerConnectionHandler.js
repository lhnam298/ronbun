var connections = [],
	messagesFor = [],
	live = [];

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
	setTimeout(clearMemory, 15000);
}
exports.sendcheck = sendCheckOutMessage;

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

function showNewFile() {
	for (var i = 0; i < connections.length; i++) {
		try {
			messagesFor[connections[i]].push({'from': "server", 'msg': "New file"});
		} catch (e) {
			// TODO: handle exception
		}
	}
}
exports.showNewFile = showNewFile;