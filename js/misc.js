'use strict';

let misc = {
    
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
        let min_d = Number.MAX_VALUE;
        let idx = 0;
        for (let i = 0; i < a.length; i++) {
            const d = misc.distSq2d(p, a[i]);
            if (d < min_d) {
                min_d = d;
                idx = i;
            }
        }
        return [idx,min_d];
    },

    distSq2d: function(p1, p2) {
        var dx = p2.x - p1.x,
            dy = p2.y - p1.y;
        return dx * dx + dy * dy;
    },

    sqr: function(x) { return x*x; }

}

module.exports = misc;