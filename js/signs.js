'use strict';

const misc = require("./misc.js");
const delay = misc.delay;
const models = require('./webpack/static.js').models;

const TOO_FAST_TOLERANCE = 0.1;
const TOO_FAST_TOLERANCE_OFFSET = 10;
const COOLDOWN_TIME_SPEEDING = 1000;

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
        SpeedSign.next_sign_i = 0;
        SpeedSign.current_speed_limit = 999;
        SpeedSign.cooldown_timer_start = new Date();
    }
    static set_next_sign() { // based on next_sign_i (and update current_sign based on next_sign)
        const signs = SpeedSign.signs;
        const i = SpeedSign.next_sign_i;
        SpeedSign.current_sign = SpeedSign.next_sign;
        SpeedSign.next_sign = i >= signs.length ? null : signs[i];
        if (SpeedSign.next_sign)
            SpeedSign.trigger_dist = SpeedSign.current_sign && 
                                     SpeedSign.next_sign.speed_limit > SpeedSign.current_sign.speed_limit ? 30 : -30;
    }
    static tick(cur_pos, kmh) {
        if (SpeedSign.next_sign) {
            const d = SpeedSign.next_sign.pos - cur_pos;
            if (d < SpeedSign.trigger_dist) {
                console.log("speed limit: " + SpeedSign.next_sign.speed_limit + " kmh");
                SpeedSign.current_speed_limit = SpeedSign.next_sign.speed_limit * (1+TOO_FAST_TOLERANCE) + TOO_FAST_TOLERANCE_OFFSET; // apply speed limit from next sign
                SpeedSign.next_sign_i++;
                SpeedSign.set_next_sign();
            }
        }
        if (kmh > SpeedSign.current_speed_limit && (new Date() - SpeedSign.cooldown_timer_start) > COOLDOWN_TIME_SPEEDING) {
            console.log('speeding violation ('+kmh.toPrecision(3)+' kmh instead of '+SpeedSign.current_sign.speed_limit+' kmh');
            SpeedSign.cooldown_timer_start = new Date();
        }
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
        //const plh = new THREE.PointLightHelper(this.light, 0.05);
        //scene.add(plh);
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

module.exports = {'TrafficLight': TrafficLight, 'StopSign': StopSign, 'SpeedSign': SpeedSign};