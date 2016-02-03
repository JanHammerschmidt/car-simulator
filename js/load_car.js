require("script!./lib/async.js");

function load_car_parts(callback, meshtype) {

    if (meshtype == undefined)
        meshtype = THREE.Mesh
    var json_loader = new THREE.JSONLoader();
    var tex_loader = new THREE.TextureLoader();
    var textures, car_body, wheel;


    var glass_mat = new THREE.MeshLambertMaterial({
        color: 0xEEEEEE,
        transparent: true,
        opacity: 0.4
    });

    async.series([

        function(next) { // load textures
            async.map(['OculusCar/textures/car/interior/JFC_Int_Back.jpg',
                    'OculusCar/textures/car/interior/JFC_Int_Front.jpg',
                    'OculusCar/textures/car/exterior/JFC_Body.png',
                    'OculusCar/textures/car/wheels/int/JFC_Rim_Int.jpg',
                    'OculusCar/textures/car/wheels/rim/JFC_Rim_01.jpg',
                    'OculusCar/textures/car/wheels/tire/JFC_Tire.jpg'
                ],
                function(item, callback) {
                    tex_loader.load(item, function(tex) {
                        callback(null, tex);
                    });
                }, function(err, results) {
                    textures = results;
                    next();
                });
        },
        function(next) { // load exterior
            json_loader.load('OculusCar/models/jfc-ext.js', function(geometry, materials) {
                [0, 2, 3].forEach(function(i) {
                    materials[i].map = textures[2];
                    materials[i].color.set(0xFFFFFF);
                });
                materials[1] = glass_mat;
                var material = new THREE.MeshFaceMaterial(materials);
                //var ext = new THREE.Mesh(geometry, material);
                //ext.position.set(-0.90351, 0.905721, -0.625575);
                car_body = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(geometry), material);
                // car_body.add(ext);
                next();
            });
        },        
        function(next) { // load door
            json_loader.load('OculusCar/models/jfc-door.js', function(geo, mats) {
                for (var i = 1; i <= 4; i++) {
                    mats[i].color.set(0xFFFFFF);
                }
                mats[0] = glass_mat;
                //mats[1].color = 0xFF0000;
                mats[2].map = textures[2];
                mats[3].map = textures[0];
                mats[4].map = textures[1];
                //car_body = new meshtype(geo, new THREE.MeshFaceMaterial(mats));
                var door = new THREE.Mesh(geo, new THREE.MeshFaceMaterial(mats));
                door.position.set(0.90351, -0.905721, 0.625575);
                car_body.add(door);
                next();
            });
        },
        function(next) { // load interior
            json_loader.load(
                'OculusCar/models/jfc-int.js',
                function(geometry, materials) {
                    materials[0].map = textures[0];
                    materials[1].map = textures[1];
                    materials[0].color.set(0xFFFFFF);
                    materials[1].color.set(9869980); //, 6250851
                    var material = new THREE.MeshFaceMaterial(materials);
                    var object = new THREE.Mesh(geometry, material);
                    //object.position.set(-0.90351, 0.905721, -0.625575);
                    car_body.add(object);
                    next();
                }
            );
        },
        function(next) {
            async.map(['OculusCar/models/wheels/jfc-tire.js',
                'OculusCar/models/wheels/jfc-rim.js',
                'OculusCar/models/wheels/jfc-screw.js'
            ], function(item, callback) {
                json_loader.load(item, function(geo, mats) {
                    callback(null, [geo, mats]);
                });
            }, function(err, results) {
                results[0][1][0].map = textures[5];
                results[1][1][0].map = textures[4];
                results[1][1][1].map = textures[3];
                results[1][1][1].color.set(0xFFFFFF);
                results[2][1][0].map = textures[4];
                //results[2]
                for (var i = 0; i < 3; i++)
                    results[i] = new THREE.Mesh(results[i][0], new THREE.MeshFaceMaterial(results[i][1]));
                results[2].position.set(-.0659582, 732697e-9, .00550807);

                wheel = results[0];
                for (var i = 1; i < 3; i++)
                    wheel.add(results[i]);

                next();
            });
        }
    ], function() {
        callback(car_body, wheel);
    });
}

function load_car(callback) {
    load_car_parts(function(car_body, wheel) {
        var car = new THREE.Object3D(); // = car_body
        car.add(car_body);
        var wheels = [wheel]; // add wheels
        for (var i = 0; i < 3; i++)
            wheels.push(wheel.clone());
        var x = 0.83,
            y = 0.17,
            z1 = 1.42,
            z2 = 1.47;        
        if (false) {
            wheels[0].position.set(-x, y, z1);
            wheels[1].position.set(x, y, z1);
            wheels[1].rotation.y = Math.PI;
            wheels[2].position.set(-x, y, -z2);
            wheels[3].position.set(x, y, -z2);
            wheels[3].rotation.y = Math.PI;
        } else {
            wheels[0].position.set(-x, z2, y);
            wheels[1].position.set(x, z2, y);
            wheels[1].rotation.y = Math.PI;
            wheels[2].position.set(-x, -z1, y);
            wheels[3].position.set(x, -z1, y);
            wheels[3].rotation.y = Math.PI;            
        }
        wheels.forEach(function(t) {
            car.add(t);
        });
        //car.rotation.x = -Math.PI / 2;
        callback(car)
    });
}

module.exports = {'load_car_parts': load_car_parts, 'load_car': load_car};
