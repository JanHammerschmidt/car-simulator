
class PickingControls {

    constructor(window, scene, objects, camera) {
        this.camera = camera ? camera : THREE.get_camera();
        this.window = window;
        this.scene = scene;
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.listener = this.onMouseMove.bind(this);
        this.objects = objects ? objects : [];

        this.sphere = [new THREE.SphereGeometry(0.002), new THREE.MeshBasicMaterial({color: 0xffff00})];
        this.sphere_selected = [new THREE.SphereGeometry(0.003), new THREE.MeshBasicMaterial({color: 0xff0000})];
        this.sphere_nearest = [new THREE.SphereGeometry(0.002), new THREE.MeshBasicMaterial({color: 0x00ff00})];
        this.spheres = [];
        this.selected_objects = [];
        this.nearest_point = null;
    }

    enable(camera) {
        if (camera)
            this.camera.copy(camera);
        this.window.addEventListener('mousemove', this.listener, false);
    }

    disable() {
        this.window.removeEventListener('mousemove', this.listener, false);
        this.clear_spheres();
    }

    add_sphere(position, obj, sphere) {
        sphere = sphere ? sphere : this.sphere;
        let mesh = new THREE.Mesh(sphere[0], sphere[1]);
        mesh.position.copy(position);
        obj = obj ? obj : this.scene;
        obj.add(mesh);
        this.spheres.push([obj,mesh]);
    }

    clear_spheres() {
        for (let s of this.spheres)
            s[0].remove(s[1]);
        this.spheres = [];
        for (let s of this.selected_objects) {
            const geo = s[0].geometry;
            const v = geo.vertices;
            for (let i of s[1]) {
                const f = geo.faces[i];
                this.add_sphere(v[f.a], s[0].parent, this.sphere_selected);
                this.add_sphere(v[f.b], s[0].parent, this.sphere_selected);
                this.add_sphere(v[f.c], s[0].parent, this.sphere_selected);
                // this.add_sphere(s[0].geometry.vertices[i], s[0].parent, this.sphere_selected);
            }
        }
        // if (this.nearest_point)
        //     this.add_sphere()
    }

    update(select) {
        this.clear_spheres();
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.objects, true);
        if (intersects.length <= 0)
            return;
        const i = intersects[0];
        const geo = i.object.geometry;
        if (!('vertices' in geo))
            return;
        if (select) {
            let s = this.selected_objects.filter((o) => o[0] === i.object);
            s = s.length > 0 ? s[0] : this.selected_objects[this.selected_objects.push([i.object,[]])-1];
            s[1].push(i.faceIndex);
            // s[1].push(i.face.a);
            // s[1].push(i.face.b);
            // s[1].push(i.face.c);
            this.clear_spheres();
        } else {
            this.add_sphere(geo.vertices[i.face.a], i.object.parent);
            this.add_sphere(geo.vertices[i.face.b], i.object.parent);
            this.add_sphere(geo.vertices[i.face.c], i.object.parent);
        }
        // for (let )
        this.add_sphere(i.point, null, this.sphere_nearest);
    }

    extend(obj) {
        this.raycaster.setFromCamera(this.mouse, this.camera); // get reference point
        const intersects = this.raycaster.intersectObjects(this.objects, true);
        if (intersects.length <= 0) {
            console.log("extend: no reference point!");
            return;
        }
        let ref_point = intersects[0].point;

        obj = obj ? obj : this.selected_objects[0];
        ref_point = obj[0].worldToLocal(ref_point);
        const fs = obj[1]; // selected faces
        const faces = obj[0].geometry.faces; // faces of the geometry
        const vs = obj[0].geometry.vertices; // vertices of the geometry
        let points = []; // construct list of points from the faces
        for (let face of fs) {
            const f = faces[face];
            const ps = [f.a, f.b, f.c];
            for (let p of ps) {
                if (points.indexOf(p) == -1)
                    points.push(p);
            }
        }
        let min_dist = Number.MAX_VALUE;
        let sel_face = -1;
        for (let i = 0; i < faces.length; i++) {
            if (fs.indexOf(i) != -1)
                continue;
            const f = faces[i];
            const t = [points.indexOf(f.a) != -1, points.indexOf(f.b) != -1, points.indexOf(f.c) != -1];
            if (t.indexOf(true) != -1) {
                const fp = [vs[f.a], vs[f.b], vs[f.c]]; // points of face
                const d = fp.map((p) => ref_point.distanceToSquared(p))[0] // shortest distance to ref point
                if (d < min_dist) {
                    min_dist = d;
                    sel_face = i;
                }
            }
        }
        if (sel_face == -1) {
            console.log("can't extend current set of faces");
            return;
        }
        fs.push(sel_face);
        this.clear_spheres();        
    }

    remove_selected_faces(obj) {
        obj = obj ? obj : this.selected_objects[0];
        let geo = obj[0].geometry;
        const faces = geo.faces;
        const f = obj[1].sort(); // selected faces
        for (let i = f.length-1; i >= 0; i--) {
            console.log("remove face", f[i]);
            faces.splice(f[i], 1);
            geo.faceVertexUvs[0].splice(f[i], 1);
        }
        obj[1] = [];
        const parent = obj[0].parent;
        const old = obj[0];
        parent.remove(old);
        obj[0] = new THREE.Mesh(geo.clone(), old.material)
        parent.add(obj[0]);
        const i = this.objects.indexOf(old);
        if (i != -1)
            this.objects[i] = obj[0];
    }

    undo_last_select(obj) {
        obj = obj ? obj : this.selected_objects[0];
        obj[1].splice(obj[1].length-1, 1);
        this.clear_spheres();
    }

    onMouseMove(event) {
        this.mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        this.mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    }


}

module.exports = PickingControls;