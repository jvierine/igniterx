import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {C,H,Model,Parameters} from './model';
const teal=0x70e4bf, orange=0xffaf7d;
export const world=(x:number,y:number,z:number)=>new T.Vector3(x/1000,z/1000,-y/1000);
function line(points:T.Vector3[],color:number,opacity=1){return new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));}
function mesh(geo:T.BufferGeometry,color:number,roughness=0.7){return new T.Mesh(geo,new T.MeshStandardMaterial({color,roughness,metalness:0.25}));}
function disposeGroup(g:T.Group){for(const c of [...g.children]){g.remove(c);c.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});}}
function mountRenderer(host:HTMLElement){const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setClearColor(0x0a151d,0);host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive 3D visualization. Drag to rotate, scroll to zoom.');return renderer;}
export class Mission {
  scene=new T.Scene();camera=new T.PerspectiveCamera(43,1,0.01,60);renderer:T.WebGLRenderer;controls:OrbitControls;
  dynamic=new T.Group();rocket=new T.Group();array=new T.Group();beam!:T.Line;reference!:T.Line;
  rx=new T.Vector3();normal=new T.Vector3();lobe=new T.Group();trajectory?:T.Line;labels:{el:HTMLDivElement,pos:T.Vector3}[]=[];
  m!:Model;p!:Parameters;selected=0.3;displayLobe=false;fpsActive=true;lastLobe=0;
  constructor(public host:HTMLElement,onScrub:(f:number)=>void){
    this.renderer=mountRenderer(host);this.scene.fog=new T.FogExp2(0x0a151d,0.045);this.scene.add(new T.AmbientLight(0xc2e4ed,1.5));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(2,6,3);this.scene.add(sun);
    this.scene.add(this.dynamic,this.rocket,this.array,this.lobe);
    this.camera.position.set(5.8,4.1,6.4);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0.6,1.2,0);this.controls.enableDamping=true;this.controls.minDistance=0.4;this.controls.maxDistance=25;this.controls.maxPolarAngle=Math.PI/2+0.2;
    this.terrain();this.makeRocket();
    new ResizeObserver(()=>this.resize()).observe(host);
    let down={x:0,y:0};this.renderer.domElement.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>5||!this.trajectory)return;const r=this.renderer.domElement.getBoundingClientRect();const ray=new T.Raycaster();ray.params.Line={threshold:0.065};ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);const hit=ray.intersectObject(this.trajectory)[0];if(hit?.index!==undefined)onScrub(hit.index/(this.m.rows.length-1));});
    const observer=new IntersectionObserver(entries=>this.fpsActive=entries[0].isIntersecting);observer.observe(host);
    const animate=()=>{requestAnimationFrame(animate);if(!this.fpsActive||document.hidden)return;this.controls.update();this.renderer.render(this.scene,this.camera);this.labels.forEach(({el,pos})=>{const p=pos.clone().project(this.camera);el.style.transform=`translate(${(p.x*.5+.5)*host.clientWidth}px,${(-p.y*.5+.5)*host.clientHeight}px)`;el.style.visibility=p.z>1||p.z< -1?'hidden':'visible';});};animate();
  }
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;this.camera.aspect=w/Math.max(h,1);this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
  terrain(){
    const ocean=mesh(new T.PlaneGeometry(30,30),0x0a202b);ocean.rotation.x=-Math.PI/2;ocean.position.y=-.012;this.scene.add(ocean);
    const shape=new T.Shape();const coast:[[number,number],...[number,number][]]=[[-8,-8],[-8,8],[-.4,8],[.15,5],[-.05,3],[.12,1.4],[.25,0],[.18,-1],[.4,-3],[-.15,-5],[-.5,-8]];coast.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();const land=mesh(new T.ShapeGeometry(shape),0x142b30);land.rotation.x=-Math.PI/2;land.position.y=-.006;this.scene.add(land);
    this.scene.add(line(coast.slice(2).map(([x,z])=>new T.Vector3(x,0,-z)),0x406763,.65));
    const grid=new T.GridHelper(12,24,0x2b484f,0x213a42);grid.position.y=.004;(grid.material as T.Material).transparent=true;(grid.material as T.Material).opacity=.28;this.scene.add(grid);
    for(let i=0;i<16;i++){const h=.16+.16*(.5+.5*Math.sin(i*5.5));const mountain=mesh(new T.ConeGeometry(.32+.22*(.5+.5*Math.sin(i*3.6)),h,5),0x1b3439);mountain.position.set(-1.2-((i*1.71)%4),h/2-.015,-4+(i*.69)%8);mountain.rotation.y=i;this.scene.add(mountain);}
    const pad=mesh(new T.CylinderGeometry(.09,.09,.016,32),0x647985);pad.position.y=.008;this.scene.add(pad);const ring=mesh(new T.TorusGeometry(.135,.002,6,48),0x7f9aaa);ring.rotation.x=-Math.PI/2;ring.position.y=.025;this.scene.add(ring);
    const rail=mesh(new T.BoxGeometry(.008,.14,.008),0x728f9c);rail.position.set(.028,.073,0);rail.rotation.z=-20*Math.PI/180;this.scene.add(rail);
    for(const [x,z] of [[-.22,.16],[-.31,.16],[-.4,.16]]){const building=mesh(new T.BoxGeometry(.065,.035,.08),0x425b62);building.position.set(x,.018,z);this.scene.add(building);}
    const axis=line([new T.Vector3(-.8,.015,.6),new T.Vector3(-.8,.015,-.05)],0x92adb8,.5);this.scene.add(axis);
    const arrow=new T.ArrowHelper(new T.Vector3(0,0,-1),new T.Vector3(-.8,.025,.2),.28,0x92adb8,.05,.025);this.scene.add(arrow);
    this.addLabel('ANDØYA · PAD',new T.Vector3(0,.09,0),'pad');this.addLabel('DOWNRANGE · NW',new T.Vector3(-.8,.02,-.15),'compass');
  }
  addLabel(text:string,pos:T.Vector3,kind:string){const el=document.createElement('div');el.className=`world-label ${kind}`;el.textContent=text;this.host.append(el);this.labels.push({el,pos});return this.labels[this.labels.length-1];}
  makeRocket(){const body=mesh(new T.CylinderGeometry(.013,.013,.105,12),0xe4efed);this.rocket.add(body);const nose=mesh(new T.ConeGeometry(.013,.04,12),0xffaf7d);nose.position.y=.072;this.rocket.add(nose);for(let i=0;i<3;i++){const phi=2*Math.PI*i/3;const fin=mesh(new T.BoxGeometry(.034,.025,.003),0x7498a5);fin.position.set(.016*Math.cos(phi),-.044,.016*Math.sin(phi));fin.rotation.y=-phi;this.rocket.add(fin);const dipole=line([new T.Vector3(.022*Math.cos(phi),.045,.022*Math.sin(phi)),new T.Vector3(.022*Math.cos(phi),.085,.022*Math.sin(phi))],0xffbd8e);this.rocket.add(dipole);}
    const flame=new T.Mesh(new T.ConeGeometry(.013,.09,8),new T.MeshBasicMaterial({color:orange,transparent:true,opacity:.75}));flame.name='flame';flame.rotation.z=Math.PI;flame.position.y=-.098;this.rocket.add(flame);
  }
  build(m:Model,p:Parameters){this.m=m;this.p={...p};disposeGroup(this.dynamic);disposeGroup(this.array);this.rx=world(m.meta[H.rxX],m.meta[H.rxY],m.meta[H.rxZ]);const ref=m.sample(m.meta[H.aim]);const refpos=world(ref[C.x],ref[C.y],ref[C.z]);this.normal=refpos.clone().sub(this.rx).normalize();
    const geo=new T.BufferGeometry().setFromPoints(m.rows.map(r=>world(r[C.x],r[C.y],r[C.z])));const colors=new Float32Array(m.rows.length*3);m.rows.forEach((r,i)=>{const col=new T.Color(r[C.burning]?orange:r[C.margin]<0?0xf18379:teal);colors.set([col.r,col.g,col.b],i*3);});geo.setAttribute('color',new T.BufferAttribute(colors,3));this.trajectory=new T.Line(geo,new T.LineBasicMaterial({vertexColors:true}));this.dynamic.add(this.trajectory);
    const groundpath=m.rows.filter((_,i)=>i%5===0).map(r=>world(r[C.x],r[C.y],3));const shadow=new T.Line(new T.BufferGeometry().setFromPoints(groundpath),new T.LineDashedMaterial({color:0x4a7180,dashSize:.025,gapSize:.04,transparent:true,opacity:.5}));shadow.computeLineDistances();this.dynamic.add(shadow);
    for(let i=1;i<=3;i++){const alt=line([new T.Vector3(-.08,i,0),new T.Vector3(.08,i,0)],0x406673,.5);this.dynamic.add(alt);}
    const apogee=m.sample(m.meta[H.apogeeT]/m.meta[H.duration]);const apos=world(apogee[C.x],apogee[C.y],apogee[C.z]);this.dynamic.add(line([apos,apos.clone().setY(0)],0x48616c,.18));
    this.reference=new T.Line(new T.BufferGeometry().setFromPoints([this.rx,refpos]),new T.LineDashedMaterial({color:orange,dashSize:.03,gapSize:.035,transparent:true,opacity:.4}));this.reference.computeLineDistances();this.dynamic.add(this.reference);
    const refmarker=new T.Mesh(new T.SphereGeometry(.032,12,8),new T.MeshBasicMaterial({color:orange}));refmarker.position.copy(refpos);this.dynamic.add(refmarker);
    this.beam=line([this.rx,new T.Vector3()],teal,.6);this.dynamic.add(this.beam);
    const board=mesh(new T.BoxGeometry(.23,.009,.23),0x233d48);this.array.add(board);
    const distance=.052*p.rxSpacing/.5;for(const [x,z] of [[0,0],[distance,0],[-distance,0],[0,distance],[0,-distance]]){const patch=mesh(new T.BoxGeometry(.041,.008,.041),0xd7b779);patch.position.set(x,.009,z);this.array.add(patch);}
    this.array.position.copy(this.rx);this.array.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),this.normal);const mast=mesh(new T.CylinderGeometry(.006,.006,.065,8),0x5b8290);mast.position.copy(this.rx).add(new T.Vector3(0,-.024,0));this.dynamic.add(mast);
    const find=(kind:string)=>this.labels.find(l=>l.el.classList.contains(kind));let a=find('array');if(!a)a=this.addLabel('5-CH RX · KRAKENSDR',this.rx,'array');a.pos=this.rx.clone().add(new T.Vector3(0,.12,0));let ap=find('apogee');if(!ap)ap=this.addLabel('APOGEE · 3,000 m',apos,'apogee');ap.pos=apos.clone().add(new T.Vector3(0,.12,0));
    this.select(this.selected);this.makeLobe();
  }
  select(f:number){this.selected=f;if(!this.m)return;const r=this.m.sample(f);const pos=world(r[C.x],r[C.y],r[C.z]);this.rocket.position.copy(pos);let direction=new T.Vector3(Math.sin(this.p.zenith*Math.PI/180),Math.cos(this.p.zenith*Math.PI/180),0);if(this.p.attitude&&Math.hypot(r[C.vx],r[C.vy],r[C.vz])>1)direction=world(r[C.vx],r[C.vy],r[C.vz]).normalize();this.rocket.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);this.rocket.getObjectByName('flame')!.visible=!!r[C.burning];
    const attr=this.beam.geometry.getAttribute('position');attr.setXYZ(1,pos.x,pos.y,pos.z);attr.needsUpdate=true;this.beam.geometry.computeBoundingSphere();
    (this.beam.material as T.LineBasicMaterial).color.setHex(r[C.margin]>=0?teal:0xf18379);
    if(this.displayLobe&&this.p.tracking&&performance.now()-this.lastLobe>100)this.makeLobe();
  }
  steerLocal(){const r=this.m.sample(this.selected);const d=new T.Vector3(r[C.x]-this.m.meta[H.rxX],r[C.y]-this.m.meta[H.rxY],r[C.z]-this.m.meta[H.rxZ]).normalize();const ref=this.m.sample(this.m.meta[H.aim]);const n=new T.Vector3(ref[C.x]-this.m.meta[H.rxX],ref[C.y]-this.m.meta[H.rxY],ref[C.z]-this.m.meta[H.rxZ]).normalize();const helper=Math.abs(n.z)>.95?new T.Vector3(0,1,0):new T.Vector3(0,0,1);const u=helper.clone().cross(n).normalize(),v=n.clone().cross(u).normalize();return this.p.tracking?[d.dot(u),d.dot(v),d.dot(n)]:[0,0,1];}
  makeLobe(){disposeGroup(this.lobe);this.lastLobe=performance.now();if(!this.m||!this.displayLobe)return;const steer=this.steerLocal();const geo=patternGeometry((theta,phi)=>this.m.rx(theta,phi,this.p,steer,true),12.49,1.1,true);const body=new T.Mesh(geo,new T.MeshBasicMaterial({color:teal,wireframe:true,transparent:true,opacity:.1,depthWrite:false}));body.position.copy(this.rx);
    // Pattern coordinates use x/y in the patch plane and z along its normal.
    const ref=this.m.sample(this.m.meta[H.aim]);const n=new T.Vector3(ref[C.x]-this.m.meta[H.rxX],ref[C.y]-this.m.meta[H.rxY],ref[C.z]-this.m.meta[H.rxZ]).normalize();const helper=Math.abs(n.z)>.95?new T.Vector3(0,1,0):new T.Vector3(0,0,1);const u=helper.clone().cross(n).normalize(),v=n.clone().cross(u).normalize();const conv=(d:T.Vector3)=>new T.Vector3(d.x,d.z,-d.y);const matrix=new T.Matrix4().makeBasis(conv(u),conv(v),conv(n));body.quaternion.setFromRotationMatrix(matrix);this.lobe.add(body);
  }
  reset(){this.camera.position.set(5.8,4.1,6.4);this.controls.target.set(.6,1.2,0);this.controls.update();}
  side(){this.camera.position.set(1.3,2.6,8.5);this.controls.target.set(1.3,1.3,0);this.controls.update();}
}
function patternGeometry(gain:(theta:number,phi:number)=>number,peak:number,scale=1,powerRadius=false){
  const nt=64,np=96;const pos:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let ti=0;ti<=nt;ti++){const theta=Math.PI*ti/nt;for(let pi=0;pi<=np;pi++){const phi=2*Math.PI*pi/np;const g=gain(theta,phi);const relative=Math.max(0,Math.min(1,Math.pow(10,(g-peak)/10)));const r=scale*(powerRadius?Math.sqrt(relative):Math.max(0,(g-(peak-30))/30));const col=new T.Color().setHSL(.46-.37*relative,.6,.2+.38*relative);pos.push(r*Math.sin(theta)*Math.cos(phi),r*Math.sin(theta)*Math.sin(phi),r*Math.cos(theta));colors.push(col.r,col.g,col.b);if(ti<nt&&pi<np){const a=ti*(np+1)+pi,b=a+np+1;indices.push(a,b,a+1,b,b+1,a+1);}}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
export class PatternView {
  scene=new T.Scene();camera=new T.PerspectiveCamera(40,1,.01,20);renderer:T.WebGLRenderer;controls:OrbitControls;group=new T.Group();visible=true;
  constructor(public host:HTMLElement){this.renderer=mountRenderer(host);this.scene.add(this.group,new T.AmbientLight(0xffffff,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(3,4,5);this.scene.add(light);this.camera.up.set(0,0,1);this.camera.position.set(2.4,-2.7,1.8);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.minDistance=1.6;this.controls.maxDistance=6;new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/Math.max(1,h);this.camera.updateProjectionMatrix();}).observe(host);new IntersectionObserver(e=>this.visible=e[0].isIntersecting).observe(host);
    const animate=()=>{requestAnimationFrame(animate);if(!this.visible||document.hidden)return;this.controls.update();this.renderer.render(this.scene,this.camera);};animate();
  }
  build(m:Model,p:Parameters,steer:number[],rx:boolean){disposeGroup(this.group);const gain=(t:number,ph:number)=>rx?m.rx(t,ph,p,steer,true):m.tx(t,ph,p);const peak=rx?12.4897:m.meta[H.txPeak];const geo=patternGeometry(gain,peak);const body=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.55,metalness:.15,transparent:true,opacity:.88}));this.group.add(body);
    const wire=new T.Mesh(geo.clone(),new T.MeshBasicMaterial({color:rx?teal:orange,wireframe:true,transparent:true,opacity:.055}));this.group.add(wire);
    if(rx){const baseline=new T.Mesh(patternGeometry((t,ph)=>m.rx(t,ph,p,steer,false),peak),new T.MeshBasicMaterial({color:0x7996a4,wireframe:true,transparent:true,opacity:.15}));this.group.add(baseline);const plane=mesh(new T.BoxGeometry(.33,.33,.015),0x1a3440);plane.position.z=-.02;this.group.add(plane);const spacing=.10*p.rxSpacing/.5;for(const [x,y] of [[0,0],[spacing,0],[-spacing,0],[0,spacing],[0,-spacing]]){const patch=mesh(new T.BoxGeometry(.065,.065,.02),0xbda370);patch.position.set(x,y,0);this.group.add(patch);}}
    else{const spacing=.16*p.txSpacing/.35;for(let i=0;i<3;i++){const a=i*2*Math.PI/3;const d=line([new T.Vector3(spacing*Math.cos(a),spacing*Math.sin(a),-.14),new T.Vector3(spacing*Math.cos(a),spacing*Math.sin(a),.14)],orange);this.group.add(d);}}
    this.group.add(line([new T.Vector3(0,0,-1.2),new T.Vector3(0,0,1.3)],0x78939f,.3));const ring=new T.LineLoop(new T.BufferGeometry().setFromPoints(Array.from({length:96},(_,i)=>new T.Vector3(1.15*Math.cos(i*Math.PI/48),1.15*Math.sin(i*Math.PI/48),0))),new T.LineBasicMaterial({color:0x31505c,transparent:true,opacity:.4}));this.group.add(ring);
  }
}
