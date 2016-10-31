(
s = Server.internal;
Server.default = s;
s.options.device = "MME : Analog (1-8) (RME Hammerfall DS";
s.options.numOutputBusChannels = 4;
s.boot
)

//Server.default.options.device = "Windows WDM-KS : ADAT (1-8) (Multiface ADAT (1-8))"
Server.default.options.device = "Windows WDM-KS : ADAT (1-8) (Multiface ADAT (1-8))"
Server.default.boot;

~engine_out = Bus.audio(s, 2);
{SinOsc.ar([200,300])}.play()
(
{Out.ar(~engine_out, SinOsc.ar(200))}.play;
{
	Out.ar(0, Pan4.ar(~engine_out.ar, MouseX.kr(-1,1), MouseY.kr(-1,1)));
}.play(addAction:\addToTail);
)

play({ Pan4.ar(SinOsc.ar([200,300]),  MouseX.kr(-1,1), MouseY.kr(-1,1), 0.5) });

//////////////////////////////////////////////////////////////////////
(
~bus = Bus.audio(s, 4);

~start_radio = {
	"startRadio".postln;
	~pan_out = {Out.ar(0, ~bus.ar(1, [0,2,1,3]))}.play();
	~left = {|pan = 0.0, lowerdb = 0.0| Out.ar(~bus.index, Pan2.ar(SoundIn.ar(0), pan, (-1 * lowerdb).dbamp))}.play();
	~right = {|pan = 0.0, lowerdb = 0.0| Out.ar(~bus.index+2, Pan2.ar(SoundIn.ar(1), pan, (-1 * lowerdb).dbamp))}.play();
	OSCdef(\msg_panning, {|m|
		//("pan"+m[1]).postln;
		~left.set(\pan, m[1]);
		~right.set(\pan, m[1]);
	}, '/panning');
	OSCdef(\msg_lowerdb, {|m|
		//("lowerdb"+m[1]).postln;
		~left.set(\lowerdb, m[1]);
		~right.set(\lowerdb, m[1]);
	}, '/lowerdb');
};

~stop_radio = {
	"stopRadio".postln;
	~pan_out.free;
	~left.free;
	~right.free;
	OSCdef(\msg_panning, {|m|},'/panning');
	OSCdef(\msg_lowerdb, {|m|},'/lowerdb');
};

OSCdef(\msg_startRadio, {|m|
	~start_radio.value;
}, '/startRadio');

OSCdef(\msg_stopRadio, {|m|
	~stop_radio.value;
}, '/stopRadio');

)

//////////////////////////////////////////////////////////////////////


{|pan = 0.0| Out.ar(~bus.index, Pan2.ar(SoundIn.ar(0), MouseY.kr(1,-1), 0.8))}.play();

~fedi_stream = { |db = 0.0|
	Out.ar(0, db.dbamp * ~fedi_out.ar);
}.play;

(
{Out.ar(0, ~bus.ar(1, [0,2,1,3]))}.play();
{|pan = 0| Out.ar(~bus.index, Pan2.ar(SoundIn.ar(0), MouseY.kr(1,-1), MouseX.kr(0, 1)))}.play();
{Out.ar(~bus.index+2, Pan2.ar(SoundIn.ar(1), MouseY.kr(1,-1), MouseX.kr(0,1)))}.play();
)


//Out.ar(~engine_out, engine);

ServerOptions.devices_()
Server.default.options.outDevice
~k = s.options
~k.
-3.dbamp
("test"+3).postln
3.postln

"Lautsprecher (RME Hammerfall DS"



{Out.ar(0, SinOsc.ar(200))}.play()

s.meter(2,4)
s.meter

{Out.ar(0, AudioIn.ar([1,2]))}.play()

Quarks.gui

Platform.userExtensionDir.postln
Platform.userExtensionDir.openOS
Atk.createUserSupportDir;
Atk.openUserSupportDir;