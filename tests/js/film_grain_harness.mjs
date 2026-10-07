import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../web/js/deno_film_grain.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/m, '').replace(/^export /gm, '');
const context = vm.createContext({app:{registerExtension() {}}, console});
vm.runInContext(source, context);
const run = (code) => vm.runInContext(code, context);
assert.equal(run('strengthToAmount(0)'), 0);
assert.equal(run('strengthToAmount(0.5)'), 6);
assert.equal(run('strengthToAmount(1)'), 12);
assert.equal(run('amountToStrength(6)'), .5);
assert.equal(run('amountToStrength(24)'), 2, 'legacy values must not be clamped');
assert.equal(run('isLegacyAutoSize({size:[340,591],properties:{}})'), true);
assert.equal(run('isLegacyAutoSize({size:[340,755],properties:{denoFilmGrain:{detailsOpen:true}}})'), true);
assert.equal(run('isLegacyAutoSize({size:[430,825],properties:{}})'), false, 'manual size must survive');
assert.equal(run('isLegacyAutoSize({size:[340,591],properties:{denoFilmGrain:{uiVersion:2}}})'), false);
assert.equal(source.includes('Comfy.Locale'), false, 'English must not switch to Korean with ComfyUI locale');
assert.equal(run('processingLabel(1)'), 'Low RAM');
assert.equal(run('processingLabel(2)'), 'Balanced');
assert.equal(run('processingLabel(4)'), 'Faster');
assert.equal(run('processingLabel(3)'), 'Custom (3 frames)', 'existing frame count must remain visible');
assert.equal(run('isLegacyAutoSize({size:[280,312],properties:{denoFilmGrain:{uiVersion:2}}})'), true);
assert.equal(run('isLegacyAutoSize({size:[280,424],properties:{denoFilmGrain:{uiVersion:3}}})'), false);
assert.equal(run('getPanelContentHeight({isConnected:false,offsetWidth:1,scrollHeight:1993},340)'), null);
assert.equal(run('getPanelContentHeight({isConnected:true,offsetWidth:1,scrollHeight:1993},340)'), null,
  'a transient narrow DOM must not turn a compact panel into a 2000px node');
assert.equal(run('getPanelContentHeight({isConnected:true,offsetWidth:318,scrollHeight:545},340)'), 545);
assert.equal(run('getPanelContentHeight({isConnected:true,offsetWidth:408,scrollHeight:694},430)'), 694);
run(`
const compute=()=>[0,-4],draw=()=>{};
const canonical={name:'amount',value:24,type:'hidden',hidden:true,computeSize:compute,draw};
const original={type:'number',computeSize:undefined,draw:undefined,external:false};
const node={widgets:[canonical],inputs:[{name:'amount',widget:{name:'amount'},link:null}],
 __denoGrain:{originals:new Map([['amount',original]])}};
refreshNativeLinks(node);refreshNativeLinks(node);
if(canonical.computeSize!==compute||canonical.draw!==draw)throw Error('Same-state sync changed widget identity');
if(canonical.value!==24||node.widgets.length!==1)throw Error('Canonical value/order changed');
node.inputs[0].link=17;refreshNativeLinks(node);
if(canonical.hidden||canonical.type!=='number')throw Error('Native connected input not restored');
if(!linked(node,'amount'))throw Error('Connected control authority lost');
node.inputs[0].link=null;refreshNativeLinks(node);
if(!canonical.hidden||canonical.type!=='hidden'||canonical.value!==24)throw Error('Disconnect lost value');
`);
console.log('film grain frontend contracts passed');
