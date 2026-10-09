import {C,H,Model,Parameters} from './model';
const NS='http://www.w3.org/2000/svg';
function el(tag:string,attrs:Record<string,string|number>,content=''){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));n.textContent=content;return n;}
function line(points:number[][]){return points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');}
export class LinkChart {
  cursor!:SVGLineElement; dot!:SVGCircleElement;svg:SVGSVGElement; bounds={left:58,right:976,top:24,bottom:206};low=0;high=60;model!:Model;
  constructor(host:HTMLElement,onScrub:(f:number)=>void){this.svg=el('svg',{viewBox:'0 0 1000 248',role:'img','aria-label':'Link margin along the rocket flight, beamformed and single patch'}) as SVGSVGElement;host.append(this.svg);let dragging=false;const scrub=(e:PointerEvent)=>{const r=this.svg.getBoundingClientRect();onScrub(Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*1000-58)/918)));};this.svg.addEventListener('pointerdown',e=>{dragging=true;this.svg.setPointerCapture(e.pointerId);scrub(e);});this.svg.addEventListener('pointermove',e=>{if(dragging)scrub(e);});this.svg.addEventListener('pointerup',()=>dragging=false);}
  draw(m:Model){this.model=m;this.svg.replaceChildren();const b=this.bounds;
    const raw=m.rows.flatMap(r=>[r[C.margin],r[C.marginSingle]]);this.low=Math.floor(Math.min(-5,...raw)/10)*10;this.high=Math.ceil(Math.max(10,...raw)/10)*10;
    const y=(v:number)=>b.bottom-(v-this.low)/(this.high-this.low)*(b.bottom-b.top);const x=(t:number)=>b.left+t/m.meta[H.duration]*(b.right-b.left);
    const defs=el('defs',{});const grad=el('linearGradient',{id:'chart-fill',x1:'0',y1:'0',x2:'0',y2:'1'});grad.append(el('stop',{offset:'0%','stop-color':'#65e4bd','stop-opacity':0.16}),el('stop',{offset:'100%','stop-color':'#65e4bd','stop-opacity':0}));defs.append(grad);this.svg.append(defs);
    this.svg.append(el('rect',{x:b.left,y:y(0),width:b.right-b.left,height:Math.max(0,b.bottom-y(0)),fill:'#fa987a','fill-opacity':0.045}));
    for(let v=this.low;v<=this.high;v+=10){this.svg.append(el('line',{x1:b.left,y1:y(v),x2:b.right,y2:y(v),stroke:v===0?'#815b52':'#1a2b35','stroke-dasharray':v===0?'5 5':'0'}),el('text',{x:b.left-14,y:y(v)+4,'text-anchor':'end',fill:'#708b9a','font-size':11},`${v}`));}
    this.svg.append(el('text',{x:12,y:15,fill:'#708b9a','font-size':10},'dB'));
    for(let i=0;i<=6;i++){const t=i*m.meta[H.duration]/6;this.svg.append(el('text',{x:x(t),y:233,'text-anchor':'middle',fill:'#708b9a','font-size':11},`${t.toFixed(0)} s`));}
    const beam=m.rows.map(r=>[x(r[C.time]),y(r[C.margin])]);const single=m.rows.map(r=>[x(r[C.time]),y(r[C.marginSingle])]);
    this.svg.append(el('path',{d:line(beam)+` L${b.right},${b.bottom} L${b.left},${b.bottom} Z`,fill:'url(#chart-fill)'}));
    this.svg.append(el('path',{d:line(single),fill:'none',stroke:'#718a99','stroke-width':1.8,'stroke-dasharray':'5 5'}),el('path',{d:line(beam),fill:'none',stroke:'#70e4bf','stroke-width':2.3}));
    for(const [t,label,color] of [[m.meta[H.burn],'BURNOUT','#ffb183'],[m.meta[H.apogeeT],'APOGEE','#91bacd']] as const){this.svg.append(el('line',{x1:x(t),y1:b.top,x2:x(t),y2:b.bottom,stroke:color,'stroke-opacity':0.25,'stroke-dasharray':'3 6'}),el('text',{x:x(t)+6,y:b.top-6,fill:color,'font-size':9,'letter-spacing':1},label));}
    const ref=x(m.meta[H.duration]*m.meta[H.aim]);this.svg.append(el('path',{d:`M${ref-4},${b.bottom+2} L${ref+4},${b.bottom+2} L${ref},${b.bottom+9} Z`,fill:'#ffb183'}));
    const mean=y(m.meta[H.mean]);this.svg.append(el('line',{x1:b.left,y1:mean,x2:b.right,y2:mean,stroke:'#70e4bf','stroke-opacity':0.3,'stroke-dasharray':'2 6'}));
    this.cursor=el('line',{x1:0,y1:b.top,x2:0,y2:b.bottom,stroke:'#d5efed','stroke-opacity':0.6}) as SVGLineElement;this.dot=el('circle',{cx:0,cy:0,r:4,fill:'#70e4bf',stroke:'#0c1922','stroke-width':2}) as SVGCircleElement;this.svg.append(this.cursor,this.dot);
  }
  select(f:number){if(!this.model)return;const x=58+f*918;this.cursor.setAttribute('x1',String(x));this.cursor.setAttribute('x2',String(x));const r=this.model.sample(f);this.dot.setAttribute('cx',String(x));this.dot.setAttribute('cy',String(206-(r[C.margin]-this.low)/(this.high-this.low)*182));}
}
export function polar(host:HTMLElement,model:Model,p:Parameters,steer:number[],isRx:boolean){
  const svg=el('svg',{viewBox:'0 0 280 240',role:'img','aria-label':isRx?'Receiver gain elevation cut, absolute dBi':'Three dipole gain elevation cuts, absolute dBi'});const cx=140,cy=117,radius=86;const ceiling=isRx?15:10;const floor=-30;
  for(const v of [-30,-20,-10,0,ceiling]){const r=(v-floor)/(ceiling-floor)*radius;if(r>0)svg.append(el('circle',{cx,cy,r,fill:'none',stroke:'#223640','stroke-width':0.65}));svg.append(el('text',{x:cx+4,y:cy-r+11,fill:'#688493','font-size':8},`${v}`));}
  for(const a of [0,45,90,135,180,225,270,315]){const t=a*Math.PI/180;svg.append(el('line',{x1:cx,y1:cy,x2:cx+radius*Math.sin(t),y2:cy-radius*Math.cos(t),stroke:'#223640','stroke-width':0.65}));if(a%90===0)svg.append(el('text',{x:cx+(radius+16)*Math.sin(t),y:cy-(radius+16)*Math.cos(t)+4,'text-anchor':'middle',fill:'#688493','font-size':9},`${a}°`));}
  const paths=[false,true].map(beam=>{const pts:number[][]=[];for(let i=0;i<=360;i++){const t=i*Math.PI/180;const gain=isRx?model.rx(t,0,p,steer,beam):model.tx(t,beam?Math.PI/2:0,p);const r=(Math.max(floor,gain)-floor)/(ceiling-floor)*radius;pts.push([cx+r*Math.sin(t),cy-r*Math.cos(t)]);}return line(pts);});
  svg.append(el('path',{d:paths[0],fill:isRx?'none':'#ffaa78','fill-opacity':0.045,stroke:isRx?'#7c96a4':'#ffaa78','stroke-width':1.7,'stroke-dasharray':isRx?'4 4':'0'}),el('path',{d:paths[1],fill:isRx?'#70e4bf':'none','fill-opacity':0.06,stroke:isRx?'#70e4bf':'#ffcdae','stroke-width':1.8,'stroke-dasharray':isRx?'0':'4 4'}));
  svg.append(el('text',{x:140,y:234,'text-anchor':'middle',fill:'#78909d','font-size':9},isRx?'0° = patch normal · dBi · −30 dBi floor':'0° = rocket axis · dBi · −30 dBi floor'));host.replaceChildren(svg);
}
