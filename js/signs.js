'use strict';

const smoothie = require('../bower_components/smoothie/smoothie.js');
const misc = require("./misc.js");
const delay = misc.delay;
const models = require('./webpack/static.js').models;

const TOO_FAST_TOLERANCE = 0.1;
const TOO_FAST_TOLERANCE_OFFSET = 10;
const COOLDOWN_TIME_SPEEDING = 10000;

const BRAKING = 2; // kmh per meter (?)

class SpeedObserver {
    constructor(street) {
        this.precision = 0.5;
        const def_speed_limit = Math.max(...SpeedSign.signs.map(s=>s.speed_limit));
        const n_items = Math.ceil(street.poly_bezier.total_length * this.precision); 
        this.upper = new Array(n_items).fill(def_speed_limit); // speed limit
        this.lower = new Array(n_items).fill(0); // min speed
        for (let [i,s] of SpeedSign.signs.entries()) {
            const from = Math.ceil(s.pos * this.precision);
            let to = n_items;
            if (i < SpeedSign.signs.length - 1)
                to = Math.ceil(SpeedSign.signs[i+1].pos * this.precision);
            for (let n = from; n < to; n++) {
                console.assert(this.upper[n] == def_speed_limit);
                this.upper[n] = s.speed_limit;
            }
            const prev_limit = i > 0 ? SpeedSign.signs[i-1].speed_limit : def_speed_limit;
            if (prev_limit > s.speed_limit) { // coming from a faster limit
                let tlimit = s.speed_limit; 
                for (let n = from; n >= 0; n--) {
                    this.upper[n] = Math.min(tlimit, this.upper[n]);
                    tlimit += BRAKING / this.precision;
                    if (tlimit > prev_limit)
                        break;
                }
            }
        }
    }
    plot() {
        const data = {
            x: [...this.upper.keys()],
            y: this.upper,
            type: 'scatter' 
        };
        const layout = {
            margin: {l:30,r:0,t:0,b:0,p:0}
        }
        window.Plotly.newPlot('plotly', [data], layout);
    }
}

class CurrentSign {
    constructor(signs) {
        this.signs = signs;
        this.next_i = 0;
    }
    set_next_sign() {
        this.current = this.next;
        this.next = this.next_i >= this.signs.length ? null : this.signs[this.next_i];
    }
}

class SpeedSign extends THREE.Object3D {
    constructor(pos, speed_limit) {
        super();
        this.pos = pos;
        this.model = SpeedSign._model.clone();
        this.add(this.model);
        if (speed_limit != 70) {
            const tloader = new THREE.TextureLoader();
            tloader.load('models/speed_sign/' + speed_limit + 'sign.jpg', tex => {
                this.model.children[1].material = this.model.children[1].material.clone();
                this.model.children[1].material.map = tex;
            });
        }
        this.speed_limit = speed_limit;
        SpeedSign.signs.push(this);
    }
    static load_model() {
        const obj = misc.load_obj_mtl(models.speed_sign);
        obj.rotateY(Math.PI);
        obj.position.y = -2.5;
        obj.scale.multiplyScalar(3.5);
        const sign = obj.children[1];
        sign.material = new THREE.MeshBasicMaterial({map:sign.material.map, color: '#e8e8e8'});
        SpeedSign._model = obj;
        SpeedSign.signs = [];
    }
    static init_observer() {
        const v = new CurrentSign(SpeedSign.signs);
        SpeedSign.violations = v;
        v.limit = Math.max(...SpeedSign.signs.map(s=>s.speed_limit)) * (1+TOO_FAST_TOLERANCE) + TOO_FAST_TOLERANCE_OFFSET;
        v.cooldown_timer_start = new Date();
        SpeedSign.violation_set_next_sign();

        const c = new CurrentSign(SpeedSign.signs);
        SpeedSign.speed_channel = c;
        c.limit = Math.max(...SpeedSign.signs.map(s=>s.speed_limit));
        c.set_next_sign();
    }
    static violation_set_next_sign() {
        const v = this.violations;
        v.set_next_sign();
        if (v.next)
            v.trigger_dist = v.current && v.next.speed_limit > v.limit ? 30 : -30;
    }
    // static set_next_sign() { // based on next_sign_i (and update current_sign based on next_sign)
    //     const signs = SpeedSign.signs;
    //     const i = SpeedSign.next_sign_i;
    //     SpeedSign.current_sign = SpeedSign.next_sign;
    //     SpeedSign.next_sign = i >= signs.length ? null : signs[i];
    //     if (SpeedSign.next_sign)
    //         SpeedSign.trigger_dist = SpeedSign.current_sign && 
    //                                  SpeedSign.next_sign.speed_limit > SpeedSign.current_sign.speed_limit ? 30 : -30;
    // }
    static tick(cur_pos, kmh) {
        // observe violations
        const v = SpeedSign.violations;
        if (v.next) {
            const d = v.next.pos - cur_pos;
            //smoothie.speed.append(new Date().getTime(), d);
            if (d < v.trigger_dist) {
                console.log("speed limit: " + v.next.speed_limit + " kmh");
                v.limit = v.next.speed_limit * (1+TOO_FAST_TOLERANCE) + TOO_FAST_TOLERANCE_OFFSET; // apply speed limit from next sign
                v.next_i++;
                SpeedSign.violation_set_next_sign();
            }
        }
        if (kmh > v.limit && (new Date() - v.cooldown_timer_start) > COOLDOWN_TIME_SPEEDING) {
            if (window.osc_port)
                window.osc_port.call('/flash');
            console.log('speeding violation ('+kmh.toPrecision(3)+' kmh instead of '+(v.current ? v.current.speed_limit : v.limit)+' kmh)');
            v.cooldown_timer_start = new Date();
        }

        const c = SpeedSign.speed_channel;
        if (c.next) {
            const d = c.next.pos - cur_pos;
            if (d <= 0) {
                c.limit = c.next.speed_limit;
                c.next_i++;
                c.set_next_sign();
            } else {
                c.limit = Math.min(c.limit, c.next.speed_limit + BRAKING * d);
            }
        }
        smoothie.speed.append(new Date().getTime(), kmh);
        smoothie.upperbound.append(new Date().getTime(), c.limit);
    }
}

class StopSign extends THREE.Object3D {
    constructor(pos) {
        super();
        this.pos = pos;
        this.model = StopSign._model.clone();
        this.add(this.model);
        this.state = 0; // {0: too far away, 1: approaching (must stop), 2: past sign / has stopped / has issued warning}
    }
    static load_model() {
        const obj = misc.load_obj_mtl(models.stop_sign);
        obj.rotateY(Math.PI);
        obj.rotateX(Math.PI / 2);
        obj.position.y = -2.27;
        obj.scale.multiplyScalar(1.5);
        const mats = obj.children[0].material.materials;
        mats[1] = new THREE.MeshBasicMaterial({map:mats[1].map, color: '#e8e8e8'});
        StopSign._model = obj;
        misc.plog("stop sign model loaded");
    }
    tick(cur_pos, kmh) {
        if (this.state == 2)
            return;
        const d = this.pos - cur_pos;
        if (this.state == 0) {
            if (d < 50) {
                console.log("stop sign: trigger");
                this.state = 1;
            }
        } else { // state == 1
            if (kmh < 10) {
                console.log("stop sign: stopped")
                this.state = 2;
            }
            else if (d < 0) {
                if (window.osc_port)
                    window.osc_port.call('/flash');                
                console.log("stop sign: überfahren! :o");
                this.state = 2;
            }
        }

    }
}


class TrafficLight extends THREE.Object3D {
    constructor(pos, trigger_dist, delay) {
        super();
        //console.log("traffic light", "pos", pos, "trigger_dist", trigger_dist);
        this.pos = pos;
        this.trigger_dist = trigger_dist;
        this.delay = delay;
        this.model = TrafficLight._model.clone();
        this.colors = ['green','yellow','red'].map(c => this.model.children.find(o => o.name == c));
        for (let c of this.colors) {
            c.geometry.computeBoundingSphere();
            c.material = c.material.clone();
        }
        const frame = this.model.children.find(o => o.name == 'frame');
        frame.material = new THREE.MeshBasicMaterial({color: '#e8e8e8'})
        this.lights_on = [0x49e411, 0xd2c100, 0x960101];
        this.lights_off = [0x142d0b, 0x262300, 0x1f0000];
        this.light = new THREE.PointLight(0xffffff, 1.25, 10, 0.5);
        this.model.add(this.light);
        scene.helper_objects.add(new THREE.PointLightHelper(this.light, 0.05));
        this.set_state(2);
        //this.demo()
        this.add(this.model);
        this.no_tick = false;
    }
    static load_model() {
        const obj = misc.load_obj_mtl(models.traffic_light);
        obj.scale.multiplyScalar(24);
        obj.position.y = -1.9;
        obj.rotateY(Math.PI/2);
        obj.children.find(o => o.name == 'case').material.side = THREE.DoubleSide;
        TrafficLight._model = obj;
        misc.plog("traffic light model loaded");
    }
    set_state(state) {
        //console.log("traffic light state", state);
        const lights_off = this.lights_off;
        this.colors.forEach(function(c,i) {
            c.material.color.setHex(lights_off[i]);
            // c.emissive.setHex(lights_off[i]);
        });
        this.colors[state].material.color.setHex(this.lights_on[state]);
        // this.colors[state].emissive.setHex(this.lights_on[state]);
        this.light.position.copy(this.colors[state].geometry.boundingSphere.center);
        this.light.position.x += 0.02;
        this.state = state;
    }
    trigger() {
        console.assert(this.state == 2); // must be red
        console.log("traffic light trigger");
        this.state = 3; // red/pending
        delay(this.delay).then(() => {
            this.set_state(1);
            return delay(1000);
        }).then(() => {
            this.set_state(0)
        });
    }
    tick(cur_pos) {
        if (this.no_tick)
            return;
        if (this.state < 2) {
            this.no_tick = true;
            return;
        }
        const d = this.pos - cur_pos;
        if (d < 0) {
            // console.assert(this.state != 2); // should not be red (w/o pending..)
            if (window.osc_port)
                window.osc_port.call('/flash');            
            console.log("traffic light überfahren :o");
            this.no_tick = true;
        } else if (this.state == 2 && d < this.trigger_dist) {
            this.trigger();
        }
    }
    demo() {
        setInterval(() => {
            this.state += 1;
            if (this.state > 2)
                this.state = 0;
            this.set_state(this.state);
        }, misc.rand(500,1000));   
    }

}

module.exports = {'SpeedObserver': SpeedObserver, 'TrafficLight': TrafficLight, 
                    'StopSign': StopSign, 'SpeedSign': SpeedSign};