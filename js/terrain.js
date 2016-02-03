//var THREE = THREE || require('three');
var Street = require('./street.js');

var Terrain = function() {
	this.width = 2000;
	this.height = 2000;
	this.widthSegments = 300;
	this.heightSegments = 300;
	this.geometry = new THREE.PlaneGeometry(this.width, this.height, this.widthSegments, this.heightSegments);
	this._x0 = -this.width/2;
	this._y0 = this.height/2
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
                wireframe: false
                , side:THREE.DoubleSide
        }));

	    //this.mesh.rotation.x = -90 * Math.PI / 180;
	    return this.mesh;
	},
	vertices: function() {
		return this.geometry.vertices; //.map(function(v){return v.;});
	},
	p2height: function(p) {
		const that = this;
		var dx = (p.x-that._x0)*that.widthSegments/that.width;
		var dy = (that._y0-p.y)*that.heightSegments/that.height;
		const x = Math.floor(dx); dx -= x;
		const y = Math.floor(dy); dy -= y;
		const z = that.zvalues;
		const w1 = that.widthSegments+1;
		return z[x+y*w1]*(1-dx)*(1-dy) + z[x+1+y*w1]*dx*(1-dy) + 
				z[x+(y+1)*w1]*(1-dx)*dy + z[x+1+(y+1)*w1]*dx*dy;
	},
	adjust_height: function(callback) {
		var that = this;
		$.getJSON('terrain.json', function(obj) {
			console.assert(obj.length == that.vertices().length);
			var zvalues = obj;
			that.zvalues = zvalues;
			function p2index(p) {
				var x = Math.round((p.x-that._x0)*that.widthSegments/that.width);
				var y = Math.round((that._y0-p.y)*that.heightSegments/that.height);
				return x + y * (that.widthSegments + 1);
			}
			that.vertices().forEach(function(p,i) {
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
			v.set(v.x,v.z,v.y);
		});
		this.geometry.verticesNeedUpdate = true;
	}
};


module.exports = Terrain;