import wasmUrl from './physics.wasm?url';
export interface Parameters {
  rxSpacing:number; txSpacing:number; txAxial:number; power:number; zenith:number; aim:number;
  temperature:number; rate:number; offset:number; loss:number; reserve:number;
  tracking:boolean; attitude:boolean; roll:number;
}
export const defaults:Parameters={rxSpacing:0.5,txSpacing:0.35,txAxial:0,power:25,zenith:20,aim:0.38,temperature:273,rate:2400,offset:300,loss:2,reserve:3,tracking:true,attitude:false,roll:0};
export const H={version:0,count:1,cols:2,burn:3,apogeeT:4,duration:5,ve:6,mdot:7,tilt:8,azimuth:9,aim:10,mean:11,worst:12,best:13,availability:14,meanSingle:15,worstSingle:16,lambda:17,sf:18,bw:19,rate:20,snr:21,sensitivity:22,noise:23,power:24,txPeak:25,rxX:26,rxY:27,rxZ:28,txNorm:29,rxD:30,txD:31,apogee:32,reserve:33} as const;
export const C={time:0,x:1,y:2,z:3,vx:4,vy:5,vz:6,mass:7,burning:8,range:9,tx:10,rxSingle:11,rx:12,fspl:13,prSingle:14,pr:15,noise:16,sensitivity:17,marginSingle:18,margin:19,doppler:20,offAxis:21} as const;
interface Exports {rx_array_factor:(theta:number,phi:number,spacing:number,sx:number,sy:number,sz:number)=>number;single_dipole:(theta:number)=>number;memory:WebAssembly.Memory; calculate:(...args:number[])=>void;output_ptr:()=>number;output_len:()=>number;tx_pattern:(theta:number,phi:number,spacing:number,norm:number)=>number;rx_pattern:(theta:number,phi:number,spacing:number,sx:number,sy:number,sz:number,beam:number)=>number;}
export class Model {
  e!:Exports; meta!:Float64Array; rows:Float64Array[]=[];
  async init(){ const response=await fetch(wasmUrl);if(!response.ok)throw new Error(`Physics module: HTTP ${response.status}`); const result=await WebAssembly.instantiate(await response.arrayBuffer(),{});this.e=result.instance.exports as unknown as Exports; }
  calculate(p:Parameters){this.e.calculate(p.rxSpacing,p.txSpacing,p.power,p.zenith,p.aim,p.temperature,p.rate,p.offset,p.loss,p.reserve,+p.tracking,+p.attitude,p.roll);const data=new Float64Array(this.e.memory.buffer,this.e.output_ptr(),this.e.output_len()).slice();if(data[0]!==1)throw new Error('Unsupported physics ABI');this.meta=data.slice(0,34);this.rows=Array.from({length:data[1]},(_,i)=>data.subarray(34+i*data[2],34+(i+1)*data[2]));}
  sample(fraction:number){return this.rows[Math.round(Math.max(0,Math.min(1,fraction))*(this.rows.length-1))];}
  rx(theta:number,phi:number,p:Parameters,steer:number[],beam:boolean){return this.e.rx_pattern(theta,phi,p.rxSpacing,...steer as [number,number,number],+beam);}
  rxFactor(theta:number,phi:number,p:Parameters,steer:number[]){return this.e.rx_array_factor(theta,phi,p.rxSpacing,...steer as [number,number,number]);}
  single(theta:number){return this.e.single_dipole(theta);}
  tx(theta:number,phi:number,p:Parameters){return this.e.tx_pattern(theta,phi,p.txSpacing,this.meta[H.txNorm]);}
}
