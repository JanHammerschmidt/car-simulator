dat.GUI.prototype.clearFolders = function() {
  for (let f of Object.values(this.__folders)) {
    f.close();
    this.__ul.removeChild(f.domElement.parentNode);
  }
  this.__folders = {};
  this.onResize();
}

$(function() {
  var canvas = document.getElementById('tutorial');
  if (canvas.getContext){
    var cfg = {ver2: true, deviation_mult: 4.0, distance_mult: 0.07, scale: 1.0, 
      draw_height: false, scale_x: 0.1, scale_y: 0.5, draw_signs: false, t: 1, y:0.01};
    var c = canvas.getContext('2d');
    var bezier_draw = bindDrawFunctions(c); // eslint-disable-line

    var gui = new dat.GUI();
    // gui.add(cfg, 'ver2');
    gui.add(cfg, 'deviation_mult', 0.5, 7);
    gui.add(cfg, 'distance_mult', 0.01, 0.2);
    gui.add(cfg, 'scale', 0.4, 1.5);
    // gui.add(cfg, 'draw_height');
    // gui.add(cfg, 'scale_x', 0.08,1.2);
    // gui.add(cfg, 'scale_y');
    // gui.add(cfg, 'draw_signs');
    // gui.add(cfg, 't',0,1);
    // gui.add(cfg, 'y').listen();

    function load_track() { // eslint-disable-line

      $.getJSON('track.panning-study.json', function(track) {

        gui.clearFolders();
        
        function draw() {

          const track_length = track.points[track.points.length-1].x;
          for (let s of track.signs) {
            if ('no_percent_present' in s || !('percent' in s)) {
              s.percent = s.at_length / track_length;
              s.no_percent_present = true;
            }
          }          

          c.clearRect(0,0,canvas.width,canvas.height);
          
          if (cfg.draw_height) {
            var ps = $.extend(true, [], track.points);
            for (var i = 0; i < ps.length; i++) {
                ps[i].x *= cfg.scale_x;
                ps[i].y = canvas.height - (ps[i].y-90) * cfg.scale_y;
            }
            var pb = new Bezier.PolyBezier();
            for (let i = 0; i < ps.length-2; i += 3) {
              var b = new Bezier(ps[i],ps[i+1],ps[i+2],ps[i+3]);
              pb.addCurve(b);
              bezier_draw.drawCurve(b);
              // bezier_draw.drawSkeleton(b);
            }
            if (cfg.draw_signs) {
              for (let i = 0; i < track.signs.length; i++) {
                var s = track.signs[i];
                var p = new THREE.Vector2(s.point.x, s.point.y);
                p.x *= cfg.scale_x;
                p.y *= cfg.scale_y;
                bezier_draw.drawCircle(p, 3,{x:0,y:0.8*canvas.height});
              }
            } else {
              pb.cacheLengths();
              const p = pb.get(cfg.t);
              cfg.y = p.y;
              bezier_draw.drawCircle(p,3);
            }
          } else { // draw track (top view)

            var poly_bezier = new Bezier.PolyBezier();
            var scale = cfg.scale * canvas.height;
            var origin = new THREE.Vector2(0, 0);
            let p = new THREE.Vector2(0.5*canvas.width,0.6*canvas.height);
            var t = new THREE.Vector2(0,-1); // tangent
            var first = true;
            var signs = track.signs;
            var prev = null;
            var cur_percent = 0;
            function do_bezier(p_deviation, distance) { // eslint-disable-line
              var a2_deviation = p_deviation;
              var a1_length = 0.4 * distance,
                  a2_length = 0.4 * distance;
              var p2 = p.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation), distance);
              var segment = new Bezier(
                  p,
                  p.clone().addScaledVector(t, a1_length),
                  p2.clone().addScaledVector(t.clone().rotateAround(origin, p_deviation + Math.PI + a2_deviation), a2_length),
                  p2);
              bezier_draw.drawCurve(segment);
              t.copy(segment.derivative(1)).normalize();
              p.copy(p2);
              poly_bezier.addCurve(segment);
              return segment.length();
            }
            function proc_sign(sign) { // eslint-disable-line
              var p_deviation = (sign.type == 13 ? -0.2 : 0.2) * sign.intensity * sign.duration * cfg.deviation_mult;
              var distance = (sign.duration) * scale * cfg.distance_mult;
              return do_bezier(p_deviation, distance) / scale;
            }
            function proc_prev_sign(prev,cur_percent) { // eslint-disable-line
              var p_deviation = (prev.type == 13 ? -0.2 : 0.2) * Math.PI;
              var distance = (cur_percent - prev.percent) * scale;
              do_bezier(p_deviation, distance);
            }
            let sign_count = 0;
            for (let i = 0; i < signs.length; i++) {
              var sign = signs[i];
              if (sign.type >= 13) {
                sign_count++;
                const fname = 'sign ' + sign_count;
                if (!(fname in gui.__folders)) {
                  const gf = gui.addFolder(fname);
                  gf.add({'right': sign.type == 14}, 'right').onChange(v => {sign.type = 13+v; draw();});
                  gf.add(sign, 'at_length').onChange(draw);
                  gf.add(sign, 'duration').onChange(draw);
                  gf.add(sign, 'intensity').onChange(draw);
                }
                if (cfg.ver2) {
                  //const p0 = p.clone();
                  var percent1 = (sign.percent - cur_percent);
                  //debugger;
                  if (percent1 > 0) {
                    // p.addScaledVector(t, percent1 * scale);
                    // bezier_draw.drawLine(p0, p);
                    do_bezier(0, percent1 * scale);
                  }
                  if (percent1 < 0)
                    console.log('!!');
                  cur_percent += Math.max(percent1,0) + proc_sign(sign);
                } else {
                  if (first) {
                    // var p0 = p.clone();
                    // p.y -= sign.percent * scale;
                    // bezier_draw.drawLine(p0,p);
                    do_bezier(0, sign.percent * scale);
                    first = false;
                  } else {
                    proc_prev_sign(prev,sign.percent);
                  }
                  prev = sign;
                }
              }
            }
            if (cfg.ver2) {
              if (cur_percent < 1) {
                do_bezier(0, (1-cur_percent) * scale);
                // bezier_draw.drawLine(p, p.clone().addScaledVector(t, (1-cur_percent) * scale));
              }
            } else
              proc_prev_sign(prev,1);
            poly_bezier.cacheLengths();
            //console.log((poly_bezier.total_length / scale).toFixed(3));          
          }
          
        } // draw()

        for (var i = 0; i < gui.__controllers.length; i++) {
          if (gui.__controllers[i] instanceof dat.controllers.FunctionController)
            break;
          gui.__controllers[i].onChange(draw);
        }
        draw();
      }); // load json
    } // load_track()
    gui.add({reload: load_track}, 'reload');
    let refresh_timer = -1;
    function auto_refresh(v) { // eslint-disable-line
      if (v)
        refresh_timer = setInterval(load_track, 100);
      else
        clearInterval(refresh_timer);
    }
    gui.add({auto_refresh: false}, 'auto_refresh').onChange(auto_refresh);
    load_track();
  } // if canvas.getContext
});