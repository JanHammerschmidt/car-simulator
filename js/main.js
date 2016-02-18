'use strict';

let cfg = {
    do_vr: false,
    do_sound: false
}

if (cfg.do_vr) {
    // window.CARDBOARD_DEBUG = true;
    require("script!../bower_components/webvr-boilerplate/js/deps/webvr-polyfill.js");
    require("script!../bower_components/webvr-boilerplate/js/deps/VREffect.js");
    require("script!../bower_components/webvr-boilerplate/build/webvr-manager.js");
    require("script!../bower_components/webvr-boilerplate/js/deps/VRControls.js");
}

require("../node_modules/three/examples/js/loaders/MTLLoader.js");
require("../node_modules/three/examples/js/loaders/OBJMTLLoader.js");
require("../node_modules/three/examples/js/controls/OrbitControls.js");
require("./FirstPersonControls2.js");
//require("../../three.js/examples/js/controls/FlyControls.js");

let chase_cam = require("./cam_controls.js").chase_cam;
let input = require('./wingman_input.js');
let wingman_input = input.wingman_input;
let keyboard_input = input.keyboard_input;

var load_car = require("./load_car.js");
var Street = require('./street.js');
var create_city_geometry = require('./city_geometry.js');
var Terrain = require('./terrain.js');

var Car = require("../carphysics2d/public/js/Car.js");
var Stats = require('../carphysics2d/public/js/Stats.js');
var ConfigPanel = require('../carphysics2d/public/js/ConfigPanel.js');
require('!style!css!../carphysics2d/public/js/car_config.css');

//var pointInPolygon = require('point-in-polygon-extended').pointInPolyRaycast; //pointInPolyWindingNumber

$('body').append(require('html!../carphysics2d/public/js/car_config.html'));

// renderer.shadowMap.enabled = true;
// //renderer.shadowMapSoft = true;
// renderer.shadowMapType = THREE.PCFSoftShadowMap;

//scene.add(buildAxes( 1000 ));
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
    loader.load(fname, fname.slice(0,-3) + "mtl", f, undefined, err => { console.log("error loading", fname, err); });
}

class TrafficLight extends THREE.Object3D {
    constructor() {
        super();
        const model = TrafficLight._model.clone();
        const lights = model.children[1];
        this.colors = lights.children.slice(1).map(function(v) {return v.material.color;}); // green, yellow, red
        this.lights_on = [0x49e411, 0xd2c100, 0x960101];
        this.lights_off = [0x142d0b, 0x262300, 0x1f0000];
        this.state = 0;
        this.add(model);            
    }

    set(state) {
        var lights_off = this.lights_off;
        this.colors.forEach(function(c,i) {
            c.setHex(lights_off[i]);
        });
        this.colors[state].setHex(this.lights_on[state]);
        this.state = state;
    }

    static load_model() {
        TrafficLight.loaded = new Promise(resolve => {
            setTimeout(() => {
                load_model_obj('models/traffic_lights.obj', obj => {
                    obj.rotateY(Math.PI);
                    obj.scale.multiplyScalar(1.2);
                    obj.position.y = -0.1;
                    TrafficLight._model = obj;
                    resolve(obj);
                });
            }, 1000);
        });
    }
}

class Event extends Promise {
    constructor() {
        let r = null;
        super(resolve => {
            r = resolve;            
        });
        this.resolve = r;
        console.assert(this.resolve != null);
    }
}


class App {
    constructor() {
        this.cameras = {};
        this.gui = new dat.GUI();

        renderer.setClearColor(0xd8e7ff);
        scene.fog = new THREE.FogExp2(0xd0e0f0, 0.0025);

        let light = new THREE.HemisphereLight(0xfffff0, 0x101020, 1.25);
        light.position.set(0.75, 1, 0.25);
        scene.add(light);

        this.car_loaded = new Event();
        this.street_loaded = new Event();

        TrafficLight.load_model();
        this.terrain = new Terrain();
        this.terrain.adjust_height(() => {
            this.terrain.rotate();
            scene.add(this.terrain.create_mesh());
        });

        this.street_loaded.then(street => {
            var city_mesh = create_city_geometry(street);
            scene.add(city_mesh);
        });
        
        this.init_car2d();
        this.init_street();
        this.init_cameras("first_person_cam");
        this.init_car();
        this.load_stop_sign();
        this.init_gauge();
        keyboard_input.init();

        this.stop_sign_loaded.then(stop_sign => {
            this.place_sign(stop_sign.clone(), 0.1);
        });
        TrafficLight.loaded.then(() => {
            const light = new TrafficLight();
            this.place_sign(light, 0.2);
            setInterval(() => {
                light.state += 1;
                if (light.state > 2)
                    light.state = 0;
                light.set(light.state);
            },500);
        });
        
        //this.jump_to_street_position(0.15, false);

        this.last_time = performance.now();
        console.log("1st animate");
        requestAnimationFrame(this.animate.bind(this));

        this.gui.close();
    }

    init_cameras(default_cam) {
        this.init_first_person_view();
        this.init_chase_cam();
        this.init_first_person_cam();
        this.init_fly_cam();
        this.init_orbit_cam();
        if (cfg.do_vr)
            this.init_vr();
        this.camera = default_cam;
        this.camera_change = this.camera;
        this.gui.add(this, "camera_change", Object.keys(this.cameras)).onChange(() => this.update_camera() );
        this.update_camera();

        $(() => {
            document.addEventListener('keydown', ev => {
                if (ev.keyCode == 67)
                    this.toggle_camera();
            });        
        });
    }    

    update_camera() {
        // if (this.camera == "fly_cam")
        //     this.cameras["fly_cam"][1].enabled = false;
        // if (this.camera_change == "fly_cam")
        //     this.cameras["fly_cam"][1].enabled = true;

        if (this.camera == "orbit_cam")
            this.cameras["orbit_cam"][1].enabled = false;
        if (this.camera_change == "orbit_cam")
            this.cameras["orbit_cam"][1].enabled = true;

        if (this.camera_change == "fly_cam") {
            this.car_loaded.then(() => {
                this.cameras["fly_cam"][0].position.copy(
                    this.car_model.position.clone().add(this.camera_first_person_object.position));
            });
        }

        // if (this.camera_change == "fly_cam" || this.camera_change == "chase_cam") {
        //     this.cameras[this.camera_change][0].matrixWorldInverse.copy(
        //            this.cameras[this.camera][0].matrixWorldInverse);
        // }
        this.camera = this.camera_change;
        //console.log("this.camera", this.camera);
    }

    toggle_camera() {
        let cams = Object.keys(this.cameras);
        let i = cams.indexOf(this.camera) + 1;
        if (i >= cams.length)
            i = 0;
        this.camera_change = cams[i];
        this.update_camera();
    }

    init_sound() {
        require('script!../bower_components/osc.js/dist/osc-browser');
        osc.WebSocketPort.prototype.send_float = function(addr, val) {
            this.send({address: addr, args: [val]});
        };
        const osc_port = new osc.WebSocketPort({
            url: "ws://localhost:8081"
        });
        osc_port.on('open', function() {
            osc_port.send_float('/startEngine', 0);
        });
        osc_port.open();
        this.osc_por = osc_port;
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

    load_stop_sign() {
        this.stop_sign_loaded = new Promise(resolve => {
            load_model_obj('models/stop_sign_obj/stop_sign.obj', obj => {
                obj.rotateY(Math.PI);
                obj.rotateX(Math.PI / 2);
                obj.position.y = -1.5;
                let stop_sign = new THREE.Object3D();
                stop_sign.add(obj);
                resolve(stop_sign);
            });
        });
    }

    place_sign(sign, t) {
        this.street_loaded.then(street => {
            const street_bezier = street.poly_bezier;
            const p = new THREE.Vector2().copy(street_bezier.get(t));
            const n = new THREE.Vector2().copy(street_bezier.normal(t));
            const d = street_bezier.derivative(t);
            const y = street.height_profile.get(t).y;
            p.addScaledVector(n, 0.5 * street.street_width);
            sign.position.copy(Street.xytovec3(p,y));
            sign.rotation.y = Math.atan2(d.x,d.y);
            scene.add(sign);
        });
    }

    // init_stop_signs() {
    //     this.street_loaded.then(street => {
    //             var segments = street.segments, i = 1;
    //             for (var pos = 10; pos < 500; pos += 10) {
    //                 i = 1;
    //                 for (; i < segments.length; i++) {
    //                     if (segments[i].accumulated_road_length >= pos)
    //                         break;
    //                 }
    //                 var segment = segments[i-1];
    //                 var t = (pos - segment.accumulated_road_length)/segment.curve.length();
    //                 var p = segment.curve.offset(t, street.street_width/2 * (start_from_end_of_street ? -1 : 1));
    //                 var d = segment.curve.derivative(t);
    //                 var sign = stop_sign.clone();
    //                 sign.position.copy(Street.xytovec3(p));
    //                 sign.position.y -= 2;
    //                 //console.log(Math.atan2(d.x,d.y));
    //                 sign.rotation.y = Math.atan2(d.x,d.y) + (start_from_end_of_street ? Math.PI : 0); //pos * Math.PI / 200;
    //                 scene.add(sign);
    //             }
    //         });
    //     });
    // }

    init_chase_cam() {
        let camera = THREE.get_camera();

        let controls = new chase_cam(camera, new THREE.Vector3(0,5,0), new THREE.Vector3(0,20,-40)); //new THREE.Vector3(0,20,-40));
        var f = this.gui.addFolder('chase_cam');
        f.add(controls.dist_vector, 'x');
        f.add(controls.dist_vector, 'y');
        f.add(controls.dist_vector, 'z');

        this.cameras['chase_cam'] = [camera, controls];
    }

    init_first_person_view() {
        this.camera_first_person_object = new THREE.Object3D();
        this.camera_first_person_object.position.set(0.37,1.36,0.09);
        this.car_loaded.then( () => {
            this.car_model_slope.add(this.camera_first_person_object);
        });        
    }

    init_vr() {

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
        this.vr_manager = new WebVRManager(renderer, effect);
        //vr_manager.
        $(document).ready(function() {
            $("img[title='Fullscreen mode']").css('bottom', '').css('right', '').css('left','0px').css('top','0px');
        });

        const camera = THREE.get_camera();
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        const vr_cam = new THREE.Object3D();
        vr_cam.rotation.y = Math.PI;
        vr_cam.add(camera);
        this.camera_first_person_object.add(vr_cam);
        const controls = new THREE.VRControls(camera);
        $(document).ready(function() {
            document.addEventListener('keydown', function(ev) {
                if (ev.keyCode == 13)
                    controls.resetSensor();
            });
        });
        this.cameras["vr_cam"] = [camera, controls];
    }

    init_first_person_cam() {
        let camera = THREE.get_camera();
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        this.camera_first_person_object.add(camera);

        let f = this.gui.addFolder('first person cam');
        f.addxyz(this.camera_first_person_object.position);
        f.add(camera, 'fov').onChange(() => camera.updateProjectionMatrix());
        f.add(camera, 'near').onChange(() => camera.updateProjectionMatrix());
        f.add(camera, 'far').onChange(() => camera.updateProjectionMatrix());
        
        this.cameras["first_person_cam"] = [camera, null];
    }

    init_orbit_cam() {
        let camera = THREE.get_camera();
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        camera.position.z = -0.01;

        let cam = new THREE.Object3D();
        cam.position.set(0.37,1.36,0.09);
        cam.add(camera);
        this.car_loaded.then( () => {
            this.car_model_slope.add(cam);
        });

        let controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.enabled = false;

        this.cameras['orbit_cam'] = [camera, controls];

    }    

    init_fly_cam() {
        let camera = THREE.get_camera();

        let controls = new THREE.FirstPersonControls2(camera, renderer.domElement);
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

        this.cameras['fly_cam'] = [camera, controls];
    }

    init_street() {
        this.street = new Street();
        this.street.create_road(() => {
            //scene.add(street);
            this.street_loaded.resolve(this.street);

            this.street.street_mesh.position.y = 0.53;
            var f = this.gui.addFolder('street position');
            f.addnum(this.street.street_mesh.position, 'y');       
        });        
    }

    jump_to_street_position(t, reverse) {
        reverse = reverse || false;
        // if (start_from_end_of_street) {
        //     var curve = street.segments[street.segments.length-1].curve;
        //     //curve = street.segments[3].curve;
        //     var p = Street.xytovec3(curve.get(1));
        //     car2d.position.x = p.z;
        //     car2d.position.y = -p.x;
        //     var d = curve.derivative(1);
        //     var angle = -Math.atan2(d.x,d.y) + Math.PI;
        //     console.log(angle * 180 / Math.PI);
        //     car2d.heading = angle;
        // }
        this.street_loaded.then(street => {
            const p = Street.xytovec3(street.poly_bezier.get(t));
            this.car2d.setFromPosition3d(p);
            const d = street.poly_bezier.derivative(t);
            const angle = -Math.atan2(d.x,d.y) + (reverse ? Math.PI : 0);
            this.car2d.heading = angle;
            // if (!do_first_person_cam)
            //     camera.position.set(-20,30,car2d.position.x);            
        })
    }

    init_car2d() {
        this.car_stats = new Stats.Stats();
        this.car2d = new Car.Car({stats:this.car_stats});
        this.car2d.config_panel = new ConfigPanel(this.car2d);
    }

    init_car() {
        load_car.load_car((car_body/*, wheel*/) => {

            // var glass_mat = new THREE.MeshLambertMaterial({
            //     color: 0xEEEEEE,
            //     transparent: true,
            //     opacity: 0.5
            // });

            car_body.rotateX(-Math.PI / 2);

            car_body.position.y = 0.29;
            // gui.addFolder('car position').addnum(car_body.position, 'y');
            // //vehicle_box.castShadow = vehicle_box.receiveShadow = true;

            this.car_model = new THREE.Object3D();
            this.car_model_slope = new THREE.Object3D();
            this.car_model.add(this.car_model_slope);
            this.car_model_slope.add(car_body);

            scene.add(this.car_model);

            this.car_loaded.resolve();

            $(() => {
                document.addEventListener('keydown', ev => {
                    if (ev.keyCode == 87)
                        this.car2d.gearbox.gear_up();
                    else if (ev.keyCode == 83)
                        this.car2d.gearbox.gear_down();
                });
            });        
            var light = new THREE.PointLight(0xffffff, 1, 0);
            //light.position.set(0.37, 1.4, 1.55); // TODO?: light nicht mit auto mitdrehen?
            light.position.set(0.37, 1.2, 0.01);
            var lf = this.gui.addFolder('car: light position');
            lf.add(light.position, 'x');
            lf.add(light.position, 'y');
            lf.add(light.position, 'z');
            this.car_model_slope.add(light);

        });        
    }

    init_gauge() {
        const gauge_needle = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.004, 0.002),
            new THREE.MeshBasicMaterial({color: 0xb31804})
        );
        gauge_needle.geometry.translate(0.5 * gauge_needle.geometry.parameters.width, 0, 0);
        gauge_needle.rotation.x = 0.606;
        //gauge_needle.rotation.z = [-0.806,3.933] (10-210)
        this.gauge_kmh_slope = (3.933-(-0.806)) / (210-10);
        const gauge = new THREE.Object3D(); gauge.add(gauge_needle);
        gauge.position.set(0.365, 1.111, 0.806);
    // camera_first_person_object.position.copy(gauge.position);
    // camera.position.z = -0.3;
        this.car_loaded.then(() => {
            this.car_model_slope.add(gauge);
        });
        
        var gf = this.gui.addFolder('gauge');
        gf.addxyz(gauge.position, 0.01);
        gf.addxyz(gauge_needle.rotation);
        //gf.open();
        // this.gauge = gauge;
        this.gauge_needle = gauge_needle;
    }

    animate(time) {

        if (time === undefined)
            time = performance.now()
        var dt = Math.max(time - this.last_time, 0) * 0.001;
        if (dt <= 0) {
            requestAnimationFrame(this.animate.bind(this));
            return;
        }
        if (dt > 0.1) { // Timestep too large - max out at 1/10th of a second.
            //console.log("warning: dt too high!", dt, "ms");
            dt = 0.1;
        }
        const car2d = this.car2d;
        const car_model = this.car_model;
        const car_model_slope = this.car_model_slope;
        const street = this.street;
        const car_stats = this.car_stats;

        this.gauge_needle.rotation.z = -0.806 + this.gauge_kmh_slope * (Math.max(car2d.kmh(),0) - 10);
        if (cfg.do_sound) {
            this.osc_port.send_float('/rpm', 0.1 + car2d.engine.rel_rpm() * 0.8);
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

            car_model.position.y = this.terrain.p2height({x:car_model.position.x,y:car_model.position.z}) + street.street_mesh.position.y;
            // car_model_slope.rotation.x = 0;
            // car_model_slope.rotation.y = 0;

            var on_track = false;

            var t = street.get_road_position(car_model.position, car_stats);
            if (!on_track) {
                const p = street.poly_bezier.get(t);
                const xy = new THREE.Vector2().copy(Street.vec3toxy(car_model.position));
                const normal = new THREE.Vector2().copy(street.poly_bezier.normal(t));
                const dp = normal.dot(xy.clone().sub(p));
                if (true && Math.abs(dp) > 10) {
                    // if (dp > 0)
                    //     xy.addScaledVector(normal, -(dp-10));
                    // else
                    //     xy.addScaledVector(normal, -dp-10)
                    xy.addScaledVector(normal, -dp - (dp > 0 ? -10 : 10));
                    car_model.position.x = xy.x;
                    car_model.position.z = xy.y;
                    car2d.setFromPosition3d(car_model.position);
                }
                on_track = true;
            }                
            if (on_track) {
                // car_stats.add('road t', t);
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
                const slope = Math.atan2(d.y,d.x);
                car_model_slope.quaternion.setFromAxisAngle(axis, -slope);
                //car_stats.add('slope', -car_model_slope.rotation.x * 180 / Math.PI);
                car2d.alpha = Math.cos(street_rot-car_rot) * slope;
                car_stats.add('slope', car2d.alpha * 180 / Math.PI);
            } else {
                car_model_slope.quaternion.set(0,0,0,1);
                car2d.alpha = 0;
            }

            car_stats.add('road position', t * street.poly_bezier.total_length ); // should be [m]
            car_stats.add('car.x', car_model.position.x);
            car_stats.add('car.z', car_model.position.z);
            car_stats.add('car.y', car_model.position.y);
        }
        car_stats.render();

        if (car_model && this.camera == "chase_cam") //"chase_cam" in this.cameras)
            this.cameras["chase_cam"][1].tick(car_model.position, new THREE.Quaternion().multiplyQuaternions(car_model.quaternion, car_model_slope.quaternion), dt);
        if (this.camera == "fly_cam")
            this.cameras["fly_cam"][1].update(dt);
        if (this.camera == "orbit_cam")
            this.cameras["orbit_cam"][1].update();

        requestAnimationFrame(this.animate.bind(this));

        if (this.camera == "vr_cam") {
            this.cameras["vr_cam"][1].update();
            if (car_model)
                car_model.updateMatrixWorld(true);
            this.vr_manager.render(scene, this.cameras["vr_cam"][0]);
        } else {
            renderer.render(scene, this.cameras[this.camera][0]);
        }            

        this.last_time = time;
    }    
}

let app = new App(); // eslint-disable-line no-unused-vars

