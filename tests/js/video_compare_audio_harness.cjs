const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = process.argv[2] || path.join(__dirname, '../../docs/video-compare/index.html');
const html = fs.readFileSync(filename, 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const elements = new Map();
function element(id) {
  if (elements.has(id)) return elements.get(id);
  const el = { id, muted: true, duration: 6, videoWidth: 320, videoHeight: 180,
    paused: true, ended: false, seeking: false, readyState: 4, rateWrites: [], seeks: [],
    style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} },
    buffered: { length: 0 }, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
  };
  let time = 0, rate = 1;
  Object.defineProperty(el, 'currentTime', { get: () => time, set(value) { time=value; el.seeks.push(value); } });
  Object.defineProperty(el, 'playbackRate', { get: () => rate, set(value) { rate=value; el.rateWrites.push(value); } });
  elements.set(id, el); return el;
}
const context = { console, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame() {},
  document: { getElementById: element, querySelectorAll: () => [], documentElement: {} },
  addEventListener() {}, DenoCompareExport: {},
};
context.window = context;
vm.runInNewContext(inline.replace('/* ---------- init ---------- */',
  'globalThis.hooks = { S, applyAudio, syncOther, seekAll, play, pause, loop, setAudio };\n/* ---------- init ---------- */'), context);
const { S, applyAudio, syncOther, seekAll, play, pause, loop, setAudio } = context.hooks;
const A=element('vidA'), B=element('vidB');
function reset({ratio=false, bDuration=6, audio='B'}={}) {
  Object.assign(S,{haveA:true,haveB:true,durA:6,durB:bDuration,speed:1,syncRatio:ratio,playing:true,audio,_starting:false});
  A.duration=6; B.duration=bDuration; A.ended=false; B.ended=false; A.paused=false; B.paused=false;
  A.currentTime=2; B.currentTime=ratio?2*bDuration/6:2; A.playbackRate=1; B.playbackRate=1;
  applyAudio(); clear();
}
function clear() { for(const v of [A,B]){v.rateWrites.length=0;v.seeks.length=0;} }
reset(); A.currentTime=2.08; clear();
for(let i=0;i<20;i++) syncOther(false);
assert.equal(B.rateWrites.length,0,'audible B must not receive continuous playback-rate corrections');
assert.equal(B.seeks.length,0,'audible B must not be repeatedly seeked to A');
assert.ok(A.rateWrites.length>0,'the silent A should follow B instead');
reset(); A.currentTime=2.7; clear(); syncOther(false);
assert.equal(B.seeks.length,0);assert.ok(A.seeks.length>0,'large drift correction must affect only silent A');
reset({audio:'A'}); B.currentTime=2.08; clear(); syncOther(false);
assert.equal(A.rateWrites.length,0);assert.equal(A.seeks.length,0);assert.ok(B.rateWrites.length>0);
reset({ratio:true,bDuration:3});
assert.equal(B.playbackRate,0.5,'Ratio needs the duration-adjusted base rate');
clear();syncOther(false);assert.equal(B.rateWrites.length,0);assert.equal(B.seeks.length,0);
reset({audio:'A'}); B.playbackRate=1.4;clear();setAudio('B');
assert.equal(B.playbackRate,1,'reset follower correction before unmuting B');
assert.equal(B.muted,false);assert.equal(A.muted,true);assert.equal(B.seeks.length,0);
clear();setAudio('A');assert.equal(A.playbackRate,1);assert.equal(A.muted,false);assert.equal(B.muted,true);
reset({ratio:true,bDuration:3}); seekAll(4);
assert.equal(A.currentTime,4);assert.equal(B.currentTime,2,'explicit scrub still maps B to the requested A time');
B.seeking=true;seekAll(3);assert.equal(B.currentTime,1.5,'a newer explicit scrub supersedes an in-flight seek');B.seeking=false;
reset({bDuration:3});A.currentTime=4;B.currentTime=3;B.ended=true;B.paused=true;clear();syncOther(false);loop();
assert.equal(A.seeks.length,0,'a shorter ended B must not drag A backwards');
assert.equal(B.paused,true,'do not continuously restart the ended B');
reset();S.playing=false;B.currentTime=2.3;clear();syncOther(false);
assert.equal(B.currentTime,2,'paused frame alignment is still exact');
reset({audio:'A'});S.loop=true;A.currentTime=6;A.ended=true;A.paused=true;loop();
assert.equal(A.currentTime,0);assert.equal(A.paused,false,'loop resumes an ended timeline');
reset({audio:'A'});S.loop=false;A.currentTime=6;loop();assert.equal(S.playing,false);assert.equal(A.paused,true);
console.log('video_compare_audio_harness passed');
