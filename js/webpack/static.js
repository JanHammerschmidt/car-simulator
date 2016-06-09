'use strict';

let models = {};
models.stop_sign = {'mtl': require('raw!../../models/stop_sign/stop_sign.mtl'),
                    'obj': require('raw!../../models/stop_sign/stop_sign.obj'),
                    'path': 'models/stop_sign/'};
models.traffic_light = {'mtl': require('raw!../../models/traffic_lights/traffic_lights.mtl'),
                        'obj': require('raw!../../models/traffic_lights/traffic_lights.obj'),
                        'path': 'models/traffic_lights/'};                    

module.exports = {
    'models': models,
    'track_study_1': require('json!../../track.study1.json'),
    'terrain_height': require('json!../../terrain.json')
};