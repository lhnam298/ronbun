window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

var fs = null;

if (window.requestFileSystem) {
	viewListFolder();
//	removeFolder();
} else {
	alert('Sorry! Your browser doesn\'t support the FileSystem API');
}

function viewListFolder() {
	function onRead(fs) {
		fs.root.getDirectory('/', {}, function(dirEntry) {
			var dirReader = dirEntry.createReader();
			dirReader.readEntries(function(entries) {
				for(var i = 0; i < entries.length; i++) {
					var entry = entries[i];
					if (entry.isDirectory) {
						console.log('Directory: ' + entry.fullPath);
					}
					else if (entry.isFile) {
						console.log('File: ' + entry.fullPath);
					}
				}
			}, onError);
		}, onError);
	}
	window.requestFileSystem(TEMPORARY, 1024*1024 /*1MB*/, onRead, onError);
}

function removeFolder() {
	function onRead(fs) {

		fs.root.getFile('/history.txt', {}, function(fileEntry) {
			fileEntry.remove(function() {
				console.log('File removed.');
			}, onError);
		}, onError);
			
//		fs.root.getDirectory('/1-159', {}, function(dirEntry){			
//			dirEntry.removeRecursively(function() {
//				console.log('Directory removed.');
//			}, onError);
//		}, onError);
	}
	window.requestFileSystem(TEMPORARY, 1024*1024 /*1MB*/, onRead, onError);
}
//=======================================================================================================================
var onError = function() {
	console.log('error');
}

function CacheManager() {

	this.usedMemory = 0;
	this.listFileInCache = new Array();
	this.memoryLimited = 2097152;
	this.fileSizeLimited = 2097152;
	
}

CacheManager.prototype.clearCacheMemory = function (id, filename) {
	var path = '/' + filename.replace(/\.[^/.]+$/, "") + '-' + id;
	function onRemoveData(fs) {
		fs.root.getDirectory(path, {}, function(dirEntry){			
			dirEntry.removeRecursively(function() {
				console.log('Removed file ' + filename);
			}, onError);
		}, onError);
	}
	window.requestFileSystem(TEMPORARY, 1024*1024 /*1MB*/, onRemoveData, onError);
}

CacheManager.prototype.checkCacheMemory = function (size) {
	while (1) {
		if (this.usedMemory + size <= this.memoryLimited) return true;
		if (!this.listFileInCache[this.listFileInCache.length - 1].canDelete) return false;
		this.usedMemory -= this.listFileInCache[this.listFileInCache.length - 1].size;
//		this.clearCacheMemory(this.listFileInCache[this.listFileInCache.length - 1].id, this.listFileInCache[this.listFileInCache.length - 1].filename);
		this.listFileInCache.length -= 1;
	}
}

CacheManager.prototype.binarySearch = function (key, first, last, arr) {
	if (first > last) return null;
	var mid = Math.floor((first + last)/2);
	if (arr[mid].id > key)
		return cacheManager.binarySearch(key, first, mid-1, arr);
	else if (arr[mid].id < key)
		return cacheManager.binarySearch(key, mid+1, last, arr);
	else return mid;
}

CacheManager.prototype.canStoreInCache = function (id, filename, size) {
	if (size > this.fileSizeLimited) return false;
	this.listFileInCache.sort(function(a, b) { return a.id - b.id });
	var index = this.binarySearch(id, 0, this.listFileInCache.length - 1, this.listFileInCache);
	if (index != null) {
		this.listFileInCache[index].canDelete = false;
		this.listFileInCache[index].download_date = Date.now();
		this.writeManifest(this.listFileInCache);
		return true;
	}
	if (index == null) {
		this.listFileInCache.sort(function(a,b) { return b.download_date - a.download_date });
		var flag = this.checkCacheMemory(size);
		if (flag) {
			var newfile = {
								"id": id,
								"filename": filename,
								"size": size,
								"download_date": Date.now(),
								"canDelete": false
			};
			this.usedMemory += size;
			this.listFileInCache.push(newfile);
			this.writeManifest(this.listFileInCache);
			return true;
		} else
			return false;
	}
}

CacheManager.prototype.writeManifest = function (list) {
	function onWriteManifest(fs) {
		fs.root.getFile('/history.txt', {create: true}, function(fileEntry) {
			fileEntry.createWriter(function(fileWriter) {
				fileWriter.onwrite = function(e) {
					console.log('Write completed.');
				};
				fileWriter.onerror = function(e) {
					console.log('Write failed: ' + e.toString());
				};
				var file = '';
				for (var i = 0; i < list.length; i++) {
					var row = list[i].id + '\t' + list[i].filename + '\t' + list[i].size + '\t' + list[i].download_date;
					if (i < list.length - 1) row = row + '\n';
					file = file + row;
				}
				var blob = new Blob([file], {type: 'text/plain'});
				fileWriter.onwriteend = function() {
					if (fileWriter.length === 0) {
						fileWriter.write(blob);
					}
				};
				fileWriter.truncate(0);
			}, onError);
		}, onError);
	}
	window.requestFileSystem(TEMPORARY, 1024*1024 /*1MB*/, onWriteManifest, onError);
}

CacheManager.prototype.readManifest = function() {
	function onReadManifest(fs) {
		fs.root.getFile('/history.txt', {create: false}, function(fileEntry) {
			fileEntry.file(function(file) {
				var reader = new FileReader();
				reader.onloadend = function(e) {
					if (this.result != "") {
						console.log(this.result);
						var array = this.result.split('\n');
						for (var i = 0; i < array.length; i++) {
							var temp = array[i].split('\t');
							var file = {
											"id": parseInt(temp[0]),
											"filename": temp[1],
											"size": parseInt(temp[2]),
											"download_date": parseInt(temp[3]),
											"canDelete": true
							};
							cacheManager.usedMemory += file.size;
							cacheManager.listFileInCache[i] = file;
						}
					}
				};
				reader.readAsText(file);
			}, onError);
		}, onError);
	}
	window.requestFileSystem(TEMPORARY, 1024*1024 /*1MB*/, onReadManifest, onError);
}