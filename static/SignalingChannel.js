var createSignalingChannel = function(handlers) {
	var id;
	function connect() {
		var client = new XMLHttpRequest();
		client.onreadystatechange = function() {
			if(this.readyState == this.DONE) {
				if(this.status == 200 && this.response != null) {
					var res = JSON.parse(this.response);
					if (res.err) return;
					id = res.id;
					poll();
					var size = (res.list).filter(function(value) { return value != null }).length;
					if (size == 1) handlers.onWaiting(id);
					else handlers.onConnected(res.list, id);
					return;
				} else return;
			}
		};
		client.open("POST", "/connect");
		client.send();
	}
	
	function poll() {
		var msgs;
		var pollWaitDelay = (function() {
			var delay = 10, counter = 1;
			function reset() {
				delay = 10;
				counter = 1;
			}
			function increase() {
				counter += 1;
				if (counter > 20) {
					delay = 1000;
				} else if (counter > 10) {
					delay = 100;
				}
			}
			function value() {
				return delay;
			}
			return {reset: reset, increase: increase, value: value};
		}());
	
		(function getLoop() {
			get(function (response) {
				var i, msgs = (response && response.msgs) || [];
				if (msgs.length > 0) {
					pollWaitDelay.reset();
					for (i=0; i<msgs.length; i+=1) {
						if (msgs[i].from == 'server') {
							if (msgs[i].msg == "Check live") responseCheckOutMessage();
							if (msgs[i].msg == "New file") getAllFiles();
						} else {
							handlers.onMessage(msgs[i].from, msgs[i].msg);
						}
					}
				} else {
					pollWaitDelay.increase();
				}
				setTimeout(getLoop, pollWaitDelay.value());
			});
		}());
	}
	
	function responseCheckOutMessage() {
		var client = new XMLHttpRequest();
		client.onreadystatechange =  function () {
		};
		client.open("POST", "/checkout");
		client.send(JSON.stringify({"id": id}));
	}
	
	function get(getResponseHandler) {
		var client = new XMLHttpRequest();
		client.onreadystatechange =  function () {
			if(this.readyState == this.DONE) {
				if(this.status == 200 && this.response != null) {
					var res = JSON.parse(this.response);
					if (res.err) {
						getResponseHandler(res.err);
						return;
					}
					getResponseHandler(res);
					return res;
				} else {
					handlers.onDisconnected();
					return;
				}
			}
		};
		client.open("POST", "/get");
		client.send(JSON.stringify({"id": id}));
	}
	
	function send(msg, to) {
		var client = new XMLHttpRequest();
		client.onreadystatechange = function() {
		};
		client.open("POST", "/send");
		var sendData = {"id": id, "message": msg, "to": to};
		client.send(JSON.stringify(sendData));
	}

	return {
		connect: connect,
		send: send
	};
};