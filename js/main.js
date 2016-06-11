'use strict';

// const perf = window.performance;
// const t0 = perf.now();
// function plog(s) {console.log(((perf.now()-t0)/1000).toPrecision(4), s);}

let cfg = {
    do_vr: false,
    do_sound: false,
    random_street: 0,
    force_on_street: true,
    show_terrain: false,
    show_buildings: false,
    show_car: false,
    smooth_terrain: false,
    hq_street: false
}
window.cfg = cfg;

const misc = require("./misc.js");
misc.init_perf();
const plog = misc.plog;

if (cfg.do_vr) {
    // window.CARDBOARD_DEBUG = true;
    require("script!../bower_components/webvr-boilerplate/js/deps/webvr-polyfill.js");
    require("script!../bower_components/webvr-boilerplate/js/deps/VREffect.js");
    require("script!../bower_components/webvr-boilerplate/build/webvr-manager.js");
    require("script!../bower_components/webvr-boilerplate/js/deps/VRControls.js");
}

require("../node_modules/three/examples/js/loaders/MTLLoader.js");
require("../node_modules/three/examples/js/loaders/OBJLoader.js");
//require("./lib/THREE.OBJMTLLoader.js");
require("../node_modules/three/examples/js/controls/OrbitControls.js");
require("./FirstPersonControls2.js");
const Bezier = require('./lib/bezier.js');
//require("../../three.js/examples/js/controls/FlyControls.js");

let chase_cam = require("./cam_controls.js").chase_cam;
let input = require('./wingman_input.js');
let wingman_input = input.wingman_input;
let keyboard_input = input.keyboard_input;
let picking_controls = require("./PickingControls.js");
const signs = require('./signs.js');

var load_car = require("./load_car.js");
var Street = require('./street.js');
var create_city_geometry = require('./city_geometry.js');
var Terrain = require('./terrain.js');

var Car = require("../carphysics2d/public/js/Car.js");
var Stats = require('../carphysics2d/public/js/Stats.js');
var ConfigPanel = require('../carphysics2d/public/js/ConfigPanel.js');
require('!style!css!../carphysics2d/public/js/car_config.css');

const track_study_1 = require('./webpack/static.js').track_study_1;

//var pointInPolygon = require('point-in-polygon-extended').pointInPolyRaycast; //pointInPolyWindingNumber

$('body').append(require('html!../carphysics2d/public/js/car_config.html'));

// renderer.shadowMap.enabled = true;
// //renderer.shadowMapSoft = true;
// renderer.shadowMapType = THREE.PCFSoftShadowMap;

//scene.add(buildAxes( 1000 ));
dat.GUI.prototype.addnum = function(object, prop, prec) {
    var prev = object[prop];
    object[prop] = prec || 0.1;
    const r = this.add(object, prop);
    object[prop] = prev;
    this.__controllers[this.__controllers.length - 1].updateDisplay();
    return r;
}
dat.GUI.prototype.addxyz = function(object, prec) {
    this.addnum(object, 'x', prec);
    this.addnum(object, 'y', prec);
    this.addnum(object, 'z', prec);
}
dat.GUI.prototype.addscale = function(v, prec) {
    const tmp = { scale: v.x };
    this.addnum(tmp, 'scale', prec).onChange(() => {
        v.x = tmp.scale;
        v.y = tmp.scale;
        v.z = tmp.scale;
    });
}
dat.GUI.prototype.addcolor = function(obj, prop) {
    obj.gui = obj.gui || {};
    obj.gui[prop] = obj[prop].getHex();
    return this.addColor(obj.gui, prop).onChange(() => {
        obj[prop].setHex(obj.gui[prop]);
    });
}


class App {
    constructor() {
        plog("App entry point");
        this.cameras = {};
        this.gui = new dat.GUI();

        renderer.setClearColor(0xd8e7ff);
        scene.fog = new THREE.FogExp2(0xd0e0f0, 0.0025);

        const light = new THREE.HemisphereLight(0xfffff0, 0x101020, 1.25);
        const f = this.gui.addFolder('hemisphere light');
        f.addcolor(light, 'color');
        f.addColor(light, 'groundColor');
        f.addnum(light, 'intensity');
        light.position.set(0.75, 1, 0.25);
        f.addxyz(light.position);
        scene.add(light);

        this.car_loaded = this.init_car();
        this.streets = [];
        this.init_street();

        signs.TrafficLight.load_model();
        signs.StopSign.load_model();
        signs.SpeedSign.load_model();
        console.time('new Terrain');
        this.terrain = new Terrain();
        if (!cfg.random_street)
            this.terrain.adjust_height();
        this.terrain.rotate();
        console.timeEnd('new Terrain');

        this.init_car2d();
        this.init_cameras("first_person_cam");
        this.init_gauge();
        this.jump_to_street_position(0.5, false);
        keyboard_input.init();

        this.last_time = performance.now();
        console.log("issued animation");
        requestAnimationFrame(this.animate.bind(this));

        this.active = true;
        $(window).focus(() => { this.active = true; });
        $(window).blur(() => { this.active = false; });

        if (cfg.smooth_terrain)
            this.terrain.smooth(10, d2 => Math.exp(-d2 * 0.002), 0.02, this.street.lut, 400);
        if (cfg.show_terrain)
            scene.add(this.terrain.create_mesh());
        plog('terrain loaded');

        this.terrain.smoothed = false;
        this.gui.add(this.terrain, 'smoothed').onChange(() => {
            this.terrain.smooth(10, d2 => Math.exp(-d2 * 0.002), 0.02, this.street.lut, 200);
        });

        if (!cfg.random_street)
            this.signs_loaded = this.place_signs();
        if (cfg.show_buildings) {
            scene.add(create_city_geometry(this.streets, this.terrain));
            plog('city geometry loaded');
        }

        this.gui.close();
    }

    init_cameras(default_cam) {
        this.init_first_person_view();
        this.init_first_person_cam();
        // this.init_chase_cam();
        this.init_fly_cam();
        // this.init_picking_controls();
        //this.init_orbit_cam();
        if (cfg.do_vr)
            this.init_vr();
        this.camera = default_cam;
        this.camera_change = this.camera;
        this.gui.add(this, "camera_change", Object.keys(this.cameras)).onChange(() => this.update_camera());
        this.update_camera();

        $(() => {
            document.addEventListener('keydown', ev => {
                if (ev.keyCode == 67)
                    this.toggle_camera();
            });
        });
        plog("cameras ready");
    }

    update_camera() {
        // if (this.camera == "fly_cam")
        //     this.cameras["fly_cam"][1].enabled = false;
        // if (this.camera_change == "fly_cam")
        //     this.cameras["fly_cam"][1].enabled = true;

        if ("orbit_cam" in this.cameras) {
            let orbit_controls = this.cameras["orbit_cam"][1];
            if (this.camera == "orbit_cam") orbit_controls.enabled = false;
            if (this.camera_change == "orbit_cam") orbit_controls.enabled = true;
        }
        if ("picking_cam" in this.cameras) {
            let picking_controls = this.cameras["picking_cam"][1];
            if (this.camera == "picking_cam") picking_controls.disable();
            if (this.camera_change == "picking_cam")
                picking_controls.enable(this.cameras[this.camera][0]);
        }

        if (this.camera_change == "fly_cam") {
            this.fly_cam.copy(this.cameras[this.camera][0]);
            this.fly_controls.headingFromCameraMatrix(this.cameras[this.camera][0].matrixWorld);
            if (this.camera == "first_person_cam") {
                this.fly_cam.position.copy(
                    this.car_model.position.clone().add(this.camera_first_person_object.position));
            }
        }

        // if (this.camera_change == "fly_cam" || this.camera_change == "chase_cam") {
        //     this.cameras[this.camera_change][0].matrixWorldInverse.copy(
        //            this.cameras[this.camera][0].matrixWorldInverse);
        // }
        this.camera = this.camera_change;
        // console.log("this.camera", this.camera);
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
        osc.WebSocketPort.prototype.send_float = function (addr, val) {
            this.send({ address: addr, args: [val] });
        };
        const osc_port = new osc.WebSocketPort({
            url: "ws://localhost:8081"
        });
        osc_port.on('open', function () {
            osc_port.send_float('/startEngine', 0);
        });
        osc_port.open();
        this.osc_por = osc_port;
        $(function () {
            document.addEventListener('keydown', function (ev) {
                if (ev.keyCode == 72)
                    osc_port.send_float('/honk', 0);
            });
            window.addEventListener('unload', function () {
                osc_port.send_float('/stopEngine', 0);
                osc_port.close(1000);
            });
        });
    }

    place_sign(sign, t, gui_folder) {
        const street = this.street;
        const street_bezier = street.poly_bezier;
        const p = new THREE.Vector2().copy(street_bezier.get(t));
        const n = new THREE.Vector2().copy(street_bezier.normal(t));
        const d = street_bezier.derivative(t);
        const y = street.height_profile.get(t).y;
        p.addScaledVector(n, 0.5 * street.street_width);
        sign.position.copy(street.xytovec3(p, y));
        gui_folder.addnum(sign.position, 'y');
        gui_folder.addscale(sign.scale);
        const obj = sign.children[0];
        const name = obj.children[0].name;
        if (name.search('circle') != -1) {
            gui_folder.addcolor(obj.children[1].material, 'color');
        } else if (name.search('stop') != -1) {
            gui_folder.addcolor(obj.children[0].material.materials[1], 'color');
            // gui_folder.addcolor(g[2].material, 'emissive');
        }
        sign.rotation.y = Math.atan2(d.x, d.y);
        scene.add(sign);
    }

    init_chase_cam() {
        this.chase_camera = THREE.get_camera();

        let controls = new chase_cam(this.chase_camera, new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 20, -40)); //new THREE.Vector3(0,20,-40));
        var f = this.gui.addFolder('chase_cam');
        f.add(controls.dist_vector, 'x');
        f.add(controls.dist_vector, 'y');
        f.add(controls.dist_vector, 'z');

        this.cameras['chase_cam'] = [this.chase_camera, controls];
        this.chase_controls = controls;
    }

    init_first_person_view() {
        this.camera_first_person_object = new THREE.Object3D();
        this.camera_first_person_object.position.set(0.37, 1.36, 0.09);
        this.car_model_slope.add(this.camera_first_person_object);
    }

    init_picking_controls() {
        let controls = new picking_controls(window, scene);
        this.cameras['picking_cam'] = [controls.camera, controls];
        controls.objects.push(this.car_model);
        $(() => {
            document.addEventListener('keydown', ev => {
                if (this.camera == 'picking_cam') {
                    if (ev.keyCode == 79) // 'o'   
                        controls.update(true);
                    else if (ev.keyCode == 76) { // 'L'
                        controls.remove_selected_faces();
                        // this.car_model_slope.children[0].children[0].children[1].geometry.faces = []
                    }
                    else if (ev.keyCode == 75) // 'K'
                        controls.extend();
                    else if (ev.keyCode == 186) // 'ö' (';')
                        controls.undo_last_select();
                }
            });
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
        $(document).ready(function () {
            $("img[title='Fullscreen mode']").css('bottom', '').css('right', '').css('left', '0px').css('top', '0px');
        });

        const camera = THREE.get_camera();
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        const vr_cam = new THREE.Object3D();
        vr_cam.rotation.y = Math.PI;
        vr_cam.add(camera);
        this.camera_first_person_object.add(vr_cam);
        const controls = new THREE.VRControls(camera);
        $(document).ready(function () {
            document.addEventListener('keydown', function (ev) {
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
        const camera = THREE.get_camera();
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        camera.position.z = -0.01;

        const cam = new THREE.Object3D();
        cam.position.set(0.37, 1.36, 0.09);
        cam.add(camera);
        this.car_model_slope.add(cam);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.enabled = false;

        this.cameras['orbit_cam'] = [camera, controls];
        this.orbit_cam = camera;
        this.orbit_controls = controls;
    }

    init_fly_cam() {
        let camera = THREE.get_camera();
        let speeds = {
            "normal": 30,
            "fast": 100,
            "slow": 1,
            "very fast": 300,
            "very slow": 5
        };
        let controls = new THREE.FirstPersonControls2(camera, renderer.domElement);
        //controls.dragToLook = true;
        controls.movementSpeed = speeds["normal"];
        controls.lookSpeed = 0.2;
        controls.lookVertical = true;
        $(document).ready(function () {
            let mod = false;
            document.addEventListener('keydown', function (ev) {
                if (ev.keyCode == 16) // shift
                    controls.movementSpeed = speeds[mod ? "very fast" : "fast"];
                else if (ev.keyCode == 17) // ctlr
                    controls.movementSpeed = speeds[mod ? "very slow" : "slow"];
                else if (ev.keyCode == 18) { // alt
                    mod = true;
                    let speed = controls.movementSpeed;
                    if (speed == speeds["slow"]) controls.movementSpeed = speeds["very slow"];
                    else if (speed == speeds["fast"]) controls.movementSpeed = speeds["very fast"];
                }
            });
            document.addEventListener('keyup', function (ev) {
                if (ev.keyCode == 16 || ev.keyCode == 17)
                    controls.movementSpeed = speeds["normal"];
                else if (ev.keyCode == 18) {
                    mod = false;
                    let speed = controls.movementSpeed;
                    if (speed == speeds["very slow"]) controls.movementSpeed = speeds["slow"];
                    else if (speed == speeds["very fast"]) controls.movementSpeed = speeds["fast"];
                }
            });
        });

        this.cameras['fly_cam'] = [camera, controls];
        this.fly_cam = camera;
        this.fly_controls = controls;
    }

    init_street() {
        this.street = new Street();
        this.street.position.y = 0.53;
        var f = this.gui.addFolder('street position');
        f.addnum(this.street.position, 'y');
        this.street.create_road(cfg.random_street);
        this.street_length = this.street.poly_bezier.total_length;
        scene.add(this.street);
        // street.show_lut_points();
        this.streets.push(this.street);
    }

    place_signs() {
        this.signs = [];
        const fc = this.gui.addFolder('crossings');
        const fs = this.gui.addFolder('signs');
        const track = track_study_1;
        for (let sign of track.signs) {
            if (sign.type == 0) {
                const s = new signs.StopSign(sign.percent * this.street_length);
                this.signs.push(s);
                this.place_sign(s, sign.percent, fs);
            } else if (sign.type == 12) {
                const light = new signs.TrafficLight(sign.percent * this.street_length, sign.trigger_distance, sign.time_range_from);
                this.signs.push(light);
                this.place_sign(light, sign.percent, fs);
            } else if (sign.type < 12) { // speed sign 
                const speed_limit = 30 + 10 * (sign.type-1);
                const s = new signs.SpeedSign(sign.percent * this.street_length, speed_limit);
                // this.signs.push(s)
                this.place_sign(s, sign.percent, fs);
            }
            if (sign.type == 0 || sign.type == 12) {
                const c = this.add_crossing(sign.percent + 14 / this.street_length, sign.crossing_type, sign.crossing_height);
                scene.add(c);
                fc.addnum(c.position, 'y');
            }
        }
        this.signs_loaded = true;
        plog('signs loaded');

    }

    jump_to_street_position(t, reverse) {
        reverse = reverse || false;
        // if (start_from_end_of_street) {
        //     var curve = street.segments[street.segments.length-1].curve;
        //     //curve = street.segments[3].curve;
        //     var p = street.xytovec3(curve.get(1));
        //     car2d.position.x = p.z;
        //     car2d.position.y = -p.x;
        //     var d = curve.derivative(1);
        //     var angle = -Math.atan2(d.x,d.y) + Math.PI;
        //     console.log(angle * 180 / Math.PI);
        //     car2d.heading = angle;
        // }
        const street = this.street;
        const p = street.xytovec3(street.poly_bezier.get(t));
        this.car2d.setFromPosition3d(p);
        const d = street.poly_bezier.derivative(t);
        const angle = -Math.atan2(d.x, d.y) + (reverse ? Math.PI : 0);
        this.car2d.heading = angle;
        // if (!do_first_person_cam)
        //     camera.position.set(-20,30,car2d.position.x);            
    }

    init_car2d() {
        this.car_stats = new Stats.Stats();
        this.car2d = new Car.Car(
            {
                stats: this.car_stats
                , consumption_update: L_100km => {
                    // console.log("consumption", L_100km);
                }
            });
        this.car2d.config_panel = new ConfigPanel(this.car2d);
        $(() => {
            document.addEventListener('keydown', ev => {
                if (ev.keyCode == 87)
                    this.car2d.gearbox.gear_up();
                else if (ev.keyCode == 83)
                    this.car2d.gearbox.gear_down();
            });
        });
    }

    init_car() {
        this.car_model = new THREE.Object3D();
        this.car_model_slope = new THREE.Object3D();
        this.car_model.add(this.car_model_slope);
        
        var light = new THREE.PointLight(0xffffff, 1, 5, 0.5);
        //light.position.set(0.37, 1.4, 1.55); // TODO?: light nicht mit auto mitdrehen?
        light.position.set(0.37, 1.2, 0.01);
        var lf = this.gui.addFolder('car light');
        lf.addxyz(light.position)
        lf.addnum(light, 'intensity');
        lf.addnum(light, 'distance', 1);
        lf.addnum(light, 'decay');
        this.car_model_slope.add(light);

        scene.add(this.car_model);
        if (!cfg.show_car)
            return;
        return new Promise(resolve => {
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

                this.car_model_slope.add(car_body);

                resolve(this.car_model_slope);

            });
        });
    }

    init_gauge() {
        const gauge_needle = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.004, 0.002),
            new THREE.MeshBasicMaterial({ color: 0xb31804 })
        );
        gauge_needle.geometry.translate(0.5 * gauge_needle.geometry.parameters.width, 0, 0);
        gauge_needle.rotation.x = 0.606;
        //gauge_needle.rotation.z = [-0.806,3.933] (10-210)
        this.gauge_kmh_slope = (3.933 - (-0.806)) / (210 - 10);
        const gauge = new THREE.Object3D(); gauge.add(gauge_needle);
        gauge.position.set(0.365, 1.111, 0.806);
        // camera_first_person_object.position.copy(gauge.position);
        // camera.position.z = -0.3;
        this.car_model_slope.add(gauge);

        var gf = this.gui.addFolder('gauge');
        gf.addxyz(gauge.position, 0.01);
        gf.addxyz(gauge_needle.rotation);
        //gf.open();
        // this.gauge = gauge;
        this.gauge_needle = gauge_needle;
    }

    add_crossing(_t, type, height_diff) {
        height_diff = height_diff || 0.01;
        type = type || "both";
        const street = this.street;
        const c = new Street(); // new crossing
        c.max_deviation_random_street = 0;
        const p = new THREE.Vector2().copy(street.poly_bezier.get(_t));
        const t = new THREE.Vector2().copy(street.poly_bezier.normal(_t));
        const w = street.street_width;
        if (type == "both") {
            const p0 = p.clone().addScaledVector(t, w * 2);
            const p1 = p.clone().addScaledVector(t, w * -2);
            c.segments.push(new Bezier(p0, p, p, p1)); // main crossing
            c.starting_point = p0; // right side
            c.starting_tangent = t;
            c.create_random_segments(3);
            c.starting_point = p1; // left side
            c.starting_tangent = t.clone().multiplyScalar(-1);
            c.create_random_segments(3);

            c.create_geometry();
            c.adjust_height_from_terrain(this.terrain);
            c.calculate_lut_points();
        } else {
            c.starting_tangent.copy(t);
            if (type == "left")
                c.starting_tangent.multiplyScalar(-1);
            c.starting_point = p.clone().addScaledVector(c.starting_tangent, -0.5 * w);
            //c.initial_height = street.height_profile.get(_t).y;
            c.create_road(3, this.terrain, true);
        }
        c.position.y = street.position.y + height_diff;
        c.adjust_height_from_street(this.street, height_diff);
        c.create_mesh();
        this.streets.push(c);
        return c;
    }

    animate(time) {
        this.animates = this.animates || 0;
        if (this.animates < 1) {
            console.log('animation frame', this.animates+1);
            this.animates++;
        }

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

        this.gauge_needle.rotation.z = -0.806 + this.gauge_kmh_slope * (Math.max(car2d.kmh(), 0) - 10);
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

            car_model.position.y = this.terrain.p2height({ x: car_model.position.x, y: car_model.position.z }) + street.position.y;
            // car_model_slope.rotation.x = 0;
            // car_model_slope.rotation.y = 0;

            let on_track = true;

            var t = street.get_road_position(street.vec3toxy(car_model.position));
            car_stats.add('t', t);

            const p = street.poly_bezier.get(t);
            const xy = new THREE.Vector2().copy(street.vec3toxy(car_model.position));
            const normal = new THREE.Vector2().copy(street.poly_bezier.normal(t));
            const dp = normal.dot(xy.clone().sub(p));
            if (Math.abs(dp) > 10) {
                if (cfg.force_on_street) {
                    xy.addScaledVector(normal, -dp - (dp > 0 ? -10 : 10));
                    car_model.position.x = xy.x;
                    car_model.position.z = xy.y;
                    car2d.setFromPosition3d(car_model.position);
                } else
                    on_track = false;
            }

            if (on_track) {
                car_model.position.y = street.height_profile.get(t).y + street.position.y;

                var d = street.poly_bezier.derivative(t);
                const street_rot = Math.atan2(d.x, d.y);
                const car_rot = -car2d.heading;
                // car_model.rotation.y = 
                // car_stats.add('d.x', d.x);
                // car_stats.add('d.y', d.y);


                d = street.height_profile.derivative(t);
                d.x *= street.poly_bezier.total_length / street.height_profile.total_length;
                // car_stats.add('d.x', d.x);
                // car_stats.add('d.y', d.y);
                // car_model_slope.rotation.x = -Math.atan2(d.y,d.x);
                const axis = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, street_rot - car_rot, 0));
                const slope = Math.atan2(d.y, d.x);
                car_model_slope.quaternion.setFromAxisAngle(axis, -slope);
                //car_stats.add('slope', -car_model_slope.rotation.x * 180 / Math.PI);
                car2d.alpha = Math.cos(street_rot - car_rot) * slope;
                car_stats.add('slope', car2d.alpha * 180 / Math.PI);
            } else {
                car_model_slope.quaternion.set(0, 0, 0, 1);
                car2d.alpha = 0;
            }

            const street_position = t * this.street_length; // should be [m]
            const kmh = car2d.kmh();
            if (this.signs_loaded) {
                for (let s of this.signs)
                    s.tick(street_position, kmh);
            }
            car_stats.add('street position', street_position);
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
        if (this.camera == "picking_cam")
            this.cameras["picking_cam"][1].update();

        if (this.active)
            requestAnimationFrame(this.animate.bind(this));
        else
            setTimeout(() => { this.animate(); }, 500);

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

