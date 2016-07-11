require("../node_modules/three/examples/js/controls/TrackballControls.js");
require("../node_modules/three/examples/js/loaders/MTLLoader.js");
//require("../../node_modules/three/examples/js/loaders/OBJMTLLoader.js");
require("../node_modules/three/examples/js/loaders/OBJLoader.js");
// let dat = require('../../bower_components/dat-gui/build/dat.gui.js');
const load_car = require("./load_car.js");
const misc = require('./misc.js');

let camera = THREE.get_camera();
camera.position.z = 30;
var controls = new THREE.TrackballControls(camera, renderer.domElement);

THREE.addDefaultLight();

var gui = new dat.GUI();


if (false) { // eslint-disable-line
	load_car.load_car(function(car) {
		scene.add(car);
	});
} else if (false) { // eslint-disable-line
	let loader = new THREE.OBJLoader();
	loader.load(
		'models/volvo.obj',
		function ( obj ) {
			scene.add( obj );
		}
	);
} else if (true) { //eslint-disable-line+
	misc.load_obj_mtl_url('models/', 'test.obj', 'test.mtl').then(obj => {
	// misc.load_obj_mtl_url('models/speed_sign/', 'speed_sign.obj', 'speed_sign.mtl').then(obj => {
	//misc.load_obj_mtl_url('models/stop_sign/', 'stop_sign.obj', 'stop_sign.mtl').then(obj => {
		scene.add(obj);
		
	});
} else if (false) { // eslint-disable-line
	var loader = new THREE.OBJMTLLoader();
	loader.load(
		// "models/traffic lights/3D model traffic lights/test.obj", "models/traffic lights/3D model traffic lights/test.mtl",
		// "models/stop_sign/stop_sign.obj", "models/stop_sign/stop_sign.mtl",
		//"models/traffic_lights_obj/semaforo.obj", "models/traffic_lights_obj/semaforo.mtl",
		// "models/traffic_lights.obj", "models/traffic_lights.mtl",
		// "models/ferrari/ferrari4.obj", "models/ferrari/ferrari4.mtl",
		// "models/stop_sign_obj/stop_sign.obj", "models/stop_sign_obj/stop_sign.mtl",
		//"models/osm/textures/map_small_blender.obj", "models/osm/textures/map_small_blender.mtl",
		"models/own.obj", "models/own.mtl", // <-- gar nicht soo schlecht!
		function(obj) {
			// obj.computeBoundingBox();
			// console.log(obj.bounding_box);
			scene.add(obj);
			//obj.children[6].children.forEach(function(o) { console.log(o.material.color.getHSL()); });
			function do_gui(obj, gui) {
				obj.children.forEach(function(o, i) {
					gui.add(o, 'visible');
					if (o.children.length > 0) {
						var f = gui.addFolder(o.name + " (" + i + ")");
						do_gui(o, f);
					} else {
						console.log(o.material);
						var c = {
							color: o.material.color.getHex(),
							emissive: o.material.emissive.getHex()
						};
						gui.addColor(c, 'color').onChange(function() {
							o.material.color.setHex(c.color);
							render();
						});
						gui.addColor(c, 'emissive').onChange(function() {
							o.material.emissive.setHex(c.emissive);
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
} else if (false) { // eslint-disable-line
	let loader = new THREE.JSONLoader();
	loader.load(//'models/stop-sign/stop_sign.json', 
		'models/volvo.json',
		// "models/osm/textures/map_textures.json",
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
	// console.log("render");
	renderer.render(scene, camera);
}

controls.rotateSpeed = 2.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 2.0;
controls.dynamicDampingFactor = 0.3;

function animate() {
	controls.update();
	requestAnimationFrame(animate);
}

controls.addEventListener('change', render);
setTimeout(render, 500);
animate();