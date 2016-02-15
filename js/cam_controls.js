// var first_person_cam = function(camera, initial_pos, displacement, direction) {
//     this.camera = camera;
//     this.displacement = displacement;
//     this.direction = direction;

//     this.tick = function(position, quaternion, dt) {
//         this.camera.position.copy(position.clone().add(
//             this.displacement.clone().applyQuaternion(quaternion)));
//         this.camera.lookAt(position.clone().add(
//             this.direction.clone().applyQuaternion(quaternion)));
//     }
// }

var chase_cam = function(camera, pos, dist_vector) {

    this.camera = camera;
    this.pos = pos;
    this.velocity = new THREE.Vector3;
    this.dist_vector = dist_vector;
    //this.dist_length = dist_vector.length();
    this.spring_tightness = 0.8;
    this.damping_factor = 0.5;
    this.target_pos = pos.clone();
    
    this.tick = function(target, quaternion, dt) {
        var new_pos = target.clone().add(this.dist_vector.clone().applyQuaternion(quaternion)); // desired position
        var diff_vec = new_pos.clone().sub(this.pos); // basically x (see below)
        //var diff_length = diff_vec.length();
        var target_velocity = target.clone().sub(this.target_pos).multiplyScalar(1/dt);


        // F = -k(|x|-d)(x/|x|) - bv
        // x: vector displacement from end of the spring to it's equilibrium position (diff_vec)
        // v: relative velocity between the two points connected to the spring
        // k: spring thightness
        // b: damping factor
        // d: desired distance
        //Vector2 F1 = -k * (xAbs - d) * (Vector2.Normalize(node2.p - node1.p) / xAbs) - b * (node1.v - node2.v);

        var force = diff_vec.clone().multiplyScalar(this.spring_tightness);
        var rel_velocity = this.velocity.clone().sub(target_velocity);
        force.sub(rel_velocity.multiplyScalar(this.damping_factor));
        this.velocity.add(force);
        this.pos.add(this.velocity.clone().multiplyScalar(dt));
        camera.position.copy(this.pos);
        this.target_pos = target;
        camera.lookAt(target);
        //console.log(dt, target, this.pos);
    }
}

module.exports = {'chase_cam': chase_cam}