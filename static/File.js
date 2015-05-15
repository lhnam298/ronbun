function File(_id, _filename, _path, _piece, _type, _size, _progressBar, _canStore) {

	this.id = _id;
	this.filename = _filename;
	this.path = _path;
	this.piece = _piece;
	this.type = _type;
	this.size = _size;
	this.progressBar = _progressBar;
	this.owner = new Array();
	this.inTime = true;
	this.buff = new Array();
	this.receivedNum = 0;
	this.finish = false;
	this.downloadedSize = 0;
	this.canStoreInCache = _canStore;
	
	function downloadFromP2P(index) {
		searchFileInP2P(index);
	}

	File.prototype.downloadFromCache = function (index) {
		var handleError = function () {
			if (connected)
				downloadFromP2P(index);
			else
				downloadFromServer(index);
		};
		
		var folder = this.filename.replace(/\.[^/.]+$/, "") + '-' + this.id,
			part = this.filename.replace(/\.[^/.]+$/, "");

		window.requestFileSystem(window.TEMPORARY, 1024*1024, function(fs) {
			fs.root.getDirectory(folder, {create: false}, function(dirEntry) {
				for (var i = 0; i < downloadList[index].piece; i++) {
					downloadPartFromCache(index, i, folder, part);
				}
			}, handleError);
		}, doNothing);
	}
	
	function downloadFromServer(index) {
		for (var i = 0; i < downloadList[index].piece; i++) {
			downloadPartFromServer(index, i);
		}
	}

	function downloadPartFromServer(index, num) {
		var client = new XMLHttpRequest();
		client.onreadystatechange = function() {
			if(this.readyState == this.DONE) {
				if(this.status == 200 && this.response != null) {
					var res = JSON.parse(this.response);
					downloadList[index].buff[num] = res.content;
					downloadList[index].downloadedSize += res.content.length;
					downloadList[index].progressBar.setPercent(downloadList[index].downloadedSize/downloadList[index].size*100);
					//(this.buff)[num] = this.response;
					console.log('Download part '+ num +' from server');
//					saveFileToCache(res.content, num, index);
					downloadList[index].receivedNum++;
					if (downloadList[index].receivedNum == downloadList[index].piece) {
						downloadList[index].saveToDisk(downloadList[index].buff.join(''), downloadList[index].id,
														downloadList[index].filename, downloadList[index].type);
						downloadList[index].finish = true;
					}
				} else alert('Download fail!');
			}
		};
		client.open("POST", "/download");
		client.send(JSON.stringify({"id": downloadList[index].id, "filename": downloadList[index].filename, "path": downloadList[index].path, "part": num}));
	}

	function searchFileInP2P(index, num) {
		var msg = {"index": index, "filename": downloadList[index].filename, "id": downloadList[index].id, "piece": downloadList[index].piece};
		data.send({'searchfile': msg}, "all");

		setTimeout(function () {
			inTime = false;
			if (downloadList[index].owner.length == 0) {
				if (num)
					downloadPartFromServer(index, num);
				else
					downloadFromServer(index);
			}
			else {
				var arr = downloadList[index].owner;
				if (num)
					downloadPartFromP2P(index, num, arr);
				else
					for (var i = 0; i < downloadList[index].piece; i++)
						downloadPartFromP2P(index, i, arr);
			}
		}, 500);
	}

	function downloadPartFromP2P(index, num, owners) {
		for (var i = 0; i < owners.length; i++) {
			var msg = {"index": index, "filename": downloadList[index].filename, "id": downloadList[index].id, "pieceNum": num};
			data.send({'getpart': msg}, owners[i]);
		}

		setTimeout(function() {
			if (typeof downloadList[index].buff[num] === "undefined")
				downloadPartFromServer(index, num);
		}, 500);
	}

	function downloadPartFromCache(index, num, folder, part) {
		var onPartError = function (index) {
			if (connected) searchFileInP2P(index, num);
			else downloadPartFromServer(index, num);
		}
		var partName = part + '-' + num;
		window.requestFileSystem(window.TEMPORARY, 1024*1024, function(fs) {
			fs.root.getFile('/' + folder + '/' + partName, {create: false}, function(fileEntry) {
				fileEntry.file(function(file) {
					var reader = new FileReader();
					reader.onloadend = function(e) {
						console.log('Download part '+ num +' from cache');
						downloadList[index].buff[num] = this.result;
						downloadList[index].downloadedSize += this.result.length;
						downloadList[index].progressBar.setPercent(downloadList[index].downloadedSize/downloadList[index].size*100);
						downloadList[index].receivedNum ++;
						if (downloadList[index].receivedNum == downloadList[index].piece) {
							downloadList[index].saveToDisk(downloadList[index].buff.join(''), downloadList[index].id,
															downloadList[index].filename, downloadList[index].type);
							downloadList[index].finish = true;
						}
					};
					reader.readAsText(file);
				}, onPartError);
			}, onPartError);
		}, doNothing);
	}

	function saveFileToCache(data, num, index) {
		if (!downloadList[index].canStoreInCache) {
			//console.log('Can not store file in cache');
			return;
		}
		var folder = downloadList[index].filename.replace(/\.[^/.]+$/, "") + '-' + downloadList[index].id,
			partName = downloadList[index].filename.replace(/\.[^/.]+$/, "") + '-' + num;
		
		window.requestFileSystem(window.TEMPORARY, 1024*1024, function(fs) {
			fs.root.getDirectory(folder, {create: true}, function(dirEntry) {
				fs.root.getFile('/' + folder + '/' + partName, {create: true}, function(fileEntry) {
					fileEntry.createWriter(function(fileWriter) {
						fileWriter.onwrite = function(e) {
							//console.log('Saved part ' + num + ' in cache');
						};
						fileWriter.onerror = function(e) {
							console.log('Write failed: ' + e.toString());
						};
						var blob = new Blob([data], {type: 'text/plain'});
						fileWriter.write(blob);
					}, onError);
				}, onError);
			}, onError);
		}, onError);
	}

	function dataURItoBlob(dataURI) {
		// convert base64/URLEncoded data component to raw binary data held in a string
		var byteString;
		if (dataURI.split(',')[0].indexOf('base64') >= 0)
			byteString = atob(dataURI.split(',')[1]);
		else
			byteString = unescape(dataURI.split(',')[1]);
		// separate out the mime component
		var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
		// write the bytes of the string to a typed array
		var ia = new Uint8Array(byteString.length);
		for (var i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}
		return new Blob([ia], {type:mimeString});
	}

	File.prototype.saveToDisk = function (data, id, fileName, type) {
		document.getElementById('my-progressbar' + id).parentNode.removeChild(document.getElementById('my-progressbar' + id));
		document.getElementById('download' + id).style.display = "inline";
		if (document.getElementById('_download' + id) != null) document.getElementById('_download' + id).style.display = "inline";
		cacheManager.listFileInCache.sort(function(a, b) { return a.id - b.id });
		var index = cacheManager.binarySearch(id, 0, (cacheManager.listFileInCache).length - 1, cacheManager.listFileInCache);
		if (index != null) (cacheManager.listFileInCache)[index].canDelete = true;
		/**/
		var blobURL = dataURItoBlob(data);
		var save = new Blob([blobURL], {type: type});
		var downloadLink = document.createElement("a");
			downloadLink.download = fileName;
		if ((window.URL || window.webkitURL) != null)
			downloadLink.href = (window.URL || window.webkitURL).createObjectURL(save);
		downloadLink.click();
		// measure time
		finishTime = Date.now();
		console.log(finishTime - startTime);
	}

}