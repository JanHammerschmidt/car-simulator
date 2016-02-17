'use strict';

var isNode = (typeof window == 'undefined'); // || this != window;
let THREE = isNode ? module.require('three') : window.THREE;

var Bezier = require('./lib/bezier.js');
let async = require("../bower_components/async/dist/async.js");

function load_json(file, callback) {
    if (isNode) {
        //jsonfile
        var json = module.require('../' + file);
        callback(json);
    } else {
        $.getJSON(file, callback);
    }
}

function rand(min, max) {
    return Math.random() * (max - min) + min
}

var Street = function(no_load_texture, lut_points_per_meter, street_width, segment_points_per_meter) {
    this.loaded = false;
    this.street_width = street_width || 20;
    this.lut_points_per_meter = lut_points_per_meter || 0.1;
    this.segment_points_per_meter = segment_points_per_meter || 0.1;
    this.segments = [];
    this._dists = [];


    if (!no_load_texture && Street.road_tex === undefined) {
        var road_tex = new THREE.TextureLoader().load('textures/road.jpg');
        road_tex.anisotropy = renderer.getMaxAnisotropy();
        road_tex.wrapT = THREE.RepeatWrapping;
        road_tex.repeat.set(1, 5);
        Street.road_tex = road_tex;
    }
}

function find_two_smallest_values(array) {
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
}

function distSq2d(p1, p2) {
    var dx = p2.x - p1.x,
        dy = p2.y - p1.y;
    return dx * dx + dy * dy;
}

Street.vec3toxy = function(vec3) {
    return {
        x: vec3.x,
        y: vec3.z
    };
}
Street.xytovec3 = function(v,y) {
    return new THREE.Vector3(v.x, y || 0.1, v.y);
}

Street.prototype = {

    // street_segment: function(lut) {
    // 	this.lut = lut
    // }

    find_two_nearest_points: function(segment, xy) {
        var lut = segment.lut;
        var dists = this._dists;
        dists.length = lut.length;
        for (var i = 0, len = lut.length; i < len; i++) {
            dists[i] = distSq2d(lut[i], xy);
        }
        return find_two_smallest_values(dists)
    },

    get_road_position2: function(vec3, stats) {
        var xy = new THREE.Vector2().copy(Street.vec3toxy(vec3)); // 2d point
        var dists = this.lut.map(function(l) {
            return distSq2d(xy, l)
        }); // distances of xy to each lut-point
        var nearest = find_two_smallest_values(dists);
        var i = nearest[0]; // get nearest point
        var p = this.lut[i];
        var d = p.d; // get derivative at this point
        var dp = d.dot(xy.clone().sub(p)); // before or after this point? (and how far?)
        if (!dp) // directly on the normal line of nearest point
            return p.t;
        var i2;
        if (dp > 0) { // behind point/normal
            if (i >= this.lut_points) // after end of street
                return 1;
            i2 = i + 1;
        } else {
            if (i <= 0) // before beginning of street
                return 0;
            i2 = i - 1;
        }
        var p2 = this.lut[i2];
        var dp2 = p2.d.dot(xy.clone().sub(p2));
        Math.sign(dp) == -Math.sign(dp2) || console.log("!! Math.sign(dp) != -Math.sign(dp2)");
        var v = dp > 0 ? dp / (dp - dp2) : (-dp / (dp2 - dp)); // get interpolation factor
        var t = (p.t * (1 - v) + p2.t * v); // linear interpolation between the two t-values
        stats.add('t2', t);
        return t;
        // dp = Math.abs(dp); dp2 = Math.abs(dp2);
    },

    create_street_geometry: function(segments, pathfunc) {
        var polygon = Array((segments + 1) * 2);
        var geo = new THREE.PlaneGeometry(3, segments, 1, segments); //width, height, widthSegments, heightSegments
        for (var i = 0; i <= segments; i++) {
            var p = pathfunc(i / segments);
            geo.vertices[i * 2].set(p[0].x, 0.1, p[0].y);
            geo.vertices[i * 2 + 1].set(p[1].x, 0.1, p[1].y);
            polygon[i] = [p[0].x, p[0].y];
            polygon[polygon.length - i - 1] = [p[1].x, p[1].y];
        }
        //street_polygons.push(polygon);
        return {
            geo: geo,
            poly: polygon
        };
    },

    add_street_segment: function(curve) {

        var street_width = this.street_width;
        const segment_points = Math.round(this.segment_points_per_meter * curve.length());

        var geo = this.create_street_geometry(segment_points, function(t) {
            return [curve.offset(t, 0.5 * street_width), curve.offset(t, -0.5 * street_width)];
        });

        var street = {};
        street.segment_points = segment_points;
        street.geometry = geo.geo;
        street.poly = geo.poly;
        street.lut_points = Math.round(this.lut_points_per_meter * curve.length());
        street.lut = curve.getLUT(street.lut_points);
        street.road_length = curve.length();
        street.curve = curve;

        //this.segments.push(street);

        //scene.add(street);
        return street;
    },

    create_road: function(callback) {
        var that = this;
        async.series([

            function(next) {
                if (false) { //eslint-disable-line no-constant-condition
                    var origin = new THREE.Vector2(0, 0);
                    var p = new THREE.Vector2(0, 0); // current point
                    var t = new THREE.Vector2(0, 1); // current tangent
                    for (var i = 0; i < 3; i++) {
                        var dev = 0;
                        var p_deviation = rand(-dev * Math.PI, dev * Math.PI); // deviation from current tangent (0.25)
                        var distance = rand(80, 100); //distance from current point
                        var a2_deviation = rand(-dev * Math.PI, dev * Math.PI); // deviation of second (remote) bezier point from straight line
                        var a1_length = rand(10, 0.5 * distance),
                            a2_length = (10, 0.5 * distance); // distances of bezier points from main points
                        var p2 = p.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation), distance);
                        var segment = new Bezier(
                            p,
                            p.clone().addScaledVector(t, a1_length),
                            p2.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation + Math.PI + a2_deviation), a2_length),
                            p2);
                        t.copy(segment.derivative(1)).normalize();
                        p.copy(p2);
                        this.segments.push(segment);
                        next();
                        //this.add_street_segment(segment);
                        //      var segments = that.segments;
                        //      segments[0].accumulated_road_length = 0;
                        //      for (var i = 1; i < segments.length; i++) {
                        // segments[i].accumulated_road_length = segments[i-1].accumulated_road_length + segments[i-1].road_length;
                        //      }
                        //      var segment_points = that.segment_points;
                    }
                } else {
                    load_json('track.study1.json', function(track) {
                        var cfg = {
                            ver2: true,
                            deviation_mult: 5.4,
                            distance_mult: 0.1,
                            scale: 1000.0
                        };
                        var scale = cfg.scale;
                        var origin = new THREE.Vector2(0, 0);
                        var p = new THREE.Vector2(0, 0);
                        var t = new THREE.Vector2(0, 1); // tangent
                        var first = true,
                            prev = null;
                        var cur_percent = 0;
                        var signs = track.signs;

                        function do_bezier(p_deviation, distance) {
                            var a2_deviation = p_deviation;
                            var a1_length = 0.4 * distance,
                                a2_length = 0.4 * distance;
                            var p2 = p.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation), distance);
                            var segment = new Bezier(
                                p,
                                p.clone().addScaledVector(t, a1_length),
                                p2.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation + Math.PI + a2_deviation), a2_length),
                                p2);
                            that.segments.push(segment);
                            //that.add_street_segment(segment);
                            t.copy(segment.derivative(1)).normalize();
                            p.copy(p2);
                            return segment.length();
                        }

                        function proc_sign(sign) {
                            var p_deviation = (sign.type == 13 ? -0.2 : 0.2) * sign.intensity * sign.duration * cfg.deviation_mult;
                            var distance = (sign.duration) * scale * cfg.distance_mult;
                            return do_bezier(p_deviation, distance) / scale;
                        }

                        function proc_prev_sign(prev, cur_percent) {
                            var p_deviation = (prev.type == 13 ? -0.2 : 0.2) * Math.PI;
                            var distance = (cur_percent - prev.percent) * scale;
                            do_bezier(p_deviation, distance);
                        }
                        for (var i = 0; i < signs.length; i++) {
                            var sign = signs[i];
                            if (sign.type >= 13) {
                                if (cfg.ver2) {
                                    // var p0 = p.clone();
                                    var percent1 = (sign.percent - cur_percent);
                                    if (percent1 > 0) {
                                        do_bezier(0, percent1 * scale);
                                    }
                                    cur_percent += Math.max(percent1, 0) + proc_sign(sign);
                                } else {
                                    if (first) {
                                        do_bezier(0, sign.percent * scale);
                                        first = false;
                                    } else {
                                        proc_prev_sign(prev, sign.percent);
                                    }
                                    prev = sign;
                                }
                            }
                        }
                        if (cfg.ver2) {
                            if (cur_percent < 1) {
                                do_bezier(0, (1 - cur_percent) * scale);
                            }
                        } else
                            proc_prev_sign(prev, 1);
                        next();

                        //      var segments = that.segments;
                        //       segments[0].accumulated_road_length = 0;
                        //      for (var i = 1; i < segments.length; i++) {
                        // segments[i].accumulated_road_length = segments[i-1].accumulated_road_length + segments[i-1].road_length;
                        //      }
                        //      var segment_points = that.segment_points;

                    }); // getJSON
                }
            },
            function(next) {
                that.segments = that.segments.map(function(v) {
                    return that.add_street_segment(v);
                });
                that.poly_bezier = new Bezier.PolyBezier(that.segments.map(function(v) {
                    return v.curve
                }));
                that.poly_bezier.cacheLengths();
                that.segments[0].accumulated_road_length = 0;
                for (var i = 1; i < that.segments.length; i++)
                    that.segments[i].accumulated_road_length = that.poly_bezier.acc_lengths[i - 1];
                next();
            },
            function(next) {
                load_json('track.study1.json', function(track) {
                    var segments = that.segments;
                    var ps = track.points; //$.extend(true, [], track.points);
                    var scale_x = that.poly_bezier.total_length / track.points[track.points.length - 1].x;
                    for (let i = 0; i < ps.length; i++) {
                        ps[i].x *= scale_x;
                        ps[i].y = (ps[i].y - 82) * 1.3; // <-- y scale <-- 0.3
                    }
                    var tpb = new Bezier.PolyBezier(); // track height profile's poly bezier
                    for (let i = 0; i < ps.length - 2; i += 3) {
                        tpb.addCurve(new Bezier(ps[i], ps[i + 1], ps[i + 2], ps[i + 3]));
                    }
                    tpb.cacheLengths();

                    var pb = that.poly_bezier;
                    var t0 = 0;
                    segments.forEach(function(s, i) {
                        var pi = pb.parts[i];
                        var vertices = s.geometry.vertices;
                        var segment_points = s.segment_points;
                        for (var j = 0; j <= segment_points; j++) {
                            var t = t0 + j / segment_points * pi;
                            var y = tpb.get(t).y
                            vertices[j * 2].y = vertices[j * 2 + 1].y = y;
                        }
                        var lut_points = s.lut_points;
                        s.lut.forEach(function(l, i) {
                            var t = i / lut_points;
                            l.height = tpb.get(t0 + i / lut_points * pi).y; // TODO: do we really need that?
                            l.normal = s.curve.normal(t);
                        });
                        s.geometry.verticesNeedUpdate = true;
                        t0 = pb.bounds[i];
                    });
                    that.height_profile = tpb;
                    var lut_points = Math.round(that.lut_points_per_meter * that.poly_bezier.total_length);
                    that.lut = [];
                    for (var i = 0; i <= lut_points; i++) {
                        var t = i / lut_points;
                        var p = that.poly_bezier.get(t);
                        p.normal = that.poly_bezier.normal(t);
                        p.d = new THREE.Vector2().copy(that.poly_bezier.derivative(t)).normalize();
                        p.t = t;
                        that.lut.push(p);
                    }
                    that.lut_points = lut_points;

                    next();
                });
            },
            function(next) {
                if (!isNode) {
                    let mat = new THREE.MeshBasicMaterial({
                        map: Street.road_tex,
                        color: 0x5d5d88,
                        side: THREE.DoubleSide,
                        wireframe: false
                    });                    
                    that.street_mesh = new THREE.Object3D();
                    that.segments.forEach(function(v) {
                        v.geometry.computeBoundingSphere();
                        v.geometry.boundingSphere.radius *= 1.1;
                        v.mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(v.geometry), mat);
                        //v.material = v.mesh.material;
                        // v.mesh = new THREE.Mesh(v.geometry, mat);
                        that.street_mesh.add(v.mesh);
                    });
                    scene.add(that.street_mesh);
                }
                that.loaded = true;
                next();
            }
        ], callback);
    }, // create_road
    show_lut_points: function() {
        const sphere = new THREE.SphereGeometry(0.3);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00
        });
        this.segments.forEach(v => {
            v.lut.forEach(l => {
                var mesh = new THREE.Mesh(sphere, material);
                mesh.position.set(l.x, l.height, l.y);
                this.street_mesh.add(mesh);
            })
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Street;
} else {
    this.Street = Street;
}