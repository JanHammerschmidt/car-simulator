'use strict';

var isNode = (typeof window == 'undefined'); // || this != window;
let THREE = isNode ? module.require('three') : window.THREE;
const nearest_point = require("./misc.js").nearest_point;

var Terrain = function() {
    this.width = 2000;
    this.height = 2000;
    this.widthSegments = 300;
    this.heightSegments = 300;
    this.geometry = new THREE.PlaneGeometry(this.width, this.height, this.widthSegments, this.heightSegments);
    this._x0 = -this.width / 2;
    this._y0 = this.height / 2
};

Terrain.prototype = {
    create_mesh: function() {
        var tex_loader = new THREE.TextureLoader();
        var grass_tex = tex_loader.load('textures/grass.png');
        grass_tex.anisotropy = renderer.getMaxAnisotropy();
        grass_tex.wrapT = THREE.RepeatWrapping;
        grass_tex.wrapS = THREE.RepeatWrapping;
        grass_tex.repeat.set(50, 50);

        this.mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(this.geometry),
            new THREE.MeshBasicMaterial({
                map: grass_tex,
                color: 0xE8FF17,
                wireframe: false,
                side: THREE.DoubleSide
            }));

        //this.mesh.rotation.x = -90 * Math.PI / 180;
        return this.mesh;
    },
    vertices: function() {
        return this.geometry.vertices; //.map(function(v){return v.;});
    },
    p2height: function(p) { // based on bilinear interpolation
        // works only after rotation (works on y-values)
        const v = this.vertices();
        // if (!this.zvalues)
        //     return 0;
        var dx = (p.x - this._x0) * this.widthSegments / this.width;
        var dy = (this._y0 - p.y) * this.heightSegments / this.height;
        const x = Math.floor(dx);
        dx -= x;
        const y = Math.floor(dy);
        dy -= y;
        // const z = this.zvalues;
        const w1 = this.widthSegments + 1;
        if (x + (y + 1) * w1 >= v.length || x + y * w1 < 0)
            return 0;
        return v[x + y * w1].y * (1 - dx) * (1 - dy) + v[x + 1 + y * w1].y * dx * (1 - dy) +
            v[x + (y + 1) * w1].y * (1 - dx) * dy + v[x + 1 + (y + 1) * w1].y * dx * dy;
    },
    adjust_height: function(no_adjustment, callback) {
        if (no_adjustment) {
            callback && callback();
            return;
        }
        var that = this;
        $.getJSON('terrain.json', function(obj) {
            console.assert(obj.length == that.vertices().length);
            var zvalues = obj;
            that.zvalues = zvalues;

            that.vertices().forEach(function(p, i) {
                p.z = zvalues[i];
                // if (i%333 == 0) {
                // 	console.log(i,p2i(p),(1000-p.y)*that.heightSegments/that.height);
                // }
            });
            that.geometry.verticesNeedUpdate = true;
            callback && callback();
        });
    },
    rotate: function() {
        this.vertices().forEach(function(v) {
            v.set(v.x, v.z, v.y);
        });
        this.geometry.verticesNeedUpdate = true;
    },
    smooth: function(size, wf, min_weight, lut_points, min_dist2) {
        // should be called *after* rotation!
        // size: maximum distance to center point, 
        // wf: weight function (gets squared distance as input)
        // min_weight: minimum weight for point to be considered in mask

        const w1 = this.widthSegments + 1;
        const sx = Math.pow(this.width / this.widthSegments, 2);
        const sy = Math.pow(this.height / this.heightSegments, 2);
        
        // create mask
        const mask = [], weight = [];
        for (let y = -size; y <= size; y++) {
            for (let x = -size; x <= size; x++) {
                const d2 = x*x*sx + y*y*sy;
                const w = wf(d2);
                if (w >= min_weight) {
                    mask.push(y*w1+x);
                    weight.push(w);
                }
            }
        }
        const v = this.vertices();
        const h = [];
        for (let i = 0; i < v.length; i++) {
            // debugger;
            if (nearest_point({x:v[i].x, y:v[i].z}, lut_points)[1] < min_dist2) {
                h.push(v[i].y);
                // h.push(-20);
                continue;
            }
            let z = 0, w = 0;
            for (let j = 0; j < mask.length; j++) {
                const k = i+mask[j];
                if (k >= 0 && k < v.length) {
                    w += weight[j];
                    z += v[k].y * weight[j];
                }
            }
            h.push(z/w);
        }
        //apply to vertices
        for (let i = 0; i < v.length; i++)
            v[i].y = h[i];
        this.geometry.verticesNeedUpdate = true;
    }
};

module.exports = Terrain;