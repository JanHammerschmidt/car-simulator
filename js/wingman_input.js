// tailored to chrome (assumes timestamp support, but no events)
var wingman_input = {

    steering: 0, // [-1,+1]
    accel: 0, // [-1,+1] also includes braking

    //dev = undefined,
    //prev_timestamp = undefined,

    tick: function() { // returns true if there has been an update
        var gamepads = navigator.getGamepads();
        if (wingman_input.dev == undefined) {
            if (gamepads[0] && gamepads[0].id.indexOf("WingMan Formula GP") == 0) {
                wingman_input.dev = gamepads[0];
                console.log("found Wingman input");
            } else if (gamepads[1] && gamepads[1].id.indexOf("WingMan Formula GP") == 0) {
                wingman_input.dev = gamepads[1];
                console.log("found Wingman input");
            }
        }
        var dev = wingman_input.dev;
        if (dev != undefined && dev.timestamp != wingman_input.prev_timestamp) {
            wingman_input.prev_timestamp = dev.timestamp;
            var steering = -dev.axes[0];
            var accel = -dev.axes[1];
            if (accel > 0 && accel < 0.004)
                accel = 0;
            if (steering > 0 && steering < 0.05)
                steering = 0;
            if (steering < 0 && steering > -0.05)
                steering = 0;
            wingman_input.steering = steering;
            wingman_input.accel = accel;                
            console.log(accel, steering);
            return true;
        }
        return false;
    }
}

// function clamp(x, a, b) {
//     return Math.min(Math.max(x, a), b)
// }

var keyboard_input = {

    steering: 0, // see above ..
    accel: 0,

    //internal
    power: null,
    direction: null,

    tick: function() {
        var self = keyboard_input;
        var update = false;
        if (self.direction != null) {
            //self.steering = clamp(self.steering + self.direction * 0.01, -1, 1);
            self.steering = self.direction * 1.0;
            update = true;
        } else if (self.steering != 0) {
            self.steering = 0;
            update = true;
        }
        if (self.power != null) {
            update = true;
            self.accel = self.power ? 1 : -1;
        } else if (self.accel != 0) {
            self.accel = 0;
            update = true;
        }
        return update;
    },

    init: function() {
        keyboard_input.no_wasd = false;
        document.addEventListener('keydown', function(ev) {
            if (keyboard_input.no_wasd && [65, 87, 68, 83].indexOf(ev.keyCode) >= 0)
                return;
            switch (ev.keyCode) {
                case 37: // left
                case 65: // A
                    keyboard_input.direction = 1;
                    break;

                case 38: // forward
                case 87: // W
                    keyboard_input.power = true;
                    break;

                case 39: // right
                case 68: // D
                    keyboard_input.direction = -1;
                    break;

                case 40: // back
                case 83: // S
                    keyboard_input.power = false;
                    break;
            }
        });
        document.addEventListener('keyup', function(ev) {
            switch (ev.keyCode) {
                case 37: // left
                case 65: // A
                    keyboard_input.direction = null;
                    break;

                case 38: // forward
                case 87: // W
                    keyboard_input.power = null;
                    break;

                case 39: // right
                case 68: // D
                    keyboard_input.direction = null;
                    break;

                case 40: // back
                case 83: // S
                    keyboard_input.power = null;
                    break;
            }
        });
    }
}

module.exports = {'wingman_input': wingman_input, 'keyboard_input': keyboard_input}
// window.wingman_input = wingman_input;
// window.keyboard_input = keyboard_input;