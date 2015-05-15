function connect() {
	document.getElementById('connect').style.display = "none";
	var scHandlers = {
		'onWaiting': function (peerId) {
			setStatus("Waiting");
			connected = false;
			myId = peerId;
		},
		'onConnected': function (list, peerId) {
			setStatus("Connecting");
			myId = peerId;
			function onOffer(localDesc) {
				pc[this.id].setLocalDescription(localDesc);
				send(localDesc, this.id);
			}
			for (var i = 0; i < list.length; i++) {
				if (list[i] == null || list[i] == myId) continue;
				var id = list[i];
				partners.push(id);
				pc[id] = createPC(id);
				dc[id] = pc[id].createDataChannel('chat' + id);
				setupDataHandlers();
				pc[id].createOffer(onOffer.bind({id:id}), doNothing);
			}
			if (partners.length == 0) setStatus("Waiting");
		},
		'onDisconnected': function () {
			pc = [];
			dc = [];
			partners = [];
			setStatus("Disconnected");
			connected = false;
		},
		'onMessage': function (from, msg) {
			if (msg == 'Disconnect') {
				delete pc[from];
				delete dc[from];
				
				for (var i = 0; i < partners.length; i++) {
					if (from == partners[i]) {
						if (i == partners.length - 1) partners.length -= 1;
						else {
							partners[i] = partners[partners.length - 1];
							partners.length -= 1;
						}
					}
				}
				if (partners.length == 0) {
					setStatus("Waiting");
					connected = false;
				}
			}
			else {
				if (msg.type === "offer") {
					partners.push(from);
					pc[from] = createPC(from);
					pc[from].setRemoteDescription(new RTCSessionDescription(msg));
					pc[from].createAnswer(function (localDesc) {
						pc[from].setLocalDescription(localDesc);
						send(localDesc, from);
					}, doNothing);
				} else if (msg.type === "answer") {
					pc[from].setRemoteDescription(new RTCSessionDescription(msg));
				} else if (msg.type === "candidate") {
					pc[from].addIceCandidate(new RTCIceCandidate({sdpMLineIndex:msg.mlineindex, candidate:msg.candidate}));
				}
			}
		}
	};
	signalingChannel = createSignalingChannel(scHandlers);
	signalingChannel.connect();
}

function send(msg, to) {
	signalingChannel.send(msg, to);
}

function createPC(id) {
	var config = new Array();
	config.push(
			{"url":'stun:stun.l.google.com:19302'}
	);
	config.push(
			{"url": 'turn:numb.viagenie.ca',
			"credential": 'muazkh',
			"username": 'webrtc@live.com'}
	);

//	console.log("config = " + JSON.stringify(config));

	var _pc = new RTCPeerConnection({iceServers:config});
	_pc.onicecandidate = function (e) {
		if (e.candidate) {
			send({type:  'candidate', mlineindex: e.candidate.sdpMLineIndex, candidate: e.candidate.candidate}, id);
		}
	}

	_pc.onaddstream = function (e) {
	}

	_pc.onremovestream = function(e) {
	}

	_pc.ondatachannel = function (e) {
		dc[id] = e.channel;
		setupDataHandlers();
	}

	return _pc;
}

function sendChat() {
	var cb = document.getElementById("chatbox"),
		c = document.getElementById("chat"),
		to = "all",
		msg = {};

	msg.content = c.value;
	msg.from = user.username;
	if (msg.content != "" && connected) {
		cb.value += ">> " + msg.content + "\n";
		data.send({'chat': msg}, to);
		c.value = '';
		cb.scrollTop = cb.scrollHeight;
	}
}

function setupDataHandlers() {
	setStatus("Connected");
	connected = true;
	data.send = function(msg, to) {
		msg = JSON.stringify(msg);
		if (to == "all") {
			for (var i = 0; i < partners.length; i++) {
				try {
					dc[partners[i]].send(msg);
				} catch (e) {
					// TODO: handle exception
				}
			}
		} else {
			try {
				dc[to].send(msg);
			} catch (e) {
				// TODO: handle exception
			}
		}
//		console.log("sending " + msg + " over data channel");
	}

	for (var i = 0; i < partners.length; i++) {
		if (typeof (partners[i]) === "undefined") continue;
		var peerId = partners[i];
		dc[peerId].onmessage = function(e) {
			var msg = JSON.parse(e.data);
			
			if (msg.chat) {
				cb = document.getElementById("chatbox");
//				console.log("received chat of '" + (msg.chat).content + "'");
				if ((msg.chat).from != "")
					cb.value += (msg.chat).from +": " + (msg.chat).content + "\n";
				else
					cb.value += "Anonymously: " + (msg.chat).content + "\n";
				cb.scrollTop = cb.scrollHeight;
				msg = msg.chat;
				
			} else if (msg.data) {
				if ( !downloadList[(msg.data).index].finish ) {
					var buff = downloadList[(msg.data).index].buff;
					if (typeof (buff[(msg.data).pieceNum]) === "undefined") {
						buff[(msg.data).pieceNum] = (msg.data).data;
						downloadList[(msg.data).index].downloadedSize += (msg.data).data.length;
						downloadList[(msg.data).index].progressBar.setPercent(downloadList[(msg.data).index].downloadedSize/downloadList[(msg.data).index].size*100);
						console.log('Download part '+ (msg.data).pieceNum +' from p2p');
//						saveFileToCache((msg.data).data, (msg.data).pieceNum, downloadList[(msg.data).index]);
						downloadList[(msg.data).index].receivedNum ++;
						if (downloadList[(msg.data).index].receivedNum == downloadList[(msg.data).index].piece) {
							downloadList[(msg.data).index].saveToDisk(buff.join(''), downloadList[(msg.data).index].id,
									downloadList[(msg.data).index].filename, downloadList[(msg.data).index].type);
							downloadList[(msg.data).index].finish = true;
						}
					}
				}

			} else if (msg.searchfile) {
				searchFileForPeer(	(msg.searchfile).index,
									(msg.searchfile).id,
									(msg.searchfile).filename,
									(msg.searchfile).piece,
									peerId
				);

			} else if (msg.hasfile) {
				if (downloadList[(msg.hasfile).index].inTime) (downloadList[(msg.hasfile).index].owner).push(peerId);	
			
			} else if (msg.getpart) {
				sendFileToPeer(	(msg.getpart).index,
								(msg.getpart).id,
								(msg.getpart).filename,
								(msg.getpart).pieceNum,
								peerId
				);

			} else if (msg.finduser) {
				function onSearchUser(fs) {
					fs.root.getFile('/users/' + (msg.finduser).username, {create: false}, function(fileEntry) {
						if (typeof ((msg.finduser).password) === "undefined") {
							msg = {};
							data.send({"existuser": msg}, peerId);
						} else {
							fileEntry.file(function(file) {
								var reader = new FileReader();
								reader.onloadend = function(e) {
									if (this.result == (msg.finduser).password) msg = {"signin": true};
									else msg = {"signin": false};
									data.send({"existuser": msg}, peerId);
								};
								reader.readAsText(file);
							}, onError);
						}
					}, onError);
				}
				window.requestFileSystem(TEMPORARY, 1024*1024 /*1MB*/, onSearchUser, onError);
			
			} else if (msg.existuser) {
				existUser = true;
				if (typeof (msg.existuser).signin !== "undefined") signinSuccess = (msg.existuser).signin;
			
			} else if (msg.seedfile) {
				user.createUserFile((msg.seedfile).username, (msg.seedfile).password);
			
			} else if (msg.deletefile) {
				deleteFileOnCache((msg.deletefile).fileId, (msg.deletefile).filename);
				var rowIndex = document.getElementById("file" + (msg.deletefile).fileId).rowIndex;
				document.getElementById("all-file-table").deleteRow(rowIndex);
			}

		};
	}
}

function setStatus(str) {
	var statusline = document.getElementById("statusline"),
		status = document.getElementById("status"),
		btnconnect = document.getElementById("connect");
	switch (str) {
		case 'Waiting':
			statusline.style.display = "inline";
			status.innerHTML = "No peer in network";
			btnconnect.style.display = "none";
			break;
		case 'Connecting':
			statusline.style.display = "inline";
			break;
		case 'Connected':
			status.innerHTML = "Connected";
			break;
		case 'Disconnected':
			status.innerHTML = "Disconnected p2p system";
			btnconnect.innerHTML = "Reconnect";
			btnconnect.style.display = "inline";
			break;
		default:
	}
}