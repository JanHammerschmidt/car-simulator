'use strict';


class TrafficLight extends THREE.Object3D {
    constructor() {
        super();
        this.model = TrafficLight._model.clone();
        this.colors = ['green','yellow','red'].map(c => this.model.children.find(o => o.name == c).children[1].material);
        this.model.children.find(o => o.name == 'case').children[1].material.side = THREE.DoubleSide;
        this.lights_on = [0x49e411, 0xd2c100, 0x960101];
        this.lights_off = [0x142d0b, 0x262300, 0x1f0000];
        this.state = 0;
        this.add(this.model);
    }
    static load_model() {
        return new Promise(resolve => {
            const loader = new THREE.OBJMTLLoader();
            loader.load("models/traffic_lights/traffic_lights.obj", "models/traffic_lights/traffic_lights.mtl", obj => {
                obj.scale.multiplyScalar(24);
                obj.position.y = -1.9;
                obj.rotateY(Math.PI/2);
                TrafficLight._model = obj;
                resolve(obj);
            });
        });
    }
    set_state(state) {
        const lights_off = this.lights_off;
        this.colors.forEach(function(c,i) {
            c.color.setHex(lights_off[i]);
            // c.emissive.setHex(lights_off[i]);
        });
        this.colors[state].color.setHex(this.lights_on[state]);
        // this.colors[state].emissive.setHex(this.lights_on[state]);
        this.state = state;
    }
}

module.exports = {'TrafficLight': TrafficLight};

// class TrafficLight extends THREE.Object3D {
//     constructor() {
//         super();
//         const model = TrafficLight._model.clone();
//         const lights = model.children[1];
//         this.colors = lights.children.slice(1).map(function(v) {return v.material.color;}); // green, yellow, red
//         this.lights_on = [0x49e411, 0xd2c100, 0x960101];
//         this.lights_off = [0x142d0b, 0x262300, 0x1f0000];
//         this.state = 0;
//         this.add(model);            
//     }

//     set(state) {
//         var lights_off = this.lights_off;
//         this.colors.forEach(function(c,i) {
//             c.setHex(lights_off[i]);
//         });
//         this.colors[state].setHex(this.lights_on[state]);
//         this.state = state;
//     }

//     static load_model() {
//         TrafficLight.loaded = new Promise(resolve => {
//             load_model_obj('models/traffic_lights.obj', obj => {
//                 obj.rotateY(Math.PI);
//                 obj.scale.multiplyScalar(1.2);
//                 obj.position.y = -0.1;
//                 TrafficLight._model = obj;
//                 resolve(obj);
//             });
//         });
//     }
// }