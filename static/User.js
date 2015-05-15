function User() {
	
	this.username = getCookie("user");
	
	function seedUserFile(username, password) {
		var msg = {"username": Sha256.hash(username), "password": Sha256.hash(password)};
		data.send({'seedfile': msg}, "all");
	}
	
	User.prototype.createUserFile = function (username, password) {
		window.requestFileSystem(window.TEMPORARY, 1024*1024, function(fs) {
			fs.root.getDirectory('/users', {create: true}, function(dirEntry) {
				fs.root.getFile('/users/' + username, {create: true}, function(fileEntry) {
					fileEntry.createWriter(function(fileWriter) {
						fileWriter.onwrite = function(e) {
							console.log('Create user info in cache');
						};
						fileWriter.onerror = function(e) {
							console.log('Write failed: ' + e.toString());
						};
						var blob = new Blob([password], {type: 'text/plain'});
						fileWriter.write(blob);
					}, onError);
				}, onError);
			}, onError);
		}, onError);
	}

	function getCookie(cname) {
		var name = cname + "=";
		var ca = document.cookie.split(';');
		for(var i=0; i<ca.length; i++) {
			var c = ca[i];
			while (c.charAt(0)==' ') c = c.substring(1);
			if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
		}
		return "";
	}

	function setCookie(cname, cvalue, exdays) {
		var d = new Date();
		d.setTime(d.getTime() + (exdays*24*60*60*1000));
		var expires = "expires="+d.toUTCString();
		document.cookie = cname + "=" + cvalue + "; " + expires;
	}

	User.prototype.signout = function() {
		setCookie("user", "", -1);
		user.username = "";
	}

	User.prototype.signin = function() {
		signinSuccess = null;
		var _username = document.getElementById('_username').value;
		var _password = document.getElementById('_pass').value;
		if (_username == "" || _password == "") { 
			alert('Enter field!'); 
			return;
		}

		function searchUserInP2P() {
			if (!connected) {
				signInAtServer();
				return;
			}
			var msg = {"username": Sha256.hash(_username), "password": Sha256.hash(_password)};
			data.send({'finduser': msg}, "all");
			setTimeout(signInAtServer, 500);
		}

		function onSearchUserInCache(fs) {
			fs.root.getFile('/users/' +  Sha256.hash(_username), {create: false}, function(fileEntry) {
				fileEntry.file(function(file) {
					var reader = new FileReader();
					reader.onloadend = function(e) {
						if (this.result == Sha256.hash(_password)) {
							user.username = _username;
							setCookie('user', _username, 1);
							setState();
							console.log('Confirm user in cache');
							$('#over, .signin').fadeOut(300 , function() {
								$('#over').remove();
							});
						} else alert('Sign in fail (cache)');
					}
					reader.readAsText(file);
				}, searchUserInP2P);
			}, searchUserInP2P);
		}
		window.requestFileSystem(TEMPORARY, 1024*1024 , onSearchUserInCache, onError);

		function signInAtServer() {
			if (signinSuccess == null) {
				var client = new XMLHttpRequest();
				client.onreadystatechange = function() {
					if(this.readyState == this.DONE) {
						if(this.status == 200 && this.response != null) {
							var res = JSON.parse(this.response);
							alert(res.message);
							if (res.success) {
								user.createUserFile(Sha256.hash(_username), Sha256.hash(_password));
								user.username = _username;
								setCookie('user', _username, 1);
								setState();
								console.log('Confirm user in server');
								$('#over, .signin').fadeOut(300 , function() {
									$('#over').remove();
								});
							}
						}
					}
				};
				client.open("POST", "/signin");
				client.send(JSON.stringify({"username": _username, "password": Sha256.hash(_password)}));
			} else if (signinSuccess) {
				alert('Login success');
				user.createUserFile(Sha256.hash(_username), Sha256.hash(_password));
				user.username = _username;
				setCookie('user', _username, 1);
				setState();
				console.log('Confirm user in p2p');
				$('#over, .signin').fadeOut(300 , function() {
					$('#over').remove();
				});
			} else alert('Sign in fail (p2p)');
		}
	}

	User.prototype.signup = function() {
		existUser = false;
		var username = document.getElementById('username').value;
		var password = document.getElementById('pass').value;
		var repassword = document.getElementById('re_pass').value;
		var email = document.getElementById('email').value;
		if (username == "" || password == "" || repassword == "" || email == "") { alert('Enter field!'); return;}
		if (password != repassword) { alert('Password is not match!'); return;}
		
		function onSearchUserInCache(fs) {
			fs.root.getFile('/users/' +  Sha256.hash(username), {create: false}, function(fileEntry) {
				alert('Username is used (cache)');
			}, searchUserInP2P);
		}
		window.requestFileSystem(TEMPORARY, 1024*1024, onSearchUserInCache, onError);
		
		var searchUserInP2P = function() {
			if (!connected) { signupAtServer(); return;}
			var msg = {"username": Sha256.hash(username)};
			data.send({'finduser': msg}, "all");
			setTimeout(signupAtServer, 500);
		}
		
		function signupAtServer() {
			if (existUser) alert('Username is used (p2p)');
			else {
				var client = new XMLHttpRequest();
				client.onreadystatechange = function() {
					if(this.readyState == this.DONE) {
						if(this.status == 200 && this.response != null) {
							var res = JSON.parse(this.response);
							if (res.success) {
								user.createUserFile(Sha256.hash(username), Sha256.hash(password));
								if (connected) seedUserFile(username, password);
							}
							alert(res.message);
						}
					}
				};
				client.open("POST", "/signup");
				client.send(JSON.stringify({"username": username, "password": Sha256.hash(password), "email": email}));
			}
		}
	}
	
	function getUploadId(filename, size, callback) {
		var client = new XMLHttpRequest();
		client.onreadystatechange = function() {
			if(this.readyState == this.DONE) {
				if (this.status == 200 && this.response != null) {
					var res = JSON.parse(this.response);
					callback(res.index);
				}
			}
		}
		client.open("POST", "/requestupload");
		client.send(JSON.stringify({"filename": filename, "size": size, "uploader": user.username}));
	}
	
	User.prototype.upload = function () {
		var file = document.getElementById("files").files[0],
		filename = (document.getElementById("files").value).replace(/^.*[\\\/]/, '');
		if (filename == "") return;
		var	chunkLength = 1024*4,
			size = file.size,
			uploadedSize = 0;
		var div = document.createElement('div');
		div.id = "my-progressbar";
		document.getElementById('file-area').appendChild(div);
		var progressBar = new ProgressBar("my-progressbar", {'width': '100%', 'height': '10px'});
		document.getElementById('upload-title').innerHTML = "Uploading...";
		document.getElementById('files').style.display = "none";
		document.getElementById('upload').style.display = "none";
		
		getUploadId(filename, size, function (index) {
			var reader = new FileReader();
			reader.readAsDataURL(file);
			reader.onloadend = onReadAsDataURL;
			function onReadAsDataURL(evt, dt) {
				var packet = {};
				if (evt)dt = evt.target.result;
				if (dt.length > chunkLength) {
					packet.msg = dt.slice(0, chunkLength);
					packet.finish = false;
					packet.index = index;
				} else {
					packet.msg = dt;
					packet.finish = true;
					packet.index = index;
				}
				var client = new XMLHttpRequest();
				client.onreadystatechange = function() {
					if(this.readyState == this.DONE) {
						if (this.status == 200 && this.response != null) {
							var res = JSON.parse(this.response);
							uploadedSize += (packet.msg).length;
							progressBar.setPercent(uploadedSize/size*100);
							var remainingData = dt.slice((packet.msg).length);
							if (remainingData.length) onReadAsDataURL(null, remainingData);
							if (res == 'completed') {
								getAllFiles();
								getMyFiles(user.username);
								document.getElementById('upload-title').innerHTML = "Choose file to upload";
								document.getElementById('files').style.display = "inline";
								document.getElementById('upload').style.display = "inline";
								document.getElementById('file-area').removeChild(div);
							}
						}
					}
				};
				client.open("POST", "/upload");
				client.send(JSON.stringify({"data": packet}));
			}
		});
	}
}