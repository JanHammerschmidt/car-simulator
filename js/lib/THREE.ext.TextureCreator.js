"use strict";

THREE.ext = THREE.ext || {};

// const SmoothieChart = require("SmoothieChart");
THREE.ext.TextureCreator = {
	chart: function(options) {
		options = options || {};
		options.width = options.width || 800;
		options.height = options.height || 600;
		options.delay = options.delay || 50;

		var chart = new SmoothieChart();
		var canvas = document.createElement('canvas');
		document.body.appendChild(canvas);

		canvas.width = options.width;
		canvas.height = options.height;

		var texture = new THREE.Texture(canvas);

		chart.streamTo(canvas, options.delay);

		return {
			texture: texture,
			canvas: canvas,
			chart: chart,
			update: () => {
				texture.needsUpdate = true;
			}
		}
	},
	text: function(options) {
		options = options || {};
		var defaultSize = 1024;
		options.width = options.width || defaultSize;
		options.height = options.height || options.width || defaultSize;

		var canvas = document.createElement('canvas');
		canvas.width = options.width;
		canvas.height = options.height;

		var ctx = canvas.getContext('2d');

		var texture = new THREE.Texture(canvas);

		var setFont = function(ctx, fontOptions) {
			fontOptions = fontOptions || {};
			fontOptions.weight = fontOptions.weight || "Normal";
			fontOptions.size = fontOptions.size || "500px";
			fontOptions.family = fontOptions.family || 'Arial';
			fontOptions.align = fontOptions.align || "center";
			fontOptions.color = fontOptions.color || "rgba(198,106,103,1)";
			fontOptions.background = fontOptions.background ||  "rgba(32,12,16,1.0)";
			ctx.font = [fontOptions.weight,fontOptions.size,"'" + fontOptions.family + "'"].join(" ");
			ctx.textAlign = fontOptions.align;
			ctx.fillStyle = fontOptions.color;
			ctx._fontOptions = fontOptions;
		};

		setFont(ctx,options.font);

		var obj = {
			canvas: canvas,
			texture: texture,
			writeText: function(text,position) {
				position = position || {x: 0.5,y:0.5};
				position.x *= canvas.width;
				position.y *= canvas.height;
				ctx.fillStyle = ctx._fontOptions.background;
				ctx.clearRect(0,0,canvas.width,canvas.height);
				ctx.fillRect(0,0,canvas.width,canvas.height);
				ctx.fillStyle = ctx._fontOptions.color;
				ctx.fillText(text, position.x,position.y);
				texture.needsUpdate = true;
			},
			setFont: function(fontOptions) {
				setFont(ctx,fontOptions);
			}
		}

		return obj;
	},

	video: function(videoUrl,options) {
		console.warn("Not implemented yet");
	},

	camera: function(options, callback) {
		console.warn("THREE.ext.TextureCreator.camera uses navigator.getUserMedia which might be deprecated soon. Switch to navigator.MediaDevices");
		options = options || {};
		options.width = options.width || 1280;
		options.height = options.height || 720;

		callback = callback || function(){};

		if (THREE.ext.TextureCreator._cameraTexture) {
			return callback(null,THREE.ext.TextureCreator._cameraTexture);
		}
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

		if (navigator.getUserMedia) {
			navigator.getUserMedia({ audio: false, video: { width: options.width, height: options.height } },
				function(stream) {
					var video = THREE.ext.TextureCreator._cameraSrc || document.createElement('video');
					THREE.ext.TextureCreator._cameraSrc = video;

					var canvas = document.createElement('canvas');
					canvas.width = options.width;
					canvas.height = options.height;

					var ctx = canvas.getContext("2d");

					var videoTexture = new THREE.Texture(video);
					videoTexture.minFilter = THREE.LinearFilter;
					THREE.ext.TextureCreator.cameraTexture = {
						canvas: canvas,
						texture: videoTexture,
						update: function() {
							if (video.readyState === video.HAVE_ENOUGH_DATA) {
								ctx.drawImage(video,0,0,canvas.width,canvas.height);
								videoTexture.needsUpdate = true;
							}
						},
						toDataURL: function() {
							return canvas.toDataURL();
						}
					};

					video.src = window.URL.createObjectURL(stream);
					video.onloadedmetadata = function() {
						video.play();
					};

					callback(null, THREE.ext.TextureCreator.cameraTexture)
				},
				function(err) {
					console.log("The following error occurred: " + err.name);
					callback(err);
				}
			);
		} else {
			callback("getUserMedia not supported");
		}
	}
};