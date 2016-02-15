require("../../node_modules/three/examples/js/controls/OrbitControls.js");
require("../../node_modules/three/examples/js/loaders/MTLLoader.js");
require("../../node_modules/three/examples/js/loaders/OBJMTLLoader.js");
// let dat = require('../../bower_components/dat-gui/build/dat.gui.js');
let load_car = require("../load_car.js");

let camera = THREE.get_camera();
camera.position.z = 30;
var orbit = new THREE.OrbitControls(camera, renderer.domElement);

THREE.addDefaultLight();

var gui = new dat.GUI();

var TrafficLight = function() {
	this.model = TrafficLight._model.clone();
	var lights = this.model.children[1];
	this.colors = lights.children.slice(1).map(function(v) {return v.material.color;}); // green, yellow, red
	this.lights_on = [0x49e411, 0xd2c100, 0x960101];
	this.lights_off = [0x142d0b, 0x262300, 0x1f0000];
	this.state = 0;
	// this.colors = this.model.
};

TrafficLight.load_model = function(callback) {
	var loader = new THREE.OBJMTLLoader();
	loader.load("models/traffic_lights.obj", "models/traffic_lights.mtl",
		function(obj) {
			TrafficLight._model = obj;
			callback();
		}
	);
};

TrafficLight.prototype = {
	set: function(state) {
		var lights_off = this.lights_off;
		this.colors.forEach(function(c,i) {
			c.setHex(lights_off[i]);
		});
		this.colors[state].setHex(this.lights_on[state]);
		this.state = state;
	}
};

TrafficLight.load_model(function() {
	var light = new TrafficLight();
	scene.add(light.model);
	setInterval(function() {
		light.state += 1;
		if (light.state > 2)
			light.state = 0;
		light.set(light.state);
		render();
	},500);
});


if (false) { // eslint-disable-line
	load_car.load_car(function(car) {
		scene.add(car);
	});
} else if (true) { // eslint-disable-line
	var loader = new THREE.OBJMTLLoader();
	loader.load(
		// "models/traffic lights/3D model traffic lights/test.obj", "models/traffic lights/3D model traffic lights/test.mtl",
		// "models/stop_sign/stop_sign.obj", "models/stop_sign/stop_sign.mtl",
		//"models/traffic_lights_obj/semaforo.obj", "models/traffic_lights_obj/semaforo.mtl",
		"models/traffic_lights.obj", "models/traffic_lights.mtl",
		// "models/stop_sign_obj/stop_sign.obj", "models/stop_sign_obj/stop_sign.mtl",
		//"models/osm/textures/map_small_blender.obj", "models/osm/textures/map_small_blender.mtl",
		// "models/not good.obj", "models/not good.mtl", // <-- gar nicht soo schlecht!
		function(obj) {
			// obj.computeBoundingBox();
			// console.log(obj.bounding_box);
			// scene.add(obj);
			//obj.children[6].children.forEach(function(o) { console.log(o.material.color.getHSL()); });
			function do_gui(obj, gui) {
				obj.children.forEach(function(o, i) {
					gui.add(o, 'visible');
					if (o.children.length > 0) {
						var f = gui.addFolder(o.name + " (" + i + ")");
						do_gui(o, f);
					} else {
						var c = {
							color: o.material.color.getHex()
						};
						gui.addColor(c, 'color').onChange(function() {
							o.material.color.setHex(c.color);
							render();
						});
						gui.__controllers.forEach(function(c) {
							if (c.__onChange === undefined)
								c.onChange(render);
						});
					}
					// o.children.forEach(function(p) {
					// 	f.add(p, 'visible');
					// 	var c = {color:p.material.color.getHex()};
					// 	gui.addColor(c, 'color').onChange(function() { p.material.color.setHex(c.color); render(); });

					// });
					// f.open();
				});
			}
			do_gui(obj, gui);

			setInterval(function() {
				//var obj2 = obj;
			}, 500);
		},
		// Function called when downloads progress
		function ( /*xhr*/ ) {
			//console.log( (xhr.loaded / xhr.total * 100) + '% loaded' );
		},
		// Function called when downloads error
		function ( /*xhr*/ ) {
			console.log( 'An error happened' );
		}
	);
} else if (true) { // eslint-disable-line
	let loader = new THREE.JSONLoader();
	loader.load(//'models/stop-sign/stop_sign.json', 
		// 'models/stop_sign.json',
		"models/osm/textures/map_textures.json",
		function(geo,mats) {
			var mat = new THREE.MeshFaceMaterial(mats);
			var mesh = new THREE.Mesh(geo, mat);
			scene.add(mesh);
		});
} else {
	let loader = new THREE.ObjectLoader();
	var obj = loader.parse('models/semaforo7.json');
	scene.add(obj);
}
scene.add(THREE.buildAxes( 1000 ));

function render() {
	renderer.render(scene, camera);
}
orbit.addEventListener('change', render);
setTimeout(render, 500);