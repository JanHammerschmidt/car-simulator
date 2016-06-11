'use strict';

const misc = {
    
    rand: function(min, max) {
        return Math.random() * (max - min) + min;
    },

    find_two_smallest_values: function(array) {
        console.assert(array.length >= 2);
        var first = Number.MAX_VALUE;
        var second = Number.MAX_VALUE;
        var ifirst = 0,
            isecond = 0;
        for (var i = 0, len = array.length; i < len; i++) {
            var d = array[i];
            if (d < first) {
                second = first;
                isecond = ifirst;
                first = d;
                ifirst = i;
            } else if (d < second) {
                second = d;
                isecond = i;
            }
        }
        return [ifirst, isecond, first, second];
    },

    nearest_point: function (p, a) {
        // p: point, a: array of points
        let min_d = Number.MAX_VALUE,
            idx = 0;
        for (let i = 0; i < a.length; i++) {
            const d = misc.distSq2d(p, a[i]);
            if (d < min_d) {
                min_d = d;
                idx = i;
            }
        }
        return [idx, min_d, a[idx]];
    },

    distSq2d: function(p1, p2) {
        var dx = p2.x - p1.x,
            dy = p2.y - p1.y;
        return dx * dx + dy * dy;
    },

    sqr: function(x) { return x*x; },

    rotx: function(p, r) { return p.x*Math.cos(r) + p.y*Math.sin(r); },
    roty: function(p, r) { return p.y*Math.cos(r) - p.x*Math.sin(r); },
    rotxy: function(p, r) {return { x:misc.rotx(p, r), y:misc.roty(p, r)}; },

    delay: function(ms) { return new Promise(r => setTimeout(r, ms)); },

    // load_model_obj: function(fname) {
        
    //     const loader = new THREE.OBJMTLLoader();
    //     return new Promise(r => {
    //         loader.load(fname, fname.slice(0,-3) + "mtl", r, undefined, err => { 
    //             console.log("error loading", fname, err);
    //         });
    //     });
    // },
    
    // load_obj_mtl2: function(path, obj, mtl) {
    //     return new Promise(resolve => {
    //         misc.plog("1 "+path);
    //         const mtlLoader = new THREE.MTLLoader();
    //         mtlLoader.setPath(path);
    //         mtlLoader.load(mtl, materials => {
    //             misc.plog("2 "+path);
    //             materials.preload();
    //             misc.plog("3 "+path);
    //             const objLoader = new THREE.OBJLoader();
    //             objLoader.setMaterials(materials);
    //             objLoader.setPath(path);
    //             objLoader.load(obj, object => {
    //                 misc.plog("4 "+path);
    //                 resolve(object);
    //             });
    //         });
    //     });
    // },
    
    load_obj_mtl: function(model) {
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.setTexturePath(model.path);
        const materials = mtlLoader.parse(model.mtl);
        materials.preload();
        const objLoader = new THREE.OBJLoader();
        objLoader.setMaterials(materials);
        const obj = objLoader.parse(model.obj);
        return obj;
    },    
    
    init_perf: function() { misc.perf_t0 = window.performance.now(); },
    plog: function(s) {
        //console.log(((window.performance.now()-misc.perf_t0)/1000).toPrecision(4), s);
    }
    
}

module.exports = misc;