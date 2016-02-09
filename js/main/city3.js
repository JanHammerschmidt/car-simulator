'use strict';

var do_chase_cam = false;
var do_first_person_cam = false;
var do_orbit_controls = false;
var do_vr = false;
var start_from_end_of_street = false;
var do_sound = false;

window.CARDBOARD_DEBUG = true;

//require('script!../lib/jquery.js');
//require('script!../lib/dat.gui.js');
//require("script!../lib/async.js");
require("../../three.js/examples/js/loaders/MTLLoader.js");
require("../../three.js/examples/js/loaders/OBJMTLLoader.js");
require("../../three.js/examples/js/controls/FirstPersonControls2.js");
require("../../three.js/examples/js/controls/OrbitControls.js");
//require("../../three.js/examples/js/controls/FlyControls.js");

require("script!/Users/jhammers/Dropbox/Eigene Dateien/phd/Projekte/1_Auto Projekt/simulator/webvr-boilerplate/js/deps/webvr-polyfill.js");
require("../../three.js/examples/js/controls/VRControls.js");
require("../../three.js/examples/js/effects/VREffect.js");
require("script!../../webvr-boilerplate/build/webvr-manager.js");



require("script!../cam_controls.js");
var load_car = require("../load_car.js");
require('script!../wingman_input.js');
var Street = require('../street.js');
var create_city_geometry = require('../city_geometry.js');
var Terrain = require('../terrain.js');

var Car = require("../../carphysics2d/public/js/Car.js");
var Stats = require('../../carphysics2d/public/js/Stats.js');
var ConfigPanel = require('../../carphysics2d/public/js/ConfigPanel.js');
require('!style!css!../../carphysics2d/public/js/car_config.css');

var pointInPolygon = require('point-in-polygon-extended').pointInPolyRaycast; //pointInPolyWindingNumber


$('body').append(require('html!../../carphysics2d/public/js/car_config.html'));

// renderer.shadowMap.enabled = true;
// //renderer.shadowMapSoft = true;
// renderer.shadowMapType = THREE.PCFSoftShadowMap;

//scene.add(buildAxes( 1000 ));
var gui = new dat.GUI();
dat.GUI.prototype.addnum = function(object, prop, prec) {
    var prev = object[prop];
    object[prop] = prec || 0.1;
    this.add(object,prop);
    object[prop] = prev;
    this.__controllers[this.__controllers.length-1].updateDisplay();
}
dat.GUI.prototype.addxyz = function(object, prec) {
    this.addnum(object, 'x', prec);
    this.addnum(object, 'y', prec);
    this.addnum(object, 'z', prec);
}


function load_model_obj(fname, f) {
    var loader = new THREE.OBJMTLLoader();
    loader.load(fname, fname.slice(0,-3) + "mtl", f, undefined, function(x) { console.log("error loading", fname); });
}

var light, controls;
var lastTime;
var car2d, car_model, car_model_slope, car_stats;
var street, stop_sign;
var vr_manager;
var gauge_kmh_slope, gauge_needle;
var osc_port, terrain;
// var engine_started = false;

init();
//console.log("1st animate");
//animate();

function init() {

    if (do_sound) {
        require('script!../../bower_components/osc.js/dist/osc-browser');
        osc.WebSocketPort.prototype.send_float = function(addr, val) {
            this.send({address: addr, args: [val]});
        };
        osc_port = new osc.WebSocketPort({
            url: "ws://localhost:8081"
        });
        // port.on("message", function (oscMessage) {
        //     $("#message").text(JSON.stringify(oscMessage, undefined, 2));
        //     console.log("message", oscMessage);
        // });
        osc_port.on('open', function() {
            osc_port.send_float('/startEngine', 0);
        });
        osc_port.open();
        $(function() {
            document.addEventListener('keydown', function(ev) {
                if (ev.keyCode == 72)
                    osc_port.send_float('/honk', 0);
            });
            window.addEventListener('unload', function() {
                osc_port.send_float('/stopEngine', 0);
                osc_port.close(1000);
            });
        });       
    }

    if (do_vr) {
        //require("webvr-polyfill");
        window.WebVRConfig = {
          /**
           * webvr-polyfill configuration
           */

          // Forces availability of VR mode.
          //FORCE_ENABLE_VR: true, // Default: false.
          // Complementary filter coefficient. 0 for accelerometer, 1 for gyro.
          //K_FILTER: 0.98, // Default: 0.98.
          // How far into the future to predict during fast motion.
          //PREDICTION_TIME_S: 0.040, // Default: 0.040 (in seconds).
          // Flag to disable touch panner. In case you have your own touch controls
          //TOUCH_PANNER_DISABLED: true, // Default: false.
          // Enable yaw panning only, disabling roll and pitch. This can be useful for
          // panoramas with nothing interesting above or below.
          //YAW_ONLY: true, // Default: false.

          /**
           * webvr-boilerplate configuration
           */
          // Forces distortion in VR mode.
          //FORCE_DISTORTION: true, // Default: false.
          // Override the distortion background color.
          //DISTORTION_BGCOLOR: {x: 1, y: 0, z: 0, w: 1}, // Default: (0,0,0,1).
          // Prevent distortion from happening.
          //PREVENT_DISTORTION: true, // Default: false.
          // Show eye centers for debugging.
          //SHOW_EYE_CENTERS: true, // Default: false.
        };
        //var WebVRManager = require("../../webvr-boilerplate/src/webvr-manager.js");
        //var WebVRManager = require("script!../../webvr-boilerplate/build/webvr-manager.js");
        var effect = new THREE.VREffect(renderer);
        effect.setSize(window.innerWidth, window.innerHeight); // TODO: do you really need this?
        vr_manager = new WebVRManager(renderer, effect);
        //vr_manager.
        $(document).ready(function() {
            $("img[title='Fullscreen mode']").css('bottom', '').css('right', '').css('left','0px').css('top','0px');
        });
    }

    var tex_loader = new THREE.TextureLoader();

    $('body').css('cursor', 'url(cursor.png), auto')

    renderer.setClearColor(0xd8e7ff);

    //camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 1, 3000 );
    camera.fov = 70; //TODO: in VR-Beispiel: 75!
    camera.near = 0.1;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    //camera.position.y = 40;
    //camera.position.z = -50;
    camera.lookAt(new THREE.Vector3(0, 0, 1));

    if (do_chase_cam) {
        controls = new chase_cam(camera, new THREE.Vector3(0,5,0), new THREE.Vector3(0,20,-40)); //new THREE.Vector3(0,20,-40));
        var f = gui.addFolder('camera');
        f.add(controls.dist_vector, 'x');
        f.add(controls.dist_vector, 'y');
        f.add(controls.dist_vector, 'z');
    } else if (do_first_person_cam) {
        if (false) {
            controls = new first_person_cam(camera, new THREE.Vector3(0,0,0), new THREE.Vector3(0.37,1.38,0.01), //new THREE.Vector3(0.44,1.15,-0.11));
                                            new THREE.Vector3(0,0,20));
            
            //gui.addFolder()
            gui.add(controls.displacement, 'x');
            gui.add(controls.displacement, 'y');
            gui.add(controls.displacement, 'z');
        }
        gui.add(camera, 'fov').onChange(function() {camera.updateProjectionMatrix()});
        gui.add(camera, 'near').onChange(function() {camera.updateProjectionMatrix()});
        gui.add(camera, 'far').onChange(function() {camera.updateProjectionMatrix()});
    } else {
        controls = new THREE.FirstPersonControls2(camera, renderer.domElement);
        //controls.dragToLook = true;
        controls.movementSpeed = 30;
        controls.lookSpeed = 0.2;
        controls.lookVertical = true;
        $(document).ready(function() {
            document.addEventListener('keydown', function(ev) {
                if (ev.keyCode == 16)
                    controls.movementSpeed = 100;
                else if (ev.keyCode == 17)
                    controls.movementSpeed = 5;
            });
            document.addEventListener('keyup', function(ev) {
                if (ev.keyCode == 16 || ev.keyCode == 17)
                    controls.movementSpeed = 30;
            });
        });

        //controls.target.copy(new THREE.Vector3(0,0,0));
    }

    scene.fog = new THREE.FogExp2(0xd0e0f0, 0.0025);

    light = new THREE.HemisphereLight(0xfffff0, 0x101020, 1.25);
    light.position.set(0.75, 1, 0.25);
    scene.add(light);

    terrain = new Terrain();
    terrain.adjust_height(function() {
        terrain.rotate();
        scene.add(terrain.create_mesh());
    });

    street = new Street();
    street.create_road(function() {
        //scene.add(street);
        var city_mesh = create_city_geometry(street);
        scene.add(city_mesh);

        load_model_obj('models/stop_sign_obj/stop_sign.obj', function(obj) {
            obj.rotateY(-Math.PI);
            obj.rotateX(Math.PI / 2); //TODO: this modifies the object3d rotation (not the geometry itself!)
            stop_sign = new THREE.Object3D();
            stop_sign.add(obj);

            var segments = street.segments, i = 1;
            for (var pos = 10; pos < 500; pos += 10) {
                i = 1;
                for (; i < segments.length; i++) {
                    if (segments[i].accumulated_road_length >= pos)
                        break;
                }
                var segment = segments[i-1];
                var t = (pos - segment.accumulated_road_length)/segment.curve.length();
                var p = segment.curve.offset(t, street.street_width/2 * (start_from_end_of_street ? -1 : 1));
                var d = segment.curve.derivative(t);
                var sign = stop_sign.clone();
                sign.position.copy(Street.xytovec3(p));
                sign.position.y -= 2;
                //console.log(Math.atan2(d.x,d.y));
                sign.rotation.y = Math.atan2(d.x,d.y) + (start_from_end_of_street ? Math.PI : 0); //pos * Math.PI / 200;
                scene.add(sign);
            }
        });        
    });

    ///////////////////////////////////////////////


    // load car ######
    load_car.load_car(function(car_body/*, wheel*/) {

        var glass_mat = new THREE.MeshLambertMaterial({
            color: 0xEEEEEE,
            transparent: true,
            opacity: 0.5
        });

        car_body.rotateX(-Math.PI / 2);
        var vehicle_box = car_body;        
        if (false) {
            car_body.geometry.computeBoundingBox();
            var bbox = car_body.geometry.boundingBox;
            var bbox_size = bbox.size(), bbox_center = bbox.center();
            var bbox_geometry = new THREE.BoxGeometry(bbox_size.x * 0.9, bbox_size.y * 0.3, bbox_size.z * 0.4);
            bbox_geometry.translate(bbox_center.x, bbox_center.y, bbox_center.z);
            vehicle_box = new THREE.Mesh(bbox_geometry, glass_mat, 200); //new THREE.Object3D()
            vehicle_box.add(car_body);
        }

        vehicle_box.position.y = 0.29;
        // gui.addFolder('car position').add(vehicle_box.position, 'y', 'test');
        // //vehicle_box.castShadow = vehicle_box.receiveShadow = true;
        // //debugger;
        // //vehicle_box.rotation.x = -Math.PI / 2;
        // var rot = gui.addFolder('car rotation');
        // rot.add(vehicle_box.rotation, 'x');
        // rot.add(vehicle_box.rotation, 'y');
        // rot.add(vehicle_box.rotation, 'z');
        // var pos = gui.addFolder('position');
        // pos.add(vehicle_box.position, 'x');
        // pos.add(vehicle_box.position, 'y');
        // pos.add(vehicle_box.position, 'z');

        car_model = new THREE.Object3D();
        car_model_slope = new THREE.Object3D();
        car_model.add(car_model_slope);
        car_model_slope.add(vehicle_box);

        scene.add(car_model);

        car_stats = new Stats.Stats();
        car2d = new Car.Car({stats:car_stats});
        var car_config_panel = new ConfigPanel(car2d);

        if (false) {
            var x = 0.83,
                y = 0.17,
                z1 = 1.42,
                z2 = 1.47;        

            var connection_points = [[-x,-z1,y],[x,-z1,y],[-x,z2,y],[x,z2,y]];

            for (var i = 0; i < 2; i++) {
                var w = wheel.clone();
                w.position.fromArray(connection_points[i]);
                vehicle_box.add(w);
            }
        }
        keyboard_input.init();
        $(function() {
            document.addEventListener('keydown', function(ev) {
                if (ev.keyCode == 87)
                    car2d.gearbox.gear_up();
                else if (ev.keyCode == 83)
                    car2d.gearbox.gear_down();
            });
        });        
        var light = new THREE.PointLight(0xffffff, 1, 0);
        //light.position.set(0.37, 1.4, 1.55); // TODO?: light nicht mit auto mitdrehen?
        light.position.set(0.37, 1.2, 0.01);
        var lf = gui.addFolder('car: light position');
        lf.add(light.position, 'x');
        lf.add(light.position, 'y');
        lf.add(light.position, 'z');
        car_model.add(light);

        if (start_from_end_of_street) {
            var curve = street.segments[street.segments.length-1].curve;
            //curve = street.segments[3].curve;
            var p = Street.xytovec3(curve.get(1));
            car2d.position.x = p.z;
            car2d.position.y = -p.x;
            var d = curve.derivative(1);
            var angle = -Math.atan2(d.x,d.y) + Math.PI;
            console.log(angle * 180 / Math.PI);
            car2d.heading = angle;
        }

        if (true && do_first_person_cam && !do_chase_cam) {
            var camera_first_person_object = new THREE.Object3D();
            camera_first_person_object.position.set(0.37,1.36,0.09);
            var f = gui.addFolder('camera');
            f.addxyz(camera_first_person_object.position);
            camera_first_person_object.add(camera);
            car_model_slope.add(camera_first_person_object);
            if (do_vr) {
                camera_first_person_object.rotation.y = Math.PI;
                controls = new THREE.VRControls(camera);
                console.log(camera.parent);
                $(document).ready(function() {
                    document.addEventListener('keydown', function(ev) {
                        if (ev.keyCode == 13)
                            controls.resetSensor();
                    });
                });
            }
            if (do_orbit_controls && !do_vr) {
                camera.position.z = -5;
                controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enablePan = false;
            }
        }

        gauge_needle = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.004, 0.002),
            new THREE.MeshBasicMaterial({color: 0xb31804})
        );
        gauge_needle.geometry.translate(0.5 * gauge_needle.geometry.parameters.width, 0, 0);
        gauge_needle.rotation.x = 0.606;
        //gauge_needle.rotation.z = [-0.806,3.933] (10-210)
        gauge_kmh_slope = (3.933-(-0.806)) / (210-10);
        var gauge = new THREE.Object3D(); gauge.add(gauge_needle);
        gauge.position.set(0.365, 1.111, 0.806);
    // camera_first_person_object.position.copy(gauge.position);
    // camera.position.z = -0.3;
        car_model_slope.add(gauge);
        var gf = gui.addFolder('gauge');
        gf.addxyz(gauge.position, 0.01);
        gf.addxyz(gauge_needle.rotation);
        //gf.open();
        animate();
    });


    gui.close();
    lastTime = performance.now() / 1000;
    animate();
}

function animate(time) {

    if (time === undefined)
        time = performance.now() / 1000;
    else
        time /= 1000.;
    var dt = Math.max(time - lastTime, 0);
    if (dt <= 0) {
        requestAnimationFrame(animate);
        return;
    }
    if (dt > 0.1) { // Timestep too large - max out at 1/10th of a second.
        //console.log("warning: dt too high!", dt, "ms");
        dt = 0.1;
    }
    // console.log(dt);
    // if (do_vr && controls)
    //     controls.update();



    if (car2d) {

        gauge_needle.rotation.z = -0.806 + gauge_kmh_slope * (Math.max(car2d.kmh(),0) - 10);
        if (do_sound) {
            osc_port.send_float('/rpm', 0.1 + car2d.engine.rel_rpm() * 0.8);
        }

        var accel = null,
            steering = null,
            got_keyboard_input = false;
        if (keyboard_input.tick()) {
            accel = keyboard_input.accel;
            steering = keyboard_input.steering;
            got_keyboard_input = true;
        }
        if (wingman_input.tick()) {
            accel = wingman_input.accel;
            steering = wingman_input.steering;
        }
        if (accel != null) {
            //debugger;
            // car_model.rotation.
            // car2d.heading
            var inputs = car2d.inputs;
            //console.log('accel', accel, 'steering', steering);
            if (accel > 0) {
                if (got_keyboard_input && car2d.velocity_c.x < 0) {
                    inputs.throttle = 0;
                    inputs.brake = accel;
                } else {
                    inputs.throttle = accel;
                    inputs.brake = 0;
                }
            } else { // is braking
                if (got_keyboard_input && car2d.velocity_c.x <= 0) {
                    inputs.throttle = accel;
                    inputs.brake = 0;
                } else {
                    inputs.throttle = 0;
                    inputs.brake = -accel;                    
                }
            }
            if (steering > 0) {
                inputs.right = steering;
                inputs.left = 0;
            } else {
                inputs.right = 0;
                inputs.left = -steering;
            }
            // if (accel > 0)
            //     vehicle.applyEngineForce(accel * 300);
            // else {
            //     vehicle.applyEngineForce(0);
            //     vehicle.setBrake(50 * -accel, 2);
            //     vehicle.setBrake(50 * -accel, 3);
            // }
            // vehicle.setSteering(steering * 0.6, 0);
            // vehicle.setSteering(steering * 0.6, 1);
                    //debugger;
        }
        car2d.update(dt * 1000);        
        if (car_model) {            
            car_model.rotation.y = -car2d.heading;
            car_model.position.x = -car2d.position.y;
            car_model.position.z = car2d.position.x;

            car_model.position.y = terrain.p2height({x:car_model.position.x,y:car_model.position.z}) + street.street_mesh.position.y;
            // car_model_slope.rotation.x = 0;
            // car_model_slope.rotation.y = 0;

            var on_track = false;
            if (true) {
                var p = new THREE.Vector3(-car2d.position.y, car_model.position.y, car2d.position.x);
                for (var i = 0; i < street.segments.length; i++) {
                    var prev_state = 0;
                    var state = 0;
                    var segment = street.segments[i];
                    var s = segment.mesh;
                    if (s.material.color.getHex() == new THREE.Color(0x5EFF00).getHex())
                        prev_state = 2;
                    else if (s.material.color.getHex() == new THREE.Color(0xFF0000).getHex())
                        prev_state = 1;                    
                    var boundingSphere = s.geometry.boundingSphere;
                    var prev_color = s.material.color;
                    if (p.distanceTo(boundingSphere.center) <= boundingSphere.radius) {
                        var poly = segment.poly;
                        if (pointInPolygon([-car2d.position.y, car2d.position.x], poly)) {
                            s.material.color = new THREE.Color(0x5EFF00);
                            on_track = true;
                            state = 2;
                        }
                        else {
                            s.material.color = new THREE.Color(0xFF0000);
                            state = 1;
                        }
                    } else {
                        s.material.color = new THREE.Color(0x5d5d88);
                    }
                    if (prev_color.getHex() != s.material.color.getHex()) {
                        s.material.needsUpdate = true;
                        //console.log(i, state, prev_state);
                    }                
                }
            }
            var pos = street.get_road_position(car_model.position, car_stats);
            if (on_track) {
                var t = pos / street.poly_bezier.total_length;
                car_stats.add('road t', t);
                car_model.position.y = street.height_profile.get(t).y + street.street_mesh.position.y;
                
                var d = street.poly_bezier.derivative(t);
                const street_rot = Math.atan2(d.x,d.y);
                const car_rot = -car2d.heading;
                // car_model.rotation.y = 
                // car_stats.add('d.x', d.x);
                // car_stats.add('d.y', d.y);


                d = street.height_profile.derivative(t);
                d.x *= street.poly_bezier.total_length / street.height_profile.total_length;
                // car_stats.add('d.x', d.x);
                // car_stats.add('d.y', d.y);
                // car_model_slope.rotation.x = -Math.atan2(d.y,d.x);
                const axis = new THREE.Vector3(1,0,0).applyEuler(new THREE.Euler(0, street_rot-car_rot,0));
                car_model_slope.quaternion.setFromAxisAngle(axis, -Math.atan2(d.y,d.x));
                car_stats.add('slope', car_model_slope.rotation.x * 180 / Math.PI);
            } else
                car_model_slope.quaternion.set(0,0,0,1);

            car_stats.add('road position', pos ); // should be [m]
            car_stats.add('car.x', car_model.position.x);
            car_stats.add('car.z', car_model.position.z);
            car_stats.add('car.y', car_model.position.y);
        }
        car_stats.render();
    }

    if (do_chase_cam) {
         if (car2d)
             controls.tick(car2d.position3d(), car2d.quaternion(), dt);
    } else if (do_first_person_cam) {
        if (false && car2d)
            controls.tick(car2d.position3d(), car2d.quaternion(), dt);
        if (true && do_orbit_controls && controls)
            controls.update();
        if (false && do_vr && controls)
            controls.update();
    } else {
        controls.update(time - lastTime);
    }
    requestAnimationFrame(animate);
    if (do_vr) {
        car_model.updateMatrixWorld(true); // TODO: make more efficient
        //console.log(camera.parent && camera.parent.position,camera.position);
        vr_manager.render(scene, camera);
    } else
        renderer.render(scene, camera);

    lastTime = time;

}