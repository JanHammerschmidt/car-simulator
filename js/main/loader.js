require("../../three.js/examples/js/controls/OrbitControls.js");
require("../../three.js/examples/js/loaders/MTLLoader.js");
require("../../three.js/examples/js/loaders/OBJMTLLoader.js");
var load_car = require("../load_car.js");

camera.position.z = 30;
var orbit = new THREE.OrbitControls(camera, renderer.domElement);

addDefaultLight();

if (false) {
	load_car.load_car(function(car) {
		scene.add(car);
	});
} else if (true) {
	var loader = new THREE.OBJMTLLoader();
	loader.load(
		// "models/traffic lights/3D model traffic lights/3D Model Traffic Lights.obj",
		// "models/traffic lights/3D model traffic lights/3D Model Traffic Lights.mtl",
		// "models/stop_sign/stop_sign.obj", "models/stop_sign/stop_sign.mtl",
		// "models/traffic_lights_obj/semaforo.obj", "models/traffic_lights_obj/semaforo.mtl",
		// "models/stop_sign_obj/stop_sign.obj", "models/stop_sign_obj/stop_sign.mtl",
		"models/osm/textures/map_small_blender.obj", "models/osm/textures/map_small_blender.mtl",
		function(obj) {
			// obj.computeBoundingBox();
			// console.log(obj.bounding_box);
			scene.add(obj);
		},
		// Function called when downloads progress
		function ( xhr ) {
			//console.log( (xhr.loaded / xhr.total * 100) + '% loaded' );
		},
		// Function called when downloads error
		function ( xhr ) {
			console.log( 'An error happened' );
		}
	);
} else if (true) {
	var loader = new THREE.JSONLoader();
	loader.load(//'models/stop-sign/stop_sign.json', 
		// 'models/stop_sign.json',
		"models/osm/textures/map_textures.json",
		function(geo,mats) {
			var mat = new THREE.MeshFaceMaterial(mats);
			var mesh = new THREE.Mesh(geo, mat);
			scene.add(mesh);
		});
} else {
	var loader = new THREE.ObjectLoader();
	var obj = loader.parse('models/semaforo7.json');
	scene.add(obj);
}
scene.add(buildAxes( 1000 ));

function render() {
	renderer.render(scene, camera);
}
orbit.addEventListener('change', render);
setTimeout(render, 500);