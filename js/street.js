'use strict';

var isNode = (typeof window == 'undefined'); // || this != window;
let THREE = isNode ? module.require('three') : window.THREE;

var Bezier = require('./lib/bezier.js');
// let async = require("../bower_components/async/dist/async.js");
let misc = require("./misc.js");
let rand = misc.rand;

function load_track() {
    if (isNode) {
        return module.require('../track.panning-study.json');
    } else {
        return require('./webpack/static.js').track_study_1;
    }
}

class Street extends THREE.Object3D {
    constructor(no_load_texture, lut_points_per_meter, street_width, segment_points_per_meter) {
        super();
        // this.loaded = false;
        this.street_width = street_width || 8;
        this.lut_points_per_meter = lut_points_per_meter || 0.1;
        this.segment_points_per_meter = segment_points_per_meter || 0.1;
        this.segments = [];
        this._dists = [];
        this.height_profile = new Bezier({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 });
        this.height_profile.total_length = 3;
        this.starting_point = new THREE.Vector2(0, -900);
        this.starting_tangent = new THREE.Vector2(0, 1);
        this.initial_height = 0.1;
        this.max_deviation_random_street = 0.25;

        if (!no_load_texture && Street.road_tex === undefined) {
            var road_tex = new THREE.TextureLoader().load('textures/road.jpg');
            if (window.cfg.hq_street)
                road_tex.anisotropy = renderer.getMaxAnisotropy();
            road_tex.wrapT = THREE.RepeatWrapping;
            road_tex.repeat.set(1, 5);
            Street.road_tex = road_tex;
        }
    }

    vec3toxy(vec3) { return new THREE.Vector2(vec3.x, vec3.z) }

    xytovec3(v, y) { return new THREE.Vector3(v.x, y || 0, v.y); }

    get_road_position(xy) {
        // var xy = new THREE.Vector2().copy(this.vec3toxy(vec3)); // 2d point
        var dists = this.lut.map(function(l) {
            return misc.distSq2d(xy, l)
        }); // distances of xy to each lut-point
        var nearest = misc.find_two_smallest_values(dists);
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
        return t;
        // dp = Math.abs(dp); dp2 = Math.abs(dp2);
    }

    create_segment_geometry(segments, pathfunc) {
        var polygon = Array((segments + 1) * 2);
        var geo = new THREE.PlaneGeometry(3, segments, 1, segments); //width, height, widthSegments, heightSegments
        for (var i = 0; i <= segments; i++) {
            var p = pathfunc(i / segments);
            geo.vertices[i * 2].set(p[0].x, this.initial_height, p[0].y);
            geo.vertices[i * 2 + 1].set(p[1].x, this.initial_height, p[1].y);
            polygon[i] = [p[0].x, p[0].y];
            polygon[polygon.length - i - 1] = [p[1].x, p[1].y];
        }
        //street_polygons.push(polygon);
        return {
            geo: geo,
            poly: polygon
        };
    }

    add_street_segment(curve) {

        var street_width = this.street_width;
        const segment_points = Math.round(this.segment_points_per_meter * curve.length());

        var geo = this.create_segment_geometry(segment_points, function(t) {
            return [curve.offset(t, 0.5 * street_width), curve.offset(t, -0.5 * street_width)];
        });

        var street = {};
        street.segment_points = segment_points;
        street.geometry = geo.geo;
        street.poly = geo.poly;
        // street.lut_points = Math.round(this.lut_points_per_meter * curve.length());
        // street.lut = curve.getLUT(street.lut_points);
        street.road_length = curve.length();
        street.curve = curve;

        //this.segments.push(street);

        //scene.add(street);
        return street;
    }

    create_random_segments(n) {
        var origin = new THREE.Vector2(0, 0);
        var p = this.starting_point; // current/starting point
        var t = this.starting_tangent; // current tangent
        for (var i = 0; i < n; i++) {
            const dev = this.max_deviation_random_street;
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
        }
    }

    create_segments_from_json() {
        const track = load_track();
        var cfg = {
            ver2: true,
            deviation_mult: 4.0, //4.0, //3.0, // max. ~5.4
            distance_mult: 0.07, //0.07, // 0.1
            scale: 1500.0
        };
        var scale = cfg.scale;
        var origin = new THREE.Vector2(0, 0);
        var p = new THREE.Vector2(...track.starting_point); // current/starting point
        var t = new THREE.Vector2(0, 1); // tangent
        var first = true,
            prev = null;
        var cur_percent = 0;
        var signs = track.signs;

        const do_bezier = (p_deviation, distance) => {
            var a2_deviation = p_deviation;
            var a1_length = 0.4 * distance,
                a2_length = 0.4 * distance;
            var p2 = p.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation), distance);
            var segment = new Bezier(
                p,
                p.clone().addScaledVector(t, a1_length),
                p2.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation + Math.PI + a2_deviation), a2_length),
                p2);
            this.segments.push(segment);
            //this.add_street_segment(segment);
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
    }

    adjust_height_from_terrain(terrain) {
        // for (let i = 0; i < this.segments.length; i++) {
        for (let s of this.segments) {
            // const s = this.segments[i];
            // const p = this.poly_bezier.parts[i];
            for (let v of s.geometry.vertices) {
                v.y = terrain.p2height({ x: v.x, y: v.z });
            }
            s.geometry.verticesNeedUpdate = true;
        }
    }

    // applies height from another street to this street (for overlapping parts)
    adjust_height_from_street(street, height_diff, distance) {
        distance = distance || 0.1; // minimum distance between this street and the other one
        const street_width_2 = street.street_width*street.street_width;
        for (let s of this.segments) {
            for (let v of s.geometry.vertices) {
                const xy = new THREE.Vector2(v.x, v.z);
                const t = street.get_road_position(xy);
                if (misc.distSq2d(xy, street.poly_bezier.get(t)) > street_width_2)
                    continue;
                v.y = street.height_profile.get(t).y - height_diff + distance;
            }
            s.geometry.verticesNeedUpdate = true;
        }
    }

    apply_height_from_json() {
        const track = load_track();
        var segments = this.segments;
        var ps = track.points; //$.extend(true, [], track.points);
        var scale_x = this.poly_bezier.total_length / track.points[track.points.length - 1].x;
        for (let i = 0; i < ps.length; i++) {
            ps[i].x *= scale_x;
            ps[i].y = (ps[i].y - track.street_height_offset) * track.street_height_mult; // <-- y scale <-- 0.3 (testweise vllt auch 1.3)
        }
        var tpb = new Bezier.PolyBezier(); // track height profile's poly bezier
        for (let i = 0; i < ps.length - 2; i += 3) {
            tpb.addCurve(new Bezier(ps[i], ps[i + 1], ps[i + 2], ps[i + 3]));
        }
        tpb.cacheLengths();

        var pb = this.poly_bezier;
        var t0 = 0;
        segments.forEach(function (s, i) {
            var pi = pb.parts[i];
            var vertices = s.geometry.vertices;
            var segment_points = s.segment_points;
            for (var j = 0; j <= segment_points; j++) {
                var t = t0 + j / segment_points * pi;
                var y = tpb.get(t).y
                vertices[j * 2].y = vertices[j * 2 + 1].y = y;
            }
            s.geometry.verticesNeedUpdate = true;
            t0 = pb.bounds[i];
        });
        this.height_profile = tpb;
    }

    calculate_lut_points() {
        let lut_points = Math.round(this.lut_points_per_meter * this.poly_bezier.total_length);
        this.lut = [];
        for (var i = 0; i <= lut_points; i++) {
            var t = i / lut_points;
            var p = this.poly_bezier.get(t);
            p.normal = this.poly_bezier.normal(t);
            p.d = new THREE.Vector2().copy(this.poly_bezier.derivative(t)).normalize();
            p.t = t;
            p.height = this.height_profile.get(t).y
            this.lut.push(p);
        }
        this.lut_points = lut_points;
    }

    create_geometry() {
        this.segments = this.segments.map(v => {
            return this.add_street_segment(v);
        });
        this.poly_bezier = new Bezier.PolyBezier(this.segments.map(v => v.curve));
        this.poly_bezier.cacheLengths();
    }

    create_mesh() {
        let mat = new THREE.MeshBasicMaterial({
            map: Street.road_tex,
            color: 0x5d5d88,
            side: THREE.DoubleSide,
            wireframe: false
        });
        this.segments.forEach(v => {
            v.geometry.computeBoundingSphere();
            v.geometry.boundingSphere.radius *= 1.1;
            v.mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(v.geometry), mat);
            //v.mesh = new THREE.Mesh(v.geometry, mat);
            //v.material = v.mesh.material;
            this.add(v.mesh);
        });
    }

    create_road(random, terrain, no_create_mesh) {
        if (random)
            this.create_random_segments(random);
        else
            this.create_segments_from_json();
        this.create_geometry();
        if (random && terrain)
            this.adjust_height_from_terrain(terrain);
        if (!random)
            this.apply_height_from_json();
        this.calculate_lut_points();
        if (!isNode && !no_create_mesh) {
            this.create_mesh();
        }
        // this.loaded = true;
        if (!isNode)
            misc.plog("street loaded");
    }

    show_lut_points() {
        const sphere = new THREE.SphereGeometry(0.3);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00
        });
        for (let l of this.lut) {
            let mesh = new THREE.Mesh(sphere, material);
            mesh.position.set(l.x, l.height, l.y);
            this.add(mesh);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Street;
} else {
    this.Street = Street;
}