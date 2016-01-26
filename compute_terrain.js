var fs = require('fs');
var jsonfile = require('jsonfile');
var Street = require('./js/street.js');
var Terrain = require('./js/terrain.js');


function rbf(x) {
	x *= 0.1;
	return 1/Math.sqrt(1+x*x);
}

function distSq2d(p1,p2) {
    var dx = p2.x - p1.x,
        dy = p2.y - p1.y;
    return dx * dx + dy * dy;
}

var street = new Street(true);
street.create_road(function() {
    console.log('done loading');
    var segments = street.segments;
    var points = street.segments.reduce(function(p,s) {return p.concat(s.lut);},[]);
    // console.log(points);

    var tpoints = new Terrain().vertices();
    zvalues = tpoints.map(function(p) {
    	var n = 0; //nominator
    	var d = 0; // denominator
    	var n2 = 0, d2 = 0;
    	// if (p.x == 0 && p.y == 0)
    	// 	debugger;
    	var nearest_distance = Number.MAX_VALUE;
    	var nearest_height = 0;
    	points.forEach(function(v,i){
    		var distsq = distSq2d(p,v);
    		if (distsq < nearest_distance) {
    			nearest_distance = distsq;
    			nearest_height = v.height;
    		}
    		var w2 = 1/(1+distsq); // pretty good: already smooth, but quite a difference between street & terrain
    		var w = Math.exp(-distsq * 0.1); // good, but needs a smoothing postprocessing step..
    		// if (p.x == 0 && p.y == 0)
    		// 	console.log(w);
    		n += v.height * w;
    		d += w;
    		n2 += v.height * w2;
    		d2 += w2;
    	});
    	//p.z = n/d;
    	//return nearest_height;
    	if (isNaN(n2/d2))
    		console.log("isNaN(n2/d2)");
    	return isNaN(n/d) ? n2/d2 : (n/d);
    });
    jsonfile.writeFileSync('terrain.json', zvalues);

    // segments.slice(1).forEach()
    // street.segments
    // debugger;
    // console.log(street.segments);
});

//var wstream = fs.createWriteStream()