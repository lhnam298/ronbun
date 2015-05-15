var server = require("./server");
var requestHandlers = require("./requestHandlers");
var port = Number(process.env.PORT || 3000);

var handle = {};
handle["/"] = function fourohfour(info) {
	var res = info.res;
	console.log("Request handler fourohfour was called.");
	res.writeHead(404, {"Content-Type": "text/plain"});
	res.write("404 Page Not Found");
	res.end();
};
handle["/connect"] = requestHandlers.connect;
handle["/send"] = requestHandlers.send;
handle["/get"] = requestHandlers.get;
handle["/checkout"] = requestHandlers.getcheck;
handle["/close"] = requestHandlers.close;
handle["/download"] = requestHandlers.download;
handle["/upload"] = requestHandlers.upload;
handle["/requestupload"] = requestHandlers.requestupload;
handle["/filelist"] = requestHandlers.getfile;
handle["/signup"] = requestHandlers.signup;
handle["/signin"] = requestHandlers.signin;
handle["/myfiles"] = requestHandlers.myfiles;
handle["/deletefile"] = requestHandlers.deletefile;
handle["/asynfile"] = requestHandlers.asynfile;

server.serveFilePath("static");
server.start(handle, port);
setTimeout(requestHandlers.sendcheck, 0);