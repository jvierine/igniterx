import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {instance}=await WebAssembly.instantiate(await readFile(new URL('../src/physics.wasm',import.meta.url)),{});
const e=instance.exports;
const config=[.5,.35,25,20,.38,273,2400,300,2,3,0,0,0];
function run(changes={}){const args=[...config];for(const [i,v] of Object.entries(changes))args[Number(i)]=v;e.calculate(...args);return new Float64Array(e.memory.buffer,e.output_ptr(),e.output_len()).slice();}
test('Rust module runs in WebAssembly with finite complete flight output',()=>{const a=run();assert.equal(a[0],1);assert.equal(a.length,34+601*22);for(const n of a)assert.ok(Number.isFinite(n));assert.ok(a[4]>4&&a[5]>a[4]);assert.ok(a[20]>=2400);});
test('3 dB power increase and noise decrease reach browser output',()=>{const a=run(),b=run({2:50}),c=run({5:546});assert.ok(Math.abs(b[11]-a[11]-3.0102999566)<1e-6);assert.ok(Math.abs(c[11]-a[11]+3.0102999566)<1e-6);});
test('ideal tracking yields exactly 10log10(5) SNR improvement',()=>{const a=run({10:1});for(let i=0;i<601;i++){const base=34+i*22;assert.ok(Math.abs(a[base+12]-a[base+11]-6.98970004)<1e-6);}});
test('beam steering, exact null, and antenna spacing affect outputs',()=>{assert.equal(e.rx_pattern(0,0,.5,0,0,1,0),5.5);assert.ok(Math.abs(e.rx_pattern(0,0,.5,0,0,1,1)-12.48970004)<1e-6);const a=run();assert.equal(e.tx_pattern(0,0,.35,a[29]),-150);const b=run({0:1});assert.notEqual(a[12],b[12]);});
test('extreme slider values, attitude change, and optimizer remain finite',()=>{for(const changes of [{0:1,1:1,2:1,3:60,4:1,5:10000,6:37500,10:1,11:1,12:120},{3:0,4:0,5:100,6:18.3},{4:-1},{3:NaN,5:Infinity}]){const a=run(changes);for(const n of a)assert.ok(Number.isFinite(n));assert.ok(a[14]>=0&&a[14]<=100.000001);}const a=run(),b=run({4:-1});assert.ok(b[12]>=a[12]-.05);});
test('Friis budget closes at every flight sample',()=>{const a=run();for(let i=0;i<601;i++){const b=34+i*22;const expected=a[24]+a[b+10]+a[b+12]-a[b+13]-3.01029995664-2;assert.ok(Math.abs(a[b+15]-expected)<1e-8);assert.ok(Math.abs(a[b+19]-(a[b+15]-a[22]))<1e-8);}});

test('2 lambda is accepted and reveals an interior grating lobe',()=>{const a=run({0:2});assert.ok(Math.abs(a[30]-2*a[17])<1e-9);const theta=Math.asin(.5);assert.ok(Math.abs(e.rx_array_factor(theta,0,2,0,0,1)-6.98970004)<1e-6);assert.ok(e.rx_pattern(theta,0,2,0,0,1,1)>11);});
test('single patch stays broad at an array interference null',()=>{const theta=Math.asin(Math.acos(-.25)/(2*Math.PI/Math.sqrt(2)));assert.ok(e.rx_pattern(theta,Math.PI/4,1,0,0,1,1)<-140);assert.ok(e.rx_pattern(theta,Math.PI/4,1,0,0,1,0)>3);});
test('three dipoles cancel at a non-axial direction while one dipole does not',()=>{const a=run({1:1});const theta=Math.asin(2/3);assert.ok(e.tx_pattern(theta,Math.PI/2,1,a[29])<-140);assert.ok(e.single_dipole(theta)>-5);assert.ok(e.tx_pattern(theta,0,1,a[29])>-10);});
