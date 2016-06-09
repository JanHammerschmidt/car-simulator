'use strict';

const misc = require("./misc.js");
const delay = misc.delay;
const models = require('./webpack/static.js').models;


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
        //debugger;
        this.colors = ['green','yellow','red'].map(c => this.model.children.find(o => o.name == c).material);
        this.model.children.find(o => o.name == 'case').material.side = THREE.DoubleSide;
        this.lights_on = [0x49e411, 0xd2c100, 0x960101];
        this.lights_off = [0x142d0b, 0x262300, 0x1f0000];
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
        TrafficLight._model = obj;
        misc.plog("traffic light model loaded");
    }
    set_state(state) {
        //console.log("traffic light state", state);
        const lights_off = this.lights_off;
        this.colors.forEach(function(c,i) {
            c.color.setHex(lights_off[i]);
            // c.emissive.setHex(lights_off[i]);
        });
        this.colors[state].color.setHex(this.lights_on[state]);
        // this.colors[state].emissive.setHex(this.lights_on[state]);
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
        },500);        
    }

}

module.exports = {'TrafficLight': TrafficLight, 'StopSign': StopSign};