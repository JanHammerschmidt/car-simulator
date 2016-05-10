/*global GMath*/

var Vec2 = require('./Vec2.js');
require('script!./GMath.js');
var InputState = require('./InputState.js');
const misc = require('../../../js/misc.js');

"use strict";

class ConsumptionMap {
	constructor() {
		this.ellipse = {x: 0.4, y: 0.16};
		this.rot = 20 / 180 * Math.PI;
		this.translate = {x: 0.45, y: 0.85};
		this.cache_transform();
	}
	cache_transform() {
		this.rot_t = misc.rotxy(this.translate, this.rot);
	}
	get_rel_consumption(rpm, torque) {
		// rpm & torque are both *relative* (between 0..1)
		let p = {x: rpm, y: torque};
		p = misc.rotxy(p, this.rot);
		p.x -= this.rot_t.x;
		p.y -= this.rot_t.y;
		const e = misc.sqr(p.x / this.ellipse.x) + misc.sqr(p.y / this.ellipse.y);
		return Math.pow(e, 0.7) * 0.1 + 1;
	}
}

class ConsumptionMonitor {
	constructor(update_callback) {
		// update_callback receives updates on L/100km, every 1s
		this.reset();
		this.tick(0,0,0);
		this.update_callback = update_callback;
	}
	tick(liter_s, dt, speed) {
		this.liters_used += dt * liter_s;
		this.liter_counter += dt * liter_s;
		this.t_counter += dt;
		if (this.t_counter >= 1) {
			if (speed > 0.001) {
				const L_s = this.liter_counter / this.t_counter;
				const l_100km = L_s / speed * 1000 * 100; // [L/s] => [L/100km]
				this.update_callback(l_100km);
			} else
				this.update_callback(0);
			this.liter_counter = this.t_counter = 0;
		}
		this.liters_per_second_cont = liter_s;
		this.liters_per_100km_cont = liter_s / speed * 1000 * 100;

	}
	reset() {
		this.liters_used = 0; // total usage
		this.liter_counter = 0; // counter for calculation of avg l/100km
		this.t_counter = 0; // how much since the last update?
	}
}

/**
 *  Car class

	This is a HTML/Javascript adaptation of Marco Monster's 2D car physics demo.
	Physics Paper here:
	http://www.asawicki.info/Mirror/Car%20Physics%20for%20Games/Car%20Physics%20for%20Games.html
	Windows demo written in C here:
	http://www.gamedev.net/topic/394292-demosource-of-marco-monsters-car-physics-tutorial/
	Additional ideas from here:
	https://github.com/Siorki/js13kgames/tree/master/2013%20-%20staccato

	Adapted by Mike Linkovich
	http://www.spacejack.ca/projects/carphysics2d/
	https://github.com/spacejack/carphysics2d

	License: MIT
	http://opensource.org/licenses/MIT
 */
var Car = function( opts )
{
	opts = opts || {};

	//  Car state variables
	this.heading = opts.heading || 0.0;  // angle car is pointed at (radians)
	this.position = new Vec2(opts.x, opts.y);  // metres in world coords
	this.velocity = new Vec2();  // m/s in world coords
	this.velocity_c = new Vec2();  // m/s in local car coords (x is forward y is sideways)
	this.accel = new Vec2();  // acceleration in world coords
	this.accel_c = new Vec2();   // accleration in local car coords
	this.absVel = 0.0;  // absolute velocity m/s
	this.yawRate = 0.0;   // angular velocity in radians
	this.steer = 0.0;	// amount of steering input (-1.0..1.0)
	this.steerAngle = 0.0;  // actual front wheel steer angle (-maxSteer..maxSteer)
	this.alpha = 0.0; // uphill angle (can be negative)

	//  State of inputs
	this.inputs = new InputState();

	//  Use input smoothing (on by default)
	this.smoothSteer = (opts.smoothSteer === undefined) ? false : !!opts.smoothSteer;
	//  Use safe steering (angle limited by speed)
	this.safeSteer = (opts.safeSteer === undefined) ? false : !!opts.safeSteer;

	//  Stats object we can use to ouptut info
	this.stats = opts.stats;

	//  Other static values to be computed from config
	this.inertia = 0.0;  // will be = mass
	this.wheelBase = 0.0;  // set from axle to CG lengths
	this.axleWeightRatioFront = 0.0;  // % car weight on the front axle
	this.axleWeightRatioRear = 0.0;  // % car weight on the rear axle

	//  Setup car configuration
	this.config = new Car.Config(opts.config);
	//this.rendercfg = new Car.RenderConfig(opts.config);
	this.setConfig();

	this.engine = new Car.Engine();
	this.gearbox = new Car.Gearbox();
	this.speed = 0;
	this.consumption_monitor = new ConsumptionMonitor(opts.consumption_update);
};

Car.prototype.setFromPosition3d = function(v) { this.position.x = v.z; this.position.y = -v.x; }
Car.prototype.setPosition3d = function(v) { v.x = -this.position.y; v.z = this.position.x; };
Car.prototype.quaternion = function() { return new THREE.Quaternion().setFromAxisAngle(
														new THREE.Vector3(0,1,0),-this.heading)};
Car.prototype.kmh = function() { return this.velocity_c.x * 3600 / 1000 };

Car.TorqueMap = function() {
	this.ramps = [];
	this.ramps.push({throttle: 0.5, ramp: [[0.0, 0.2], [0.2,0.65], [0.5,0.55], [0.7,0.4], [1.0,0]]});
	this.ramps.push({throttle: 1.0, ramp: [[0.0, 0.2], [0.2,0.8], [0.5,1], [0.8,0.8], [1.0,0]]});
};

Car.TorqueMap.prototype = {
	get_torque: function(throttle, rpm) { // relative throttle and rpm! (and returns relative torque..)
		var ramps = this.ramps;
		var ramp0 = ramps[0];
		var ramp_1 = ramps[this.ramps.length-1];
		if (throttle <= ramp0.throttle)
			return this.linear_interp(throttle, 0, ramp0.throttle, 0, this.get_ramp_torque(rpm, ramp0.ramp));
		if (throttle >= ramp_1.throttle)
			return this.get_ramp_torque(rpm, ramp_1.ramp);
		for (var i = 1; i < ramps.length; i++) {
			if (throttle <= ramps[i].throttle) {
				return this.linear_interp(throttle, ramps[i-1].throttle, ramps[i].throttle, 
					this.get_ramp_torque(rpm, ramps[i-1]), this.get_ramp_torque(rpm, ramps[i]));
			}
		}
		// console.assert(false);
	},
	get_ramp_torque: function(rpm, ramp) {
		if (rpm <= ramp[0][0]) return ramp[0][1];
		var last = ramp[ramp.length-1];
		if (rpm >= last[0]) return last[1];
		for (var i = 1; i < ramp.length; i++) {
			if (rpm <= ramp[i][0])
				return this.linear_interp_p(rpm, ramp[i-1], ramp[i]);
		}
	},
	linear_interp: function(x,x0,x1,y0,y1) {
		return (y0 * (x1-x) + y1 * (x-x0)) / (x1-x0);
	},
	linear_interp_p: function(x,p0,p1) {
		return this.linear_interp(x, p0[0],p1[0], p0[1],p1[1]);
	}	
};

/**
 *  Car setup params and magic constants.
 */
Car.Config = function( opts )
{
	opts = opts || {};
	//  Defaults approximate a lightweight sports-sedan.
	this.gravity = opts.gravity || 9.81;  // m/s^2
	this.mass = opts.mass || 1200.0;  // kg [1500]
	this.inertiaScale = opts.inertiaScale || 1.0;  // Multiply by mass for inertia
	this.halfWidth = opts.halfWidth || 0.8; // Centre to side of chassis (metres)
	this.cgToFront = opts.cgToFront || 2.0; // Centre of gravity to front of chassis (metres)
	this.cgToRear = opts.cgToRear || 2.0;   // Centre of gravity to rear of chassis
	this.cgToFrontAxle = opts.cgToFrontAxle || 1.25;  // Centre gravity to front axle
	this.cgToRearAxle = opts.cgToRearAxle || 1.25;  // Centre gravity to rear axle
	this.cgHeight = opts.cgHeight || 0.55;  // Centre gravity height
	this.wheelRadius = opts.wheelRadius || 0.216; //0.3;  // Includes tire (also represents height of axle) [0.216]
	this.wheelWidth = opts.wheelWidth || 0.2;  // Used for render only
	this.tireGrip = opts.tireGrip || 2000.0;  // How much grip tires have
	this.lockGrip = (typeof opts.lockGrip === 'number') ? GMath.clamp(opts.lockGrip, 0.01, 1.0) : 0.7;  // % of grip available when wheel is locked
	//this.engineForce = opts.engineForce || 8000.0; // not used anymore!
	this.brakeForce = opts.brakeForce || 30000.0;
	this.eBrakeForce = opts.eBrakeForce || this.brakeForce / 2.5;
	this.weightTransfer = (typeof opts.weightTransfer === 'number') ? opts.weightTransfer : 0.2;  // How much weight is transferred during acceleration/braking
	this.maxSteer = opts.maxSteer || 0.2;  // Maximum steering angle in radians
	this.cornerStiffnessFront = opts.cornerStiffnessFront || 5.0 * 2.5;
	this.cornerStiffnessRear = opts.cornerStiffnessRear || 5.2 * 2.5;
	this.airResist = (typeof opts.airResist === 'number') ? opts.airResist : 0.7;	// air resistance (* vel) [TODO: probably lower!]
	this.rollResist = (typeof opts.rollResist === 'number') ? opts.rollResist : 8.0;	// rolling resistance force (* vel) [TODO: check!]
};

Car.Config.prototype.copy = function( c )
{
	for( var k in this ) if( this.hasOwnProperty(k) && c.hasOwnProperty(k) )
		this[k] = c[k];
	return this;
};


// Car.Engine // 

Car.Engine = function() {
	// this.liters_used = 0;
	// this.t_counter = 0;
	
	//this.rpm = 700;
	this.set_rpm(700);
	//this.angular_velocity = 0;
	//this.throttle = 0;
	this.torque = 0; // [N*m]
	this.min_throttle = 0.07; // [rel.]
	this.torque_map = new Car.TorqueMap();
	this.max_torque = 600; // 240; // [N*m]
	this.max_rpm = 10000; //7000;
	this.engine_braking_coefficient = 0.9;
	this.inertia = 0.13; // [kg m^2]
	this.consumption_map = new ConsumptionMap();
	this.base_consumption = 100;
};

Car.Engine.prototype = {
	update_torque: function(throttle) { // throttle (0..1)
        if (throttle < this.min_throttle && this.rpm() < 700) // ansonsten: Schubabschaltung!
            throttle = this.min_throttle;
        this.torque = this.max_torque * this.torque_map.get_torque(throttle, this.rel_rpm()); // [N*m]
        this.torque_out = this.torque - this.engine_braking_coefficient * Math.pow(Math.max(this.rpm(), 0) / 60, 1.1); // TODO: check "transmission (or: engine) efficiency" [maybe just 0.7]
	},
	rpm: function() { return this.angular_velocity * 60 / (2*Math.PI); },
	rel_rpm: function() { return this.rpm() / this.max_rpm; },
	power_output: function() { return this.angular_velocity * this.torque / 1000; }, // [kW]
	get_consumption: function() {  // returns [g/h]
		const power = this.power_output();
		const rel_consumption = this.consumption_map.get_rel_consumption(this.rel_rpm(), this.torque / this.max_torque);
		return rel_consumption * this.base_consumption * power;
	},
	get_consumption_L_s: function() {
		return this.get_consumption() / 1000 / 0.75 / (60*60); // [g/h] => [L/s]
	},
    get_l100km: function(speed) { // speed [m/s]
        if (speed < 0.001)
            return 0;
        let consumption = this.get_consumption();
        consumption /= 60*60; // [g/s]
        consumption /= speed * 1000; // [kg/m]
        consumption /= 0.75; // /dichte (0.75 kg/L) => [L/m]
        return consumption * 100 * 1000; // [L/100km]
    },
	set_rpm: function(rpm) { this.angular_velocity = this.rpm2angular_velocity(rpm); },
	rpm2angular_velocity: function(rpm) { return rpm * 2 * Math.PI / 60; },
	angular_velocity2rpm: function(av) { return av * 30 / Math.PI; }
};

// Car.Clutch

Car.Clutch = function() {
	this.engage = false; // is engaged or should engage
	this.t_shift = 0.8; // shift time (seconds)
	this.t = this.t_shift; // accumulated time since beginning of engagement

};

Car.Clutch.prototype = {
	disengage: function() {this.engage = false; },
	acting: function() { return this.engage && this.t < this.t_shift; },
	update: function(dt) { this.t += dt; },
	clutch_in: function(engine, gearbox, speed) {
		if (!this.engage) {
			this.t = 0;
			var rpm = gearbox.speed2engine_rpm(speed); // what the engine rpm should be
			this.w_t0 = engine.angular_velocity - engine.rpm2angular_velocity(rpm); // delta of rotation speeds at t0
			this.a_w = -this.w_t0 / this.t_shift; // acceleration (a) of the difference of the rotation speeds (w) (in order to "equalize" them)
			this.engage = true;
		}
	},
	counter_torque: function(engine, gearbox, speed, dt) {
		console.assert(this.acting());
		var w_t = this.w_t0 + this.t * this.a_w; // what the angular difference should be
		var rpm = gearbox.speed2engine_rpm(speed); // what the engine rpm would be if the clutch would be engaged
		var w_t_real = engine.angular_velocity - engine.rpm2angular_velocity(rpm); // what the angular difference actually is
		var a_w_e = (w_t - w_t_real) / dt; // what the acceleration of the engine-angular_velocity must be
		return engine.torque_out - engine.inertia * a_w_e;
	}
};

// Car.Gearbox

Car.Gearbox = function() {
	this.wheel_rolling_circumference = 1.93; // [m] //TODO?: von wheel radius (0.216) herleitbar? => 2*pi*radius = 1.35m => wie groß sind reifen so..? :P
	this.gears = [3.266, 1.85, 1.15, 0.82, 0.6]; // übersetzungen
	this.gears_mass_factors = [1.32, 1.15, 1.1, 1.07, 1.05]; // massenfaktoren
	this.end_transmission = 4.764; // engine (plus differential) is running this times faster than the wheels
	this.gear = 0;
	this.t_gear_change = 0.3; // duration of a gear change
	this.t = this.t_gear_change; // accumulated time since last gear change
	this.clutch = new Car.Clutch();
};

Car.Gearbox.prototype = {
	speed2engine_rpm: function(speed) { // speed: [m/s]
		var rpm = speed / this.wheel_rolling_circumference; // [u/sek]
		rpm *= (this.gears[this.gear] * this.end_transmission);
		return rpm * 60; // [u/m]
	},
	update_engine_speed: function(engine, speed, dt) {
		if (this.clutch.engage && !this.clutch.acting()) { // clutch is fully engaged
			engine.set_rpm(this.speed2engine_rpm(speed));
		} else {
			var delta_w = (engine.torque_out - engine.torque_counter) / engine.inertia;
			engine.angular_velocity += delta_w * dt;

		}
		// TODO: Q_ASSERT(!isnan(engine.angular_velocity));
	},
	tick: function(dt) {
		this.t += dt;
		this.clutch.update(dt);
	},
	auto_clutch_control: function(car) {
		if (!this.clutch.engage && car.engine.rpm() > 1000 && !this.gear_change()) {
			this.clutch.clutch_in(car.engine, car.gearbox, car.speed);
		}
	},
	gear_change: function() { return this.t < this.t_gear_change; }, // gear change in progress
	gear_up: function() { this.set_gear( Math.min(this.gear+1, this.gears.length-1) ); },
	gear_down: function() { this.set_gear( Math.max(this.gear-1,0) ); },
	set_gear: function(gear) {
		var changed = this.gear != gear;
		this.gear = gear;
		if (changed) {
			if (this.t_gear_change > 0) {
				this.clutch.disengage();
				if (!this.gear_change())
					this.t = 0;
			}
			// gear change notification
		}
	},
	torque2force_engine2wheels: function(engine, car, speed, dt) {
		if (this.clutch.acting()) {
			engine.torque_counter = this.clutch.counter_torque(engine, this, speed, dt);
		} else if (this.clutch.engage) { // clutch is (fully) engaged
			engine.torque_counter = engine.torque_out;
		} else {
			engine.torque_counter = 0;
		}
		return engine.torque_counter * this.gears[this.gear] * this.end_transmission / car.config.wheelRadius;
	}
};

Car.prototype.tick = function(dt) {
	this.gearbox.auto_clutch_control(this);
	this.gearbox.tick(dt);
	this.engine.update_torque(this.gearbox.gear_change() ? 0 : this.inputs.throttle);
	var F = this.gearbox.torque2force_engine2wheels(this.engine, this, this.speed, dt);
	const uphill_resistance = this.config.mass * this.config.gravity * Math.sin(this.alpha);
	F -= uphill_resistance;
	const mass_factor = this.gearbox.gears_mass_factors[this.gearbox.gear];
	if (F > 0) {
		F /= mass_factor;
	} else {
		F *= mass_factor;
	}
	this.engine_force = F;
}



/**
 *  App sets inputs via this function
 */
Car.prototype.setInputs = function( inputs )
{
	this.inputs.copy(inputs);
};

Car.prototype.setConfig = function( config )
{
	if( config )
		this.config.copy(config);
	// Re-calculate these
	this.inertia = this.config.mass * this.config.inertiaScale;
	this.wheelBase = this.config.cgToFrontAxle + this.config.cgToRearAxle;
	this.axleWeightRatioFront = this.config.cgToRearAxle / this.wheelBase; // % car weight on the front axle
	this.axleWeightRatioRear = this.config.cgToFrontAxle / this.wheelBase; // % car weight on the rear axle
};

/**
 *  @param dt Floating-point Delta Time in seconds
 */
Car.prototype.doPhysics = function( dt )
{
	// Shorthand
	var cfg = this.config;

	// Pre-calc heading vector
	var sn = Math.sin(this.heading);
	var cs = Math.cos(this.heading);


	// Weight on axles based on centre of gravity and weight shift due to forward/reverse acceleration
	var axleWeightFront = cfg.mass * (this.axleWeightRatioFront * cfg.gravity - cfg.weightTransfer * this.accel_c.x * cfg.cgHeight / this.wheelBase);
	var axleWeightRear = cfg.mass * (this.axleWeightRatioRear * cfg.gravity + cfg.weightTransfer * this.accel_c.x * cfg.cgHeight / this.wheelBase);

	// Resulting angular! velocity of the wheels as result of the yaw rate of the car body.
	// v = yawrate * r where r is distance from axle to CG and yawRate (angular velocity) in rad/s.
	var yawSpeedFront = cfg.cgToFrontAxle * this.yawRate;
	var yawSpeedRear = -cfg.cgToRearAxle * this.yawRate;

	// Calculate slip angles for front and rear wheels (a.k.a. alpha)
	var slipAngleFront = Math.atan2(this.velocity_c.y + yawSpeedFront, Math.abs(this.velocity_c.x)) - GMath.sign(this.velocity_c.x) * this.steerAngle;
	var slipAngleRear  = Math.atan2(this.velocity_c.y + yawSpeedRear,  Math.abs(this.velocity_c.x));

	var tireGripFront = cfg.tireGrip;
	var tireGripRear = cfg.tireGrip * (1.0 - this.inputs.ebrake * (1.0 - cfg.lockGrip)); // reduce rear grip when ebrake is on

	var cornerStiffnessFront = cfg.cornerStiffnessFront;
	var cornerStiffnessRear = cfg.cornerStiffnessRear;
	if (this.absVel < 2)
		cornerStiffnessFront = cornerStiffnessRear = 1.0;
	else if (this.absVel < 3)
		cornerStiffnessFront = cornerStiffnessRear = 5.0;

	var frictionForceFront_cy = GMath.clamp(-cornerStiffnessFront * slipAngleFront, -tireGripFront, tireGripFront) * axleWeightFront;
	var frictionForceRear_cy = GMath.clamp(-cornerStiffnessRear * slipAngleRear, -tireGripRear, tireGripRear) * axleWeightRear;

	//  Get amount of brake/throttle from our inputs
	var brake = Math.min(this.inputs.brake * cfg.brakeForce + this.inputs.ebrake * cfg.eBrakeForce, cfg.brakeForce);
	var throttle = this.engine_force; //this.inputs.throttle * cfg.engineForce;

	//  Resulting force in local car coordinates.
	//  This is implemented as a RWD car only.
	var tractionForce_cx = throttle - brake * GMath.sign(this.velocity_c.x);
	var tractionForce_cy = 0;

	// var 
	var dragForce_cx = -cfg.rollResist * this.velocity_c.x - cfg.airResist * this.velocity_c.x * Math.abs(this.velocity_c.x);
	var dragForce_cy = -cfg.rollResist * this.velocity_c.y - cfg.airResist * this.velocity_c.y * Math.abs(this.velocity_c.y);
	var resistances = -dragForce_cx;

	// total force in car coordinates
	var totalForce_cx = dragForce_cx + tractionForce_cx;
	var totalForce_cy = dragForce_cy + tractionForce_cy + Math.cos(this.steerAngle) * frictionForceFront_cy + frictionForceRear_cy;

	// acceleration along car axes
	this.accel_c.x = totalForce_cx / cfg.mass;  // forward/reverse accel
	this.accel_c.y = totalForce_cy / cfg.mass;  // sideways accel

	// acceleration in world coordinates
	this.accel.x = cs * this.accel_c.x - sn * this.accel_c.y;
	this.accel.y = sn * this.accel_c.x + cs * this.accel_c.y;

	// update velocity
	this.velocity.x += this.accel.x * dt;
	this.velocity.y += this.accel.y * dt;

	this.absVel = this.velocity.len();

	// calculate rotational forces
	var angularTorque = (frictionForceFront_cy + tractionForce_cy) * cfg.cgToFrontAxle - frictionForceRear_cy * cfg.cgToRearAxle;

	//  Sim gets unstable at very slow speeds, so just stop the car
	if( Math.abs(this.absVel) < 0.5 && !this.inputs.throttle )
	{
		this.velocity.x = this.velocity.y = this.absVel = 0;
		angularTorque = this.yawRate = 0;
	}

	var angularAccel = angularTorque / this.inertia;

	this.yawRate += angularAccel * dt;
	this.heading += this.yawRate * dt;

	//  finally we can update position
	this.position.x += this.velocity.x * dt;
	this.position.y += this.velocity.y * dt;

	// Pre-calc heading vector
	sn = Math.sin(this.heading);
	cs = Math.cos(this.heading);

	// Get velocity in local car coordinates
	this.velocity_c.x = cs * this.velocity.x + sn * this.velocity.y;
	this.velocity_c.y = cs * this.velocity.y - sn * this.velocity.x;

	this.speed = this.velocity_c.x; // !! TODO: nicht so gut in der kurve ..	

	//  Display some data
	this.stats.clear();  // clear this every tick otherwise it'll fill up fast
	this.stats.add('speed', this.kmh() );  // km/h
	this.stats.add('speed sideways (raw)', this.velocity_c.y)
	this.stats.add('accleration', this.accel_c.x);
	this.stats.add('yawRate', this.yawRate);
	// this.stats.add('yawSpeedFront', yawSpeedFront);
	// this.stats.add('yawSpeedRear', yawSpeedRear);
	// this.stats.add('weightFront', axleWeightFront);
	// this.stats.add('weightRear', axleWeightRear);
	// this.stats.add('slipAngleFront', slipAngleFront);
	// this.stats.add('slipAngleRear', slipAngleRear);
	// this.stats.add('frictionFront', frictionForceFront_cy);
	// this.stats.add('frictionRear', frictionForceRear_cy);
	//this.stats.add('yawSpeedRear', yawSpeedRear);
	//this.stats.add('angularTorque', angularTorque);
	this.stats.add('cornerStiffnessRear', cornerStiffnessRear);
	this.stats.add('heading', this.heading * 180 / Math.PI);
	this.stats.add('rpm', this.engine.rpm());
	this.stats.add('gear', this.gearbox.gear+1);
	this.stats.add('resistances', resistances);
	this.stats.add('consumption', this.engine.get_l100km(this.speed));

};

/**
*  Smooth Steering
*  Apply maximum steering angle change velocity.
*/
Car.prototype.applySmoothSteer = function( steerInput, dt )
{
	var steer = 0;

	if( Math.abs(steerInput) > 0.001 )
	{
		//  Move toward steering input
		steer = GMath.clamp(this.steer + steerInput * dt * 2.0, -1.0, 1.0); // -inp.right, inp.left);
	}
	else
	{
		//  No steer input - move toward centre (0)
		if( this.steer > 0 )
		{
			steer = Math.max(this.steer - dt * 1.0, 0);
		}
		else if( this.steer < 0 )
		{
			steer = Math.min(this.steer + dt * 1.0, 0);
		}
	}

	return steer;
};

/**
*  Safe Steering
*  Limit the steering angle by the speed of the car.
*  Prevents oversteer at expense of more understeer.
*/
Car.prototype.applySafeSteer = function( steerInput )
{
	var avel = Math.min(this.absVel, 250.0);  // m/s
	var steer = steerInput * (1.0 - (avel / 280.0));
	return steer;
};

/**
 *  @param dtms Delta Time in milliseconds
 */
Car.prototype.update = function( dtms )
{
	var dt = dtms / 1000.0;  // delta T in seconds
	//dt = 0.017;

	this.throttle = this.inputs.throttle;
	this.brake = this.inputs.brake;

	var steerInput = this.inputs.left - this.inputs.right;

	//  Perform filtering on steering...
	if( this.smoothSteer )
		this.steer = this.applySmoothSteer( steerInput, dt );
	else
		this.steer = steerInput;

	if( this.safeSteer )
		this.steer = this.applySafeSteer(this.steer);

	//  Now set the actual steering angle
	this.steerAngle = this.steer * this.config.maxSteer;

	//
	//  Now that the inputs have been filtered and we have our throttle,
	//  brake and steering values, perform the car physics update...
	//
	this.tick(dt);
	this.doPhysics(dt);
	this.gearbox.update_engine_speed(this.engine, this.speed, dt);
	this.consumption_monitor.tick(this.engine.get_consumption_L_s(), dt, this.speed);
};

/**
 *  @param ctx 2D rendering context (from canvas)
 */
Car.prototype.render = function( ctx )
{
	var cfg = this.config;  // shorthand reference

	ctx.save();

	ctx.translate(this.position.x, this.position.y);
	ctx.rotate(this.heading);

	// Draw car body
	ctx.beginPath();
	ctx.rect(-cfg.cgToRear, -cfg.halfWidth, cfg.cgToFront + cfg.cgToRear, cfg.halfWidth * 2.0);
	ctx.fillStyle = '#1166BB';
	ctx.fill();
	ctx.lineWidth = 0.05;  // use thin lines because everything is scaled up 25x
	ctx.strokeStyle = '#222222';
	ctx.stroke();
	ctx.closePath();

	// Draw rear wheel
	ctx.translate(-cfg.cgToRearAxle, 0);
	ctx.beginPath();
	ctx.rect(
		-cfg.wheelRadius, -cfg.wheelWidth / 2.0,
		cfg.wheelRadius * 2, cfg.wheelWidth
	);
	ctx.fillStyle = '#444444';
	ctx.fill();
	ctx.lineWidth = 0.05;
	ctx.strokeStyle = '111111';
	ctx.stroke();
	ctx.closePath();

	// Draw front wheel
	ctx.translate(cfg.cgToRearAxle + cfg.cgToFrontAxle, 0);
	ctx.rotate(this.steerAngle);
	ctx.beginPath();
	ctx.rect(
		-cfg.wheelRadius, -cfg.wheelWidth / 2.0,
		cfg.wheelRadius * 2, cfg.wheelWidth
	);
	ctx.fillStyle = '#444444';
	ctx.fill();
	ctx.lineWidth = 0.05;
	ctx.strokeStyle = '111111';
	ctx.stroke();
	ctx.closePath();

	ctx.restore();
};

module.exports = {'Car':Car};