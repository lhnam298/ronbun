var server = require("./server");
var actionHandler = require("./actionHandler");
var peerConnectionHandler = require("./peerConnectionHandler");
var port = Number(process.env.PORT || 3000);

var handle = {};
	handle["/"] = function fourohfour(info) {
		var res = info.res;
		console.log("Request handler fourohfour was called.");
		res.writeHead(404, {"Content-Type": "text/plain"});
		res.write("404 Page Not Found");
		res.end();
	};
handle["/connect"] = peerConnectionHandler.connect;
handle["/send"] = peerConnectionHandler.send;
handle["/get"] = peerConnectionHandler.get;
handle["/checkout"] = peerConnectionHandler.getcheck;
handle["/close"] = peerConnectionHandler.close;
handle["/download"] = actionHandler.download;
handle["/upload"] = actionHandler.upload;
handle["/requestupload"] = actionHandler.requestupload;
handle["/filelist"] = actionHandler.getfile;
handle["/signup"] = actionHandler.signup;
handle["/signin"] = actionHandler.signin;
handle["/myfiles"] = actionHandler.myfiles;
handle["/deletefile"] = actionHandler.deletefile;

server.serveFilePath("static");
server.start(handle, port);
setTimeout(peerConnectionHandler.sendcheck, 0);