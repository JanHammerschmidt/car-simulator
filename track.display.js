$(function() {
  var canvas = document.getElementById('tutorial');
  if (canvas.getContext){
    var cfg = {ver2: false, deviation_mult: 2, distance_mult: 0.1, scale: 1.0, 
      draw_height: true, scale_x: 0.1, scale_y: 0.5, draw_signs: false, t: 1, y:0.01};
    var c = canvas.getContext('2d');
    var bezier_draw = bindDrawFunctions(c);

    $.getJSON('track.study1.json', function(track) {
      
      function draw() {

        c.clearRect(0,0,canvas.width,canvas.height);
        
        if (cfg.draw_height) {
          var ps = $.extend(true, [], track.points);
          for (var i = 0; i < ps.length; i++) {
              ps[i].x *= cfg.scale_x;
              ps[i].y = canvas.height - (ps[i].y-90) * cfg.scale_y;
          }
          var pb = new Bezier.PolyBezier();
          for (var i = 0; i < ps.length-2; i += 3) {
            var b = new Bezier(ps[i],ps[i+1],ps[i+2],ps[i+3]);
            pb.addCurve(b);
            bezier_draw.drawCurve(b);
            // bezier_draw.drawSkeleton(b);
          }
          if (cfg.draw_signs) {
            for (var i = 0; i < track.signs.length; i++) {
              var s = track.signs[i];
              var p = new THREE.Vector2(s.point.x, s.point.y);
              p.x *= cfg.scale_x;
              p.y *= cfg.scale_y;
              bezier_draw.drawCircle(p, 3,{x:0,y:0.8*canvas.height});
            }
          } else {
            pb.cacheLengths();
            var p = pb.get(cfg.t);
            cfg.y = p.y;
            bezier_draw.drawCircle(p,3);
          }
        } else { // draw track (top view)

          var scale = cfg.scale * canvas.height;
          var origin = new THREE.Vector2(0, 0);
          var p = new THREE.Vector2(0.9*canvas.width,0.8*canvas.height);
          var t = new THREE.Vector2(0,-1); // tangent
          var first = true;
          var signs = track.signs;
          var prev = null;
          var cur_percent = 0;
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
            bezier_draw.drawCurve(segment);
            t.copy(segment.derivative(1)).normalize();
            p.copy(p2);
            return segment.length();
          }
          function proc_sign(sign) {
            var p_deviation = (sign.type == 13 ? -0.2 : 0.2) * sign.intensity * sign.duration * cfg.deviation_mult;
            var distance = (sign.duration) * scale * cfg.distance_mult;
            return do_bezier(p_deviation, distance) / scale;
          }
          function proc_prev_sign(prev,cur_percent) {
            var p_deviation = (prev.type == 13 ? -0.2 : 0.2) * Math.PI;
            var distance = (cur_percent - prev.percent) * scale;
            do_bezier(p_deviation, distance);
          };
          for (var i = 0; i < signs.length; i++) {
            var sign = signs[i];
            if (sign.type >= 13) {
              if (cfg.ver2) {
                var p0 = p.clone();
                var percent1 = (sign.percent - cur_percent);
                //debugger;
                if (percent1 > 0) {
                  // p.addScaledVector(t, percent1 * scale);
                  // bezier_draw.drawLine(p0, p);
                  do_bezier(0, percent1 * scale);
                }
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
        }
        
      } // draw()

      var gui = new dat.GUI();
      gui.add(cfg, 'ver2');
      gui.add(cfg, 'deviation_mult', 0.5, 7);
      gui.add(cfg, 'distance_mult', 0.03, 0.3);
      gui.add(cfg, 'scale', 0.4, 1.5);
      gui.add(cfg, 'draw_height');
      gui.add(cfg, 'scale_x', 0.08,1.2);
      gui.add(cfg, 'scale_y');
      gui.add(cfg, 'draw_signs');
      gui.add(cfg, 't',0,1);
      gui.add(cfg, 'y').listen();
      for (var i = 0; i < gui.__controllers.length; i++) {
        gui.__controllers[i].onChange(draw);
      }
      draw();
    }
);
  }
});