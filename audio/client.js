var buffer = require('buffer');
var toBuffer = require('blob-to-buffer')
var baseClient = require('../base/client');
var encode = require('./encode');
ui = require('./ui');

var mkRecorder = function() {
  return {
    recording: false
  }
}

// GLOBAL STATE
entryLog = [];
var recorder = mkRecorder();
rec = recorder;
var bar;


// Debugging stuff
go = function() {
  startRecord(rec);
}

stop = function() {
  console.log('len: ', rec.length);
  console.log('buffers: ', rec.buffers.length)
  var array = stopRecord(rec);

  // Send it to server
  io.output.handle({
    tag: 'binary',
    buffer: array,
  })
}

play = function() {
  var audioBuffer = mkBuffer(rec);

  var source = rec.context.createBufferSource();

  source.buffer = audioBuffer;
  source.connect(rec.context.destination);
  source.start();
}
//////////////////

// reset buffers, enable recording flag
var startRecord = function(rec) {
  rec.buffers = [];
  rec.length = 0;
  rec.recording = true;
}

// merge buffers, disable recording flags, return merged buffer
var stopRecord = function(rec) {
  console.log(rec);
  rec.recording = false;

  var output = new Float32Array(rec.length);
  var offset = 0;
  for (var i = 0; i < rec.buffers.length; i++) {
    output.set(rec.buffers[i], offset);
    offset += rec.buffers[i].length;
  }
  rec.output = output;
  return output;
}

var mkBuffer = function(rec) {
  var context = rec.context;
  var arrayBuffer = context.createBuffer(1, rec.length, context.sampleRate);
  var channel = arrayBuffer.getChannelData(0);
  channel.set(rec.output, 0);

  return arrayBuffer;
}


var recorderProcess = function(e) {
  if (!recorder.recording) return;

  console.log('proc');

  var b = e.inputBuffer.getChannelData(0);
  var rb = new Float32Array(b.length);
  rb.set(b, 0);
  recorder.buffers.push(rb);
  recorder.length += rb.length;
}

var initStream = function(context) {
  return function(stream) {
    console.log('stream: ', stream);
    var microphone = context.createMediaStreamSource(stream);

    microphone.connect(recorder.node);

    recorder.node.connect(context.destination);
  }
}

var io;

var handleMessage = function(msg) {

  toBuffer(msg.buffer, function(err, buffer) {

    var entry = encode.decode(buffer);
    console.log('header: ', entry.header);

    var arr = encode.decodeAudio(entry.buffer);

    entry.audio = arr;

    entryLog.push(entry);
    ui.addEntry(bar, entry.header);

    rec.length = arr.length;
    rec.output = arr;
    play();
  });
}

var init = function() {

  io = baseClient(2222);

  bar = ui.makeBar();

  io.input.add({
    binary: handleMessage,
  });

  navigator.getUserMedia = (navigator.getUserMedia ||
                            navigator.webkitGetUserMedia ||
                            navigator.mozGetUserMedia ||
                            navigator.msGetUserMedia);

  if (navigator.getUserMedia) {
    window.AudioContext = window.AudioContext ||
                          window.webkitAudioContext;

    var context = new AudioContext();
    recorder.context = context;
    var bufferLen = 4096;
    var numChannels = 1;

    recorder.node = context.createScriptProcessor(
      bufferLen, numChannels, numChannels);

    recorder.node.onaudioprocess = recorderProcess;

    navigator.getUserMedia({audio: true}, initStream(context),
      function(error){
        console.log('error: ', error)
    });

  } else {
     console.log("getUserMedia not supported?");
  }
}

module.exports = init;
