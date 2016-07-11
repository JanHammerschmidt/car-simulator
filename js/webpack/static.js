'use strict';

let models = {};
models.stop_sign = {'mtl': require('raw!../../models/stop_sign/stop_sign.mtl'),
                    'obj': require('raw!../../models/stop_sign/stop_sign.obj'),
                    'path': 'models/stop_sign/'};
models.traffic_light = {'mtl': require('raw!../../models/traffic_lights/traffic_lights.mtl'),
                        'obj': require('raw!../../models/traffic_lights/traffic_lights.obj'),
                        'path': 'models/traffic_lights/'};
models.speed_sign = {'mtl': require('raw!../../models/speed_sign/speed_sign.mtl'),
                    'obj': require('raw!../../models/speed_sign/speed_sign.obj'),
                    'path': 'models/speed_sign/'};
models.audi_a3 = {'mtl': require('raw!../../models/test.mtl'),
                  'obj': require('raw!../../models/test.obj'),
                  'path': 'models/'};

module.exports = {
    'models': models,
    'track_study_1': require('json!../../track.study1.json'),
    'terrain_height': require('json!../../terrain.json')
};