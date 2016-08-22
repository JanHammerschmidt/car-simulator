'use strict';

// const perf = window.performance;
// const t0 = perf.now();
// function plog(s) {console.log(((perf.now()-t0)/1000).toPrecision(4), s);}

const cfg_base = {
    random_street: 0,
    car_scale: 1/1.6,
    force_on_street: true,
    use_audi: true,
    do_logging: true,
    do_sound: true,
    signs_scale: 0.625,
    signs_dist_mult: 0.6
}
const cfg_debug = {
    do_vr: false,
    antialias: false,
    use_more_lights: false,
    show_terrain: true,
    show_buildings: false,
    smooth_terrain: false,
    hq_street: false,
    show_car: false,
    framerate_limit_when_unfocused: true
}
const cfg_vr = { //eslint-disable-line
    do_vr: true,
    antialias: true,
    use_more_lights: true,
    show_terrain: true,
    show_buildings: true,
    smooth_terrain: true,
    hq_street: true,
    show_car: true,
    framerate_limit_when_unfocused: false
}
const cfg = window.cfg = Object.assign(cfg_base, cfg_vr);

const mousetrap = require('mousetrap');
// https://jsfiddle.net/9f6j76dL/1/

function mbind(key, callback) {
    mousetrap.bind(key, e => {
        if (!e.repeat)
            callback(e);
    }, 'keydown')
}

const misc = require("./misc.js");
misc.init_perf();
const plog = misc.plog;

if (cfg.do_vr) {
    // require('script!webvr-polyfill');
    require('script!webvr-boilerplate');
    require('script!../node_modules/three/examples/js/effects/VREffect.js');
    require('script!../node_modules/three/examples/js/controls/VRControls.js');
}
if (cfg.do_logging)
    require('script!../bower_components/sockjs-client/dist/sockjs.js');

require("../node_modules/three/examples/js/loaders/MTLLoader.js");
require("../node_modules/three/examples/js/loaders/OBJLoader.js");
require("../node_modules/three/examples/js/controls/OrbitControls.js");
require("./FirstPersonControls2.js");
require('script!./lib/THREE.ext.TextureCreator.js');
const Bezier = require('./lib/bezier.js');

const smoothie = require('../bower_components/smoothie/smoothie.js');
smoothie.upperbound = new smoothie.TimeSeries();
smoothie.lowerbound = new smoothie.TimeSeries();
smoothie.speed = new smoothie.TimeSeries();
smoothie.speed_feedback = new smoothie.TimeSeries();
smoothie.zero_line = new smoothie.TimeSeries();
smoothie.lowerdb = new smoothie.TimeSeries();

$(() => {
    let chart = new smoothie.SmoothieChart({interpolation:'linear'});
    chart.addTimeSeries(smoothie.upperbound, { strokeStyle: 'rgba(255, 0, 0, 1)', fillStyle: 'rgba(255, 0, 0, 0.2)', lineWidth: 1 });
    chart.addTimeSeries(smoothie.lowerbound, { strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 1 });
    chart.addTimeSeries(smoothie.speed, { strokeStyle: 'rgba(255, 255, 255, 1)', fillStyle: 'rgba(255, 255, 255, 0.2)', lineWidth: 1 });
    chart.streamTo(document.getElementById("speed_display"), 0);
    // smoothie.chart = chart;
    chart = new smoothie.SmoothieChart({interpolation:'linear'});
    chart.addTimeSeries(smoothie.speed_feedback, { strokeStyle: 'rgba(255, 255, 255, 1)', fillStyle: 'rgba(255, 255, 255, 0.2)', lineWidth: 1 });
    chart.addTimeSeries(smoothie.lowerdb, { strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 1 });
    chart.addTimeSeries(smoothie.zero_line, { strokeStyle: 'rgba(0, 0, 0, 1)', fillStyle: 'rgba(0, 0, 0, 0)', lineWidth: 2 });
    chart.streamTo(document.getElementById("speed_feedback"), 0);
});

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
// require('!style!css!../carphysics2d/public/js/car_config.css');

const statics = require('./webpack/static.js');
const models = statics.models;
const track_study_1 = statics.track_study_1;

//var pointInPolygon = require('point-in-polygon-extended').pointInPolyRaycast; //pointInPolyWindingNumber

$('body').append(require('html!../carphysics2d/public/js/car_config.html'));

function panning_feedback(kmh, upper, lower) {
    const neutral_kmh = 70;
    const alpha = 0.8;
    const tolerance = {'upper': 3, 'lower': 5};
    const lowerdb_scale = {'upper': 25, 'lower': 25};
    const weighting = (diff,limit,tol) => Math.max(0, (alpha * diff + (1-alpha) * diff/limit * neutral_kmh) - tol);

    let kmh_diff = 0; // simple kmh diff
    let diff = 0; // weighted kmh diff, considering tolerances
    let p = 0; // panning value (normalized to [0,1])
    let lowerdb = 0; // how much the sound will be reduced in volume
    if (kmh > upper) {
        kmh_diff = kmh - upper;
        diff = weighting(kmh_diff, upper, tolerance.upper);
        if (diff > 0) {
            p = 0.2 * Math.sqrt(diff); 
            if (p > 1.0) {
                lowerdb = (p - 1.0) * lowerdb_scale.upper;
                p = 1;
            }
        }
    } else if (kmh < lower) {
        kmh_diff = lower - kmh;
        diff = weighting(kmh_diff, lower, tolerance.lower);
        if (diff > 0) {
            p = 0.2 * Math.sqrt(diff);
            if (p > 1.0) {
                lowerdb = (p - 1.0) * lowerdb_scale.lower;
                p = -1;
            } else
                p = -p;
        }
    }
    return {'pan': p, 'lowerdb': lowerdb, 'kmh_diff': kmh_diff, 'diff': diff};
}

class Log {
    constructor(app) {
        this.items = []
        this.events = []
        const track = this.track = {'length': app.street_length, 'width': app.street.street_width};
        track.signs = app.signs.map(s => {return {'pos': s.pos, 'type': s.type}; });
        track.speed_signs = app.speed_signs.map(s => {return {'pos': s.pos, 'limit': s.speed_limit}; });
        this.frame = 0
    }
    add_event(type, event) {
        event = event || {};
        event.type = type;
        event.frame = this.frame
        this.events.push(event);
    }
    tick() { this.frame++; }
}

class LogItem extends Array {
    constructor(dt, throttle, brake, gear) {
        super(dt, throttle, brake, gear);
    }
    speed(v) {this[4] = v}
    track_deviation(v) {this[5] = v}
    track_position(v) {this[6] = v}
    rpm(v) {this[7] = v}
    consumption(v) {this[8] = v}
    total_consumption(v) {this[9] = v}
    camera(v) {this[10] = v}
    acceleration(v) {this[11] = v}
}

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

class Event {
    constructor() {
        this.promise = new Promise(r => this._resolve = r);
        this.resolved = false;
    }
    then(f) { this.promise.then(f); }
    resolve(v) { 
        this._resolve(v);
        this.resolved = true;
    }
}

class AnimatePokeball {
    constructor(ball, p0, target, app) {
        this.ball = ball;
        this.p0 = p0;
        this.target = target;
        this.p1 = target.position;
        this.dist = this.p1.clone().sub(p0).length();
        ball.position.copy(p0);
        scene.add(ball);
        this.t = 0;
        this.app = app;
    }
    tick(dt) {
        this.t += 80 *  dt / (15*Math.sqrt(this.dist*0.5));
        if (this.t > 1) {
            const d = this.app.distractions.children;
            const idx = d.indexOf(this.target);
            if (idx != -1)
                d.splice(idx, 1); // remove distractions
            this.ball.visible = false;
            return true;
        }
        this.ball.position.copy(this.p1.clone().multiplyScalar(this.t).add(this.p0.clone().multiplyScalar(1-this.t)));
        this.ball.position.y += Math.sin(this.t * Math.PI) * 4;
    }
}

function add_light(obj, name, x,y,z, gui, intensity, distance, decay, light_factory) {
	intensity = intensity || 1.0
	light_factory = light_factory || ((c,i,d,dc) => new THREE.PointLight(c,i,d,dc));
	var light = light_factory(0xffffff, intensity, distance, decay);
	light.position.set(x,y,z);
    if (gui && false) {
        var lf = gui.addFolder(name);
        lf.addxyz(light.position, 0.1);
        lf.addnum(light, 'intensity');
        lf.addnum(light, 'distance', 1);
        lf.addnum(light, 'decay');
    }
	obj.add(light);
	scene.helper_objects.add(new THREE.PointLightHelper(light, 0.05));
}

class App {
    constructor() {
        plog("App entry point");
        window.init_threejs({antialias: cfg.antialias});

        if (cfg.do_logging) {
            this.log_websocket = new SockJS('http://localhost:9999/log-server'); // eslint-disable-line
            this.log_websocket.onopen = () => console.log('connected to log-server');
            this.log_websocket.onclose = () => {
                // console.log('disconnected from log-server!');
                this.error = 'disconnected from log-server!'; 
                this.gui.add(this, 'error');
                this.gui.open();
            }
        }
        this.animations = [];
        this.cameras = {};
        scene.helper_objects = new THREE.Object3D();
        scene.helper_objects.visible = false;
        scene.add(scene.helper_objects);
        this.gui = new dat.GUI();
        this.gui.addFolder('helper objects').add(scene.helper_objects, 'visible');

        renderer.setClearColor(0xd8e7ff);
        scene.fog = new THREE.FogExp2(0xd0e0f0, 0.0025);

        const light = new THREE.HemisphereLight(0xfffff0, 0x101020, 1.25);
        // const f = this.gui.addFolder('hemisphere light');
        // f.addcolor(light, 'color');
        // f.addColor(light, 'groundColor');
        // f.addnum(light, 'intensity');
        light.position.set(0.75, 1, 0.25);
        // f.addxyz(light.position);
        scene.add(light);

        this.init_car();
        this.streets = [];
        this.init_street();
        this.do_panning = false;
        this.m_driven_total = 0;

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
        this.init_dashboard();
        this.steering_wheel = this.init_steering_wheel();
        this.init_distractions();
        this.init_cameras("first_person_cam");
        this.jump_to_street_position(0.0, false);
        keyboard_input.init();
        if (cfg.do_sound)
            this.init_sound();

        this.last_time = performance.now();
        console.log("issued animation");
        requestAnimationFrame(this.animate.bind(this));

        this.active = true;
        if (cfg.framerate_limit_when_unfocused) {
            $(window).focus(() => { this.active = true; });
            $(window).blur(() => { this.active = false; });
        }

        if (cfg.smooth_terrain)
            this.terrain.smooth(10, d2 => Math.exp(-d2 * 0.002), 0.02, this.street.lut, 400);
        if (cfg.show_terrain)
            scene.add(this.terrain.create_mesh());
        plog('terrain loaded');

        this.terrain.smooth_terrain = () => {
            this.terrain.smooth(10, d2 => Math.exp(-d2 * 0.002), 0.02, this.street.lut, 200);
        };
        //this.gui.add(this.terrain, 'smooth_terrain');

        if (!cfg.random_street)
            this.place_signs();
        if (cfg.show_buildings) {
            scene.add(create_city_geometry(this.streets, this.terrain));
            plog('city geometry loaded');
        }
        this.log = new Log(this);
        //this.gui.add(this, 'save_log_and_stop');

        this.gui.close();
    }

    save_log_and_stop() {
        this.stop_switch = true;
        this.save_log();
        this.stop_sound();
    }

    stop_handler(m_driven, street_pos) {
        this.m_driven_total += m_driven;
        if (this.m_driven_total > 3 * this.street_length && street_pos > 2) {
            console.log('STOP STOP STOP!!');
            this.save_log_and_stop();
        }
    }

    init_distractions() {
        this.distractions = new THREE.Object3D();
        this.m_driven = 0;
        this.next_distraction = 2; // meters until next distraction appears
        this.next_distraction_id = 0;
        scene.add(this.distractions);
        misc.load_obj_mtl_url('models/', 'pokeball.obj', 'pokeball.mtl').then(obj => {
            obj.scale.multiplyScalar(0.9);
            obj.rotation.y = Math.PI;
            this.pokeball = obj;
            const throw_pokeball = () => {
                if (this.animations.length > 0) {
                    console.log('one ball at a time! :o');
                    return;
                }
                const car_pos = {x: -this.car2d.position.y, y: this.car2d.position.x};
                let nearest = this.distractions.children.filter(d => d.pos.distanceTo(car_pos) <= 180);
                if (nearest.length > 0) {
                    const cam = this.cameras[(this.camera == "vr_cam") ? "vr_cam" : "first_person_cam"][0];
                    const p0 = new THREE.Vector3().unproject(cam);
                    const p1 = new THREE.Vector3(0,0,1).unproject(cam);
                    const cam_dir = new THREE.Vector3().subVectors(p1, p0).setY(0).normalize();
                    for (let d of nearest) {
                        const d_dir = new THREE.Vector3().subVectors(d.position, p0).setY(0).normalize();
                        d.dot = d_dir.dot(cam_dir);
                    }
                    nearest = nearest.filter(d => d.dot > 0);
                    if (nearest.length > 0) {
                        const n = nearest.sort((a,b) => a.dot < b.dot)[0];
                        const angle = Math.acos(n.dot) * 180 / Math.PI;
                        if (angle < 12) {
                            this.animations.push(new AnimatePokeball(this.pokeball.clone(), p0.add(cam_dir.multiplyScalar(1.5)), n, this));
                            this.log.add_event('caught distraction', {'distraction_id': n.id});
                            console.log('caught', angle);
                        } else {
                            this.log.add_event('missed distraction');
                            console.log('missed', angle);
                        }
                    }
                }
            };
            mbind('space', throw_pokeball);
            wingman_input.add_button_mapping(0, throw_pokeball);
            wingman_input.add_button_mapping(1, throw_pokeball);
            wingman_input.add_button_mapping(4, throw_pokeball);
            wingman_input.add_button_mapping(5, throw_pokeball);
        });
        const files = ['025Pikachu_OS_anime_5', '007Squirtle_AG_anime', '133Eevee_AG_anime', '393Piplup_DP_anime_3', '001Bulbasaur_AG_anime'];
        const textureLoader = new THREE.TextureLoader();
        var textures = files.map(f => new Promise(resolve => textureLoader.load('textures/pokemon/'+f+'.png', t => resolve(t))));
        this.distraction_materials = new Promise(resolve => {
            Promise.all(textures).then(textures => {
                const mats = textures.map(t => new THREE.SpriteMaterial({map:t, fog:true}));
                this.last_distraction = mats[0];
                resolve(mats);
            });
        });
    }

    distractions_handler(m_driven, t) {
        this.m_driven += m_driven;
        if (this.m_driven > this.next_distraction) {
            const distractions_placement_distance = 200;
            const distraction_place_every_m_driven = [100, 200];
            // console.log('place distraction at', t * this.street_length, '+', distractions_placement_distance, '=', t * this.street_length + distractions_placement_distance);
            this.place_distraction(t + distractions_placement_distance / this.street_length);
            this.m_driven = 0;
            this.next_distraction = misc.rand_int(...distraction_place_every_m_driven);
        }
    }

    place_distraction(t) {
        t = t || misc.rand(0,1);
        if (t > 1)
            t -= 1;
        this.distraction_materials.then(mats => {
            mats = mats.slice();
            mats.splice(mats.indexOf(this.last_distraction), 1);
            const street = this.street;
            const street_bezier = street.poly_bezier;     
            const p = new THREE.Vector2().copy(street_bezier.get(t));
            const n = new THREE.Vector2().copy(street_bezier.normal(t));
            const dist = misc.rand(-50,50);
            const scale = (2 + Math.abs(dist)/50 * 4) * 0.7;
            p.addScaledVector(n, dist);
            const mat = mats[misc.rand_int(0, mats.length)];
            this.last_distraction = mat;
            const s = new THREE.Sprite(mat);
            let y = this.terrain.p2height(p);
            if (Math.abs(dist) <= 0.5* street.street_width)
                y += street.position.y 
            s.position.set(p.x, y + 0.5*scale, p.y);
            s.scale.set(scale,scale,scale);
            s.pos = p; // save 2d position
            s.number = this.next_distraction_id;
            this.next_distraction_id++;
            this.distractions.add(s);  
            this.log.add_event('add distraction', {'pos': t * this.street_length, 'dist': dist, 'id': s.number});
        });
    }

    init_cameras(default_cam) {
        this.init_first_person_view();
        this.init_first_person_cam();
        // this.init_chase_cam();
        this.init_fly_cam();
        // this.init_picking_controls();
        // this.init_orbit_cam();
        if (cfg.do_vr)
            this.init_vr();
        this.camera = default_cam;
        this.camera_change = this.camera;
        this.gui.add(this, "camera_change", Object.keys(this.cameras)).onChange(() => this.update_camera());
        this.update_camera();

        mbind('c', () => { this.toggle_camera(); });
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
            keyboard_input.no_wasd = true;
            this.fly_cam.copy(this.cameras[this.camera][0]);
            this.fly_controls.headingFromCameraMatrix(this.cameras[this.camera][0].matrixWorld);
            if (this.camera == "first_person_cam") {
                this.fly_cam.position.copy(
                    this.car_model.position.clone().add(this.camera_first_person_object.position));
            }
        }
        if (this.camera_change == "first_person_cam")
            keyboard_input.no_wasd = false;

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
        require('script!../node_modules/osc/dist/osc-browser.js');        
        osc.WebSocketPort.prototype.send_float = function(addr, val, no_log) {
            // if (!no_log)
            //     console.log('osc:', addr, val)
            this.send({ address: addr, args: [val] });
        };
        osc.WebSocketPort.prototype.call = function(addr, no_log) {
            this.send_float(addr, 0, no_log);
        }
        const osc_port = new osc.WebSocketPort({
            url: "ws://localhost:8081"
        });
        osc_port.on('open', () => {
            osc_port.call('/startEngine');
            osc_port.call('/startRadio')
            this.osc_port = osc_port;
            window.osc_port = osc_port;
        });
        osc_port.open();

        this.fedis = {'1': 'slurp', '2': 'pitch', '3': 'grain'};
        this.sound_modus = '0';

        // mbind('h', () => { osc_port.call('/honk'); });
        //mbind('p', () => { osc_port.call('/stopEngine'); });
        mbind('p', () => { 
            this.do_panning = !this.do_panning;
            console.log('panning', this.do_panning);
            if (!this.do_panning) {
                this.osc_port.send_float('/panning', 0);
                this.osc_port.send_float('/lowerdb', 0);                
            }
        });
        mbind('k', () => {this.stop_sound()});

        // mbind(['0', '1', '2', '3'], e => {
        //     this.set_sound_modus(e.key);
        // });
        // mbind('shift+g shift+p', () => { osc_port.call('/grain_toggle_pitch'); });
        // mbind('shift+c', () => { osc_port.call('/show_controls'); });
        $(() => {            
            window.addEventListener('unload', () => {
                this.stop_sound();
            });
        });
    }

    stop_sound() {
        if (this.osc_port) {
            this.set_sound_modus('0');
            this.osc_port.call('/stopEngine');
            this.osc_port.call('/stopRadio');
            this.osc_port.close();
        }
    }

    set_sound_modus(c) {
        if (c == this.sound_modus)
            return;
        if (true) { // if (this.started) // eslint-disable-line
            this.toggle_fedi(this.sound_modus, false)
            this.toggle_fedi(c, true);
        }
        this.sound_modus = c;
        console.log("sound modus:", c)
    }
    toggle_fedi(c, enable) {
        const fedi = this.fedis[c];
        // if (fedi)
        //     this.osc_port.call('/'+fedi+ '_' + (enable ? 'start' : 'stop'));
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
        if (cfg.use_audi) {
            const m = cfg.car_scale;
            this.camera_first_person_object.position.set(m*0.53, m*1.8, m*-0.4);
        } else
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
        //WebVRConfig: https://github.com/borismus/webvr-polyfill/
        //window.WebVRConfig.DEFER_INITIALIZATION = true;
        //window.WebVRConfig.FORCE_ENABLE_VR = true;
        //window.WebVRConfig.BUFFER_SCALE = 1;
        const effect = new THREE.VREffect(renderer);
        //effect.setSize(window.innerWidth, window.innerHeight); // TODO: do you really need this?
        this.vr_manager = new WebVRManager(renderer, effect);
        $(() => {
            $("img[title='Fullscreen mode']").css('bottom', '').css('right', '').css('left', '0px').css('top', '0px');
        });

        const camera = THREE.get_camera();
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        const vr_cam = new THREE.Object3D();
        vr_cam.rotation.y = Math.PI;
        vr_cam.add(camera);
        this.camera_first_person_object.add(vr_cam);
        const controls = new THREE.VRControls(camera);
        mbind('enter', () => controls.resetSensor() );
        this.cameras["vr_cam"] = [camera, controls];
        //this.gui.add(camera, 'fov').onChange(() => camera.updateProjectionMatrix());
        scene.helper_objects.add(new THREE.CameraHelper(camera));

        mbind('o', () => {
            this.camera_change = "vr_cam";
            this.update_camera(); 
            this.vr_manager.enterVRMode_();
            this.vr_manager.setMode_(3); 
        });
        // mbind('l', () => { this.vr_manager.setMode_(1) });
    }

    init_first_person_cam() {
        let camera = THREE.get_camera();
        let controls = null;
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        if (!this.use_static_first_person_cam) {
            controls = new THREE.FirstPersonControls2(camera, renderer.domElement, false);
            controls.lookSpeed = 0.2;
            controls.lookVertical = true;
            // scene.helper_objects.add(new THREE.CameraHelper(camera));
        }
        this.camera_first_person_object.add(camera);        

        let f = this.gui.addFolder('first person cam');
        f.addxyz(this.camera_first_person_object.position);
        this.camera_first_person_object.color = new THREE.Color(0xffffff); 
        scene.helper_objects.add(new THREE.PointLightHelper(this.camera_first_person_object, 0.05));
        f.add(camera, 'fov').onChange(() => camera.updateProjectionMatrix());
        f.add(camera, 'near').onChange(() => camera.updateProjectionMatrix());
        f.add(camera, 'far').onChange(() => camera.updateProjectionMatrix());

        this.cameras["first_person_cam"] = [camera, controls];
    }

    init_orbit_cam() {
        const camera = THREE.get_camera();
        camera.lookAt(new THREE.Vector3(0, 0, 1));
        camera.position.z = -0.01;

        const cam = new THREE.Object3D();
        cam.add(camera);
        this.steering_wheel.then(w => {
            const anchor = w;
            const attach = false;
            if (attach)
                anchor.add(cam);
            else {
                cam.position.copy(anchor.position);
                this.car_model_slope.add(cam);
            }
        });


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
        $(() => {
            let mod = false;
            document.addEventListener('keydown', ev => {
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
            document.addEventListener('keyup', ev => {
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
        const track = track_study_1;
        this.street = new Street();
        this.street.position.y = track.street_above_ground;
        // var f = this.gui.addFolder('street position');
        // f.addnum(this.street.position, 'y');
        this.street.create_road(cfg.random_street);
        this.street_length = this.street.poly_bezier.total_length;
        console.log("street length", this.street_length);
        scene.add(this.street);
        // street.show_lut_points();
        this.streets.push(this.street);
    }

    place_sign(sign, t, gui_folder) {
        sign.pos = t * this.street_length;
        const street = this.street;
        const street_bezier = street.poly_bezier;
        const p = new THREE.Vector2().copy(street_bezier.get(t));
        const n = new THREE.Vector2().copy(street_bezier.normal(t));
        const d = street_bezier.derivative(t);
        const y = street.height_profile.get(t).y;
        p.addScaledVector(n, cfg.signs_dist_mult * street.street_width);
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

    place_signs() {
        this.signs = []; // list of signs that need to be tick'd 
        this.speed_signs = [];
        const fc = this.gui.addFolder('crossings');
        const fs = this.gui.addFolder('signs');
        //const ft = this.gui.addFolder('traffic lights');
        const track = track_study_1;
        for (let sign of track.signs) {
            if (sign.type == 0) { // stop sign
                const s = new signs.StopSign(sign.percent * this.street_length);
                s.type = 'stop sign';
                this.signs.push(s);
                this.place_sign(s, sign.percent, fs);
            } else if (sign.type == 12) { // traffic light
                const light = new signs.TrafficLight(sign.percent * this.street_length, sign.trigger_distance, sign.time_range_from);
                light.type = 'traffic light';
                //const l = light.children[0].children.last();
                //ft.addxyz(l.position)
                //ft.addnum(l, 'intensity');
                //ft.addnum(l, 'distance', 1);
                //ft.addnum(l, 'decay');

                this.signs.push(light);
                this.place_sign(light, sign.percent, fs);
            } else if (sign.type < 12) { // speed sign 
                const speed_limit = 30 + 10 * (sign.type-1);
                const s = new signs.SpeedSign(sign.percent * this.street_length, speed_limit);
                this.speed_signs.push(s)
                this.place_sign(s, sign.percent, fs);
            }
            if (sign.type == 0 || sign.type == 12) {
                const c = this.add_crossing(sign.percent + (0.5 * this.street.street_width + 2) / this.street_length, sign.crossing_type, sign.crossing_height, sign.crossing_segments);
                scene.add(c);
                fc.addnum(c.position, 'y');
            }
        }
        signs.SpeedSign.init_observer();
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
        const n = street.xytovec3(street.poly_bezier.normal(t));
        p.addScaledVector(n, this.street.street_width * 0.25);
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
                , consumption_update: L_100km => { // eslint-disable-line
                    // console.log("consumption", L_100km);
                },
                gear_change_callback: gear => {
                    $('#gears_display').text(gear+1);
                    if ("gears_display" in this)
                        this.gears_display.writeText(this.car2d.gearbox.gear + 1);
                }
            });
        this.car2d.config_panel = new ConfigPanel(this.car2d);
        //mbind('r', () => this.car2d.gearbox.gear_up() );
        //wingman_input.add_button_mapping(5, () => this.car2d.gearbox.gear_up() );
        //mbind('f', () => this.car2d.gearbox.gear_down() );
        //wingman_input.add_button_mapping(4, () => this.car2d.gearbox.gear_down() );
        mbind('shift+f', () => this.car2d.engine.max_torque = 600 );
        mbind('ctrl+shift+f', () => this.car2d.engine.max_torque = 2000 );
        setInterval(() => {
            $('#kmh_display').text(Math.round(this.car2d.kmh()));
        }, 400);
    }

    load_car() {
        if (this['load_car_button'])
            this.gui.remove(this.load_car_button);
        if (cfg.use_audi) {
            load_car.load_audi().then(obj => {
                let mats = []; // gather mats
                for (let c of obj.children) {
                    const mat = c.material;
                    if (mat instanceof THREE.MultiMaterial)
                        mats = mats.concat(mat.materials);
                    else
                        mats = mats.concat(mat);
                }
                for (let m of mats) {
                    if (m.bumpMap)
                        m.bumpScale *= 0.1; // set bumpmap scale
                    m.side = THREE.DoubleSide; // set double-sided
                }
                this.car_model_slope.add(obj);
                obj.scale.multiplyScalar(cfg.car_scale);
                this.car_body = obj;
                // gui.addFolder('car position').addnum(obj.position, 'y');
                this.car_loaded._resolve(obj);

            });
        } else { // load renault
            load_car.load_renault((car_body/*, wheel*/) => {

                car_body.rotateX(-Math.PI / 2);
                car_body.position.y = 0.29;
                
                this.car_model_slope.add(car_body);
                // gui.addFolder('car position').addnum(car_body.position, 'y');
                this.car_loaded._resolve(car_body);

            });
        }
    }

    init_car() {
        this.car_model = new THREE.Object3D();
        this.car_model_slope = new THREE.Object3D();
        this.car_model.add(this.car_model_slope);

        if (cfg.use_audi) {
            if (cfg.use_more_lights) {
                const gf = null; //this.gui.addFolder('car lights');
                add_light(this.car_model_slope, 'inside', 0.26,2.08,0.3, gf, 0.65, 5, 0.5);
                add_light(this.car_model_slope, 'left', 0.95,1.88,-0.4, gf, 0.56, 5, 0.5);
                add_light(this.car_model_slope, 'right', -0.95,1.99,-0.4, gf, 0.56, 5, 0.5);
            } else
                add_light(this.car_model_slope, 'car light', 0.58,1.87,-0.07, this.gui, 1, 5, 0.5);
        } else {
            add_light(this.car_model_slope, 'car light', 0.37, 1.2, 0.01, this.gui, 1, 5, 0.5);
            //light.position.set(0.37, 1.4, 1.55); // TODO?: light nicht mit auto mitdrehen?
        }

        scene.add(this.car_model);
        this.car_loaded = new Event();
        if (cfg.show_car)
            this.load_car();
        else
            this.load_car_button = this.gui.add(this, 'load_car');
    }

    init_steering_wheel() {
        if (!cfg.use_audi)
            return;
        this.car_loaded.then(car_body => {
            car_body.children = car_body.children.filter(c => c.name.indexOf('STEERING') < 0 || c.name.indexOf('ignition') > 0);
        });
        return new Promise(resolve => {
            misc.load_obj_mtl_url('models/AudiA3/', 'steering_wheel.obj', 'steering_wheel.mtl').then(wheel => {
                wheel.scale.multiplyScalar(cfg.car_scale);
                const m = cfg.car_scale;
                wheel.position.set(m*0.562, m*1.458, m*0.332);
                wheel.rotation.set(0.446,0,0);
                // const gf = this.gui.addFolder('steering wheel');
                // gf.addxyz(wheel.position, 0.01);
                // gf.addxyz(wheel.rotation, 0.01);
                // gf.add(wheel, 'visible');
                this.car_model_slope.add(wheel);
                resolve(wheel);
            });
        });
    }

    init_dashboard() {
        if (cfg.use_audi) {
            const init_needle = (name, model, x,y,z, rx, ry, add_gui) => {
                const needle = misc.load_obj_mtl(model);
                needle.scale.multiplyScalar(cfg.car_scale);
                const m = cfg.car_scale;
                needle.position.set(m*x, m*y, m*z);
                needle.rotation.x = rx;
                needle.rotation.y = ry;
                this.car_model_slope.add(needle);
                if (add_gui) {
                    const gf = this.gui.addFolder(name);
                    gf.addxyz(needle.position, 0.01);
                    gf.addxyz(needle.rotation);
                }
                return needle;
            }
            this.speedometer_needle = init_needle('speedometer', models.dashboard_needle1, 0.412, 1.478, 0.75, 0.2, 0);
            this.rpm_needle = init_needle('rpm display', models.dashboard_needle1, 0.692, 1.474, 0.75, 0.2, 0);
            this.top_needle_left = init_needle('top needle left', models.dashboard_needle2, 0.5885, 1.52, 0.753, 0.2, 0.05);
            this.top_needle_right = init_needle('top needle right', models.dashboard_needle2, 0.511, 1.52, 0.757, 0.2, 0.05);
            //speedometer_needle.rotation.z = [-0.48,4.32] (10-210)
            this.speedometer_z10kmh = -0.48;
            this.speedometer_kmh_slope = (4.32 - (-0.48)) / (210 - 10);
            //rpm_needle.rotation.z = [-0.45,4.32] (0-7k)
            this.rpm0 = -0.45;
            this.rpm_slope = (4.30 - this.rpm0) / 7000;
            this.rpm_needle.rpm = 0;
            // this.gui.addnum(this.rpm_needle, 'rpm').onChange(rpm => {
            //     this.rpm_needle.rotation.z = this.rpm0 + this.rpm_slope * rpm;
            // });
            this.car_loaded.then(car_body => {
                for (let n of ['speed_dial_right', 'speed_dial_left', 'counter_top_left01', 'top_right_counter_dial'])
                    car_body.children = car_body.children.filter(c => c.name.indexOf(n) < 0);
                this.car_windows = car_body.children.filter(c => (c.name.toLowerCase().indexOf('window') >= 0 || c.name.indexOf('windscreen') >= 0) 
                                                    && c.name.indexOf('frame') < 0 && c.name.indexOf('holder') < 0 && c.name.indexOf('surround') < 0);
                this.show_car_windows = false;
                const update_car_windows = () => {
                    for (let w of this.car_windows)
                        w.visible = this.show_car_windows;
                };
                //this.gui.add(this, 'show_car_windows').onChange(update_car_windows);
                update_car_windows();
                const gears_display = THREE.ext.TextureCreator.text();
                const dashboard_display = car_body.children.filter(c => c.name.indexOf('Object') >= 0)[0];
                dashboard_display.material.map = gears_display.texture;
                gears_display.texture.wrapS = THREE.RepeatWrapping;
                gears_display.texture.repeat.x = -1;
                gears_display.writeText(this.car2d.gearbox.gear + 1);
                this.gears_display = gears_display;
            });            
        } else {
            const speedometer_needle = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.004, 0.002),
                new THREE.MeshBasicMaterial({ color: 0xb31804 })
            );
            speedometer_needle.geometry.translate(0.5 * speedometer_needle.geometry.parameters.width, 0, 0);
            speedometer_needle.rotation.x = 0.606;
            //speedometer_needle.rotation.z = [-0.806,3.933] (10-210)
            this.speedometer_z10kmh = -0.806;
            this.speedometer_kmh_slope = (3.933 - (-0.806)) / (210 - 10);
            const speedometer = new THREE.Object3D(); speedometer.add(speedometer_needle);
            speedometer.position.set(0.365, 1.111, 0.806);
            // camera_first_person_object.position.copy(speedometer.position);
            // camera.position.z = -0.3;
            this.car_model_slope.add(speedometer);

            var gf = this.gui.addFolder('speedometer needle');
            gf.addxyz(speedometer.position, 0.01);
            gf.addxyz(speedometer_needle.rotation);
            //gf.open();
            this.speedometer_needle = speedometer_needle;
        }
    }

    add_crossing(_t, type, height_diff, segments) {
        height_diff = height_diff || 0.01;
        type = type || "both";
        segments = segments || 3;
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
            c.create_random_segments((segments instanceof Array) ? segments[1] : segments);
            c.starting_point = p1; // left side
            c.starting_tangent = t.clone().multiplyScalar(-1);
            c.create_random_segments((segments instanceof Array) ? segments[0] : segments);

            c.create_geometry();
            c.adjust_height_from_terrain(this.terrain);
            c.calculate_lut_points();
        } else {
            c.starting_tangent.copy(t);
            if (type == "left")
                c.starting_tangent.multiplyScalar(-1);
            c.starting_point = p.clone().addScaledVector(c.starting_tangent, -0.5 * w);
            //c.initial_height = street.height_profile.get(_t).y;
            c.create_road(segments, this.terrain, true);
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
        const inputs = car2d.inputs;

        var accel = null,
            steering = null;
        if (keyboard_input.tick()) {
            accel = keyboard_input.accel;
            steering = keyboard_input.steering;
        }
        if (wingman_input.tick()) {
            accel = wingman_input.accel;
            steering = wingman_input.steering;
        }
        if (accel != null) {
            // console.log('accel', accel, 'steering', steering);
            if (accel > 0) {
                inputs.throttle = accel;
                inputs.brake = 0;
            } else { // is braking
                inputs.throttle = 0;
                inputs.brake = -accel;
            }
            inputs.steering = steering;
        }
        if (!this.started && inputs.throttle > 0) {
            this.started = true;
            if (cfg.do_logging) {
                console.log("starting logging")
                this.save_log = () => {
                    console.log("sending " + this.log.items.length + " items and " + this.log.events.length + " events");
                    const s = this.log_websocket;
                    this.log.panning_condition = this.do_panning;
                    s.send(JSON.stringify(this.log));
                };
                this.gui.add(this, 'save_log');
            }
        }
        if (cfg.do_logging && this.started) {
            var log_item = new LogItem(dt, inputs.throttle, inputs.brake, car2d.gearbox.gear);
        }
        car2d.update(dt * 1000);
        car2d.auto_gear_change();

        this.speedometer_needle.rotation.z = this.speedometer_z10kmh + this.speedometer_kmh_slope * (Math.max(car2d.kmh(), 0) - 10);
        if (cfg.use_audi)
            this.rpm_needle.rotation.z = this.rpm0 + this.rpm_slope * car2d.engine.rpm();
        if (this.started && this.osc_port) {
            this.osc_port.send_float('/rpm', 0.05 + car2d.engine.rel_rpm() * 0.7, true);
            // this.osc_port.send_float('/L_100km', car2d.consumption_monitor.liters_per_100km_cont, true);
        }        

        car_model.rotation.y = -car2d.heading;
        car_model.position.x = -car2d.position.y;
        car_model.position.z = car2d.position.x;
        this.steering_wheel.then(w => {w.rotation.z = -inputs.steering * 0.9});

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
        let m_driven = street_position - ("prev_street_position" in this ? this.prev_street_position : 0);
        if (m_driven < -1000) // happens when restarting at the beginning after one circuit
            m_driven += this.street_length;
        else if (m_driven > 1000) // happens when going back through the "zero line"
            m_driven -= this.street_length;
        this.prev_street_position = street_position;
        const kmh = car2d.kmh();
        const ctime = new Date().getTime();
        smoothie.speed.append(ctime, kmh);
        if (this.started && this.signs_loaded) {
            signs.SpeedSign.tick(street_position, kmh, dt, this);
            for (let s of this.signs) // these are all except for the speed signs
                s.tick(street_position, kmh, this);
            const upper = Math.min(signs.SpeedSign.speed_channel.limit, ...this.signs.map(s => s.limit));
            const lower = Math.min(signs.SpeedSign.speed_channel.lower, ...this.signs.map(s => s.lower));
            smoothie.upperbound.append(ctime, upper);
            smoothie.lowerbound.append(ctime, lower);
            const feedback = panning_feedback(kmh, upper, lower);
            smoothie.speed_feedback.append(ctime, feedback.pan);
            smoothie.lowerdb.append(ctime, feedback.lowerdb);
            if (this.osc_port && this.do_panning) {
                this.osc_port.send_float('/panning', feedback.pan, true);
                this.osc_port.send_float('/lowerdb', feedback.lowerdb, true);
            }
            smoothie.zero_line.append(ctime, 0);
        }
        car_stats.add('street position', street_position);
        car_stats.add('car.x', car_model.position.x);
        car_stats.add('car.z', car_model.position.z);
        car_stats.add('car.y', car_model.position.y);
        car_stats.render();

        this.distractions_handler(m_driven, t);
        for (var i = this.animations.length-1; i >= 0; i--) {
            if (this.animations[i].tick(dt))
                this.animations.splice(i, 1);
        } 

        if (car_model && this.camera == "chase_cam") //"chase_cam" in this.cameras)
            this.cameras["chase_cam"][1].tick(car_model.position, new THREE.Quaternion().multiplyQuaternions(car_model.quaternion, car_model_slope.quaternion), dt);
        if (this.camera == "fly_cam")
            this.cameras["fly_cam"][1].update(dt);
        if (this.camera == "orbit_cam")
            this.cameras["orbit_cam"][1].update();
        if (this.camera == "picking_cam")
            this.cameras["picking_cam"][1].update();
        if (!this.use_static_first_person_cam && this.camera == "first_person_cam")
            this.cameras["first_person_cam"][1].update(dt);

        if (this.active)
            requestAnimationFrame(this.animate.bind(this));
        else
            setTimeout(() => { this.animate(); }, 500);

        if ("vr_cam" in this.cameras)
            this.cameras["vr_cam"][1].update();
        if (this.camera == "vr_cam") {
            if (car_model)
                car_model.updateMatrixWorld(true);
            this.vr_manager.render(scene, this.cameras["vr_cam"][0]);
        } else {
            renderer.render(scene, this.cameras[this.camera][0]);
        }
        if (cfg.do_logging && this.started) {
            log_item.speed(kmh);
            log_item.track_deviation(dp);
            log_item.track_position(street_position);
            log_item.rpm(car2d.engine.rpm());
            log_item.consumption(car2d.consumption_monitor.liters_per_100km_cont);
            log_item.total_consumption(car2d.consumption_monitor.liters_used);
            log_item.acceleration(car2d.velocity_c.x);
            const cam = (("vr_cam" in this.cameras) ? this.cameras['vr_cam'] : this.cameras['first_person_cam'])[0];
            const p0 = new THREE.Vector3().unproject(cam);
            const p1 = new THREE.Vector3(0,0,1).unproject(cam);             
            log_item.camera([p0.toArray(), p1.toArray()]);
            this.log.items.push(log_item);
            this.log.tick();
            this.stop_handler(m_driven, street_position);
        }        

        this.last_time = time;
    }
}

let app = new App(); // eslint-disable-line no-unused-vars

