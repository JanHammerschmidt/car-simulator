'use strict';

const misc = require("./misc.js");
const distSq2d = misc.distSq2d;

function generateTexture() {

    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 64;

    var context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 32, 64);

    for (var y = 2; y < 64; y += 2) {

        for (var x = 0; x < 32; x += 2) {

            var value = Math.floor(Math.random() * 64);
            context.fillStyle = 'rgb(' + [value, value, value].join(',') + ')';
            context.fillRect(x, y, 2, 1);

        }

    }

    var canvas2 = document.createElement('canvas');
    canvas2.width = 512;
    canvas2.height = 1024;

    context = canvas2.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.imageImageSmoothingEnabled = false;
    context.mozImageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, canvas2.width, canvas2.height);

    return canvas2;

}

var create_city_geometry = function(street, num_buildings)
{
	num_buildings = num_buildings || 2000;

    var geometry = new THREE.CubeGeometry(1, 1, 1);
    geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0.5, 0));
    geometry.faces.splice(6, 2);
    geometry.faceVertexUvs[0].splice(6, 2);
    geometry.faceVertexUvs[0][4][0].set(1, 1);
    geometry.faceVertexUvs[0][4][1].set(1, 1);
    geometry.faceVertexUvs[0][4][2].set(1, 1);
    geometry.faceVertexUvs[0][5][0].set(1, 1);
    geometry.faceVertexUvs[0][5][1].set(1, 1);
    geometry.faceVertexUvs[0][5][2].set(1, 1);


    var building = new THREE.Mesh(geometry);
    var city = new THREE.Geometry();

    var light = new THREE.Color(0xffffff);
    var shadow = new THREE.Color(0x303050);

    function nearestPoint(p) {
        var min_dist = 9999999,
            idx = 0,
            point = 0;
        for (var i = 0; i < street.lut.length; i++) {
            const l = street.lut[i];
            const ds = distSq2d(l,p);
            if (ds < min_dist) {
                min_dist = ds;
                idx = i;
                point = j;
            }
        }
        return [min_dist, idx, point];
    }
    for (var i = 0; i < num_buildings; i++) {
        building.position.x = Math.floor(Math.random() * 200 - 100) * 10;
        building.position.z = Math.floor(Math.random() * 200 - 100) * 10;
        building.position.y = building.position.z; // this is just for nearestPoint (uses .x / .y)
        var pp = nearestPoint(building.position);
        if (pp[0] < 400)
            continue;
        var dist = Math.sqrt(pp[0]);

        building.rotation.y = Math.random();
        building.scale.x = building.scale.z = Math.random() * Math.random() * Math.random() * Math.random() * 50 + 20;
        building.scale.y = (Math.random() * Math.random() * Math.random() * building.scale.x) * 8 + 18;
        if (Math.sqrt(2)*building.scale.x > dist) // why is this dist .. and not a fixed value, like (again) 400?
            continue;
        building.position.y = 0;

        geometry = building.geometry;

        var value = 1 - Math.random() * Math.random();
        var color = new THREE.Color().setRGB(value + Math.random() * 0.1, value, value + Math.random() * 0.1);

        var top = color.clone().multiply(light);
        var bottom = color.clone().multiply(shadow);

        for (var j = 0, jl = geometry.faces.length; j < jl; j++) {

            if (j === 2) {

                geometry.faces[j].vertexColors = [color, color, color, color];

            } else {

                geometry.faces[j].vertexColors = [top, bottom, bottom, top];

            }

        }
        city.mergeMesh(building);
        //THREE.GeometryUtils.merge( city, building );
    }

    var texture = new THREE.Texture(generateTexture());
    texture.anisotropy = renderer.getMaxAnisotropy();
    texture.needsUpdate = true;

    var mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(city), new THREE.MeshLambertMaterial({
        map: texture,
        vertexColors: THREE.VertexColors
    }));

    return mesh;
}

// city_geometry.prototype = {

// }

module.exports = create_city_geometry;