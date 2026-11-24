(function(){
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function mkRng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* ---------- save ---------- */
const SAVE_KEY='splashrush_v1';
let save={coins:0,unlocked:1,stars:{},ownF:[0],ownR:[0,6],selF:0,selR:6,selG:'g',selH:0,selHC:0,selSk:1,mute:false};
try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));if(s)Object.assign(save,s)}catch(e){}
function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save))}catch(e){}}

/* ---------- audio ---------- */
let AC=null;
function ac(){if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}return AC}
function tone(f,d,type,v,slide,delay){
  if(save.mute)return;const a=ac();if(!a)return;
  try{const t=a.currentTime+(delay||0);const o=a.createOscillator(),g=a.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);
  g.gain.setValueAtTime(v||.12,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+d+.03);}catch(e){}
}
const SFX={
  coin(){tone(900,.09,'square',.06,500)},
  hit(){tone(180,.3,'sawtooth',.18,-140);tone(90,.35,'square',.12,-40)},
  pup(){[520,660,880].forEach((f,i)=>tone(f,.12,'triangle',.12,0,i*.07))},
  boost(){tone(300,.5,'sawtooth',.08,900)},
  jump(){tone(260,.35,'triangle',.12,500)},
  land(){tone(120,.15,'sine',.2,-60)},
  beep(){tone(520,.15,'square',.08)},
  go(){tone(880,.45,'square',.1)},
  win(){[523,659,784,1047].forEach((f,i)=>tone(f,.2,'triangle',.14,0,i*.12))},
  lose(){[400,300,220].forEach((f,i)=>tone(f,.25,'sawtooth',.1,0,i*.15))},
  smash(){tone(500,.2,'square',.1,-300);tone(250,.3,'sawtooth',.1,-150)}
};

/* ---------- three setup ---------- */
const canvas=$('c3d'),fx=$('fx'),fctx=fx.getContext('2d');
const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(62,1,0.3,1400);
const hemi=new THREE.HemisphereLight(0xffffff,0x888888,0.95);scene.add(hemi);
const sunL=new THREE.DirectionalLight(0xffffff,0.85);sunL.position.set(-40,80,50);scene.add(sunL);
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();fx.width=w;fx.height=h;}
window.addEventListener('resize',resize);resize();

const domeMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
 uniforms:{top:{value:new THREE.Color()},bot:{value:new THREE.Color()}},
 vertexShader:'varying float vy;void main(){vy=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
 fragmentShader:'uniform vec3 top;uniform vec3 bot;varying float vy;void main(){float t=smoothstep(-0.02,0.65,vy);gl_FragColor=vec4(mix(bot,top,t),1.0);}'});
const dome=new THREE.Mesh(new THREE.SphereGeometry(900,16,12),domeMat);dome.frustumCulled=false;dome.renderOrder=-2;scene.add(dome);
const sunMesh=new THREE.Mesh(new THREE.SphereGeometry(46,16,12),new THREE.MeshBasicMaterial({color:0xfff2c0,fog:false}));sunMesh.frustumCulled=false;scene.add(sunMesh);

/* ---------- geometry batching ---------- */
const GC={};
function gget(k,mk){return GC[k]||(GC[k]=mk())}
function nonIdx(g){const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();return n}
const G={
 box:()=>gget('box',()=>nonIdx(new THREE.BoxGeometry(1,1,1))),
 cyl:s=>gget('cyl'+s,()=>nonIdx(new THREE.CylinderGeometry(1,1,1,s))),
 cone:s=>gget('cone'+s,()=>nonIdx(new THREE.ConeGeometry(1,1,s))),
 sph:s=>gget('sph'+s,()=>nonIdx(new THREE.SphereGeometry(1,s,Math.max(4,s>>1)))),
 tcyl:(a,b,s)=>gget('t'+a+'_'+b+'_'+s,()=>nonIdx(new THREE.CylinderGeometry(a,b,1,s))),
 torus:()=>gget('torus',()=>{const g=new THREE.TorusGeometry(0.95,0.34,9,22);g.rotateX(Math.PI/2);return nonIdx(g)})
};
const _q=new THREE.Quaternion(),_e=new THREE.Euler(),_m=new THREE.Matrix4(),_nm=new THREE.Matrix3(),_v=new THREE.Vector3(),_s=new THREE.Vector3(),_t=new THREE.Vector3(),_c=new THREE.Color();
const MAT_V=new THREE.MeshLambertMaterial({vertexColors:true});
class Batch{
 constructor(){this.p=[];this.n=[];this.c=[]}
 add(g,x,y,z,col,sx,sy,sz,rx,ry,rz,cf){
  sx=sx===undefined?1:sx;sy=sy===undefined?1:sy;sz=sz===undefined?1:sz;rx=rx||0;ry=ry||0;rz=rz||0;
  _q.setFromEuler(_e.set(rx,ry,rz));_m.compose(_v.set(x,y,z),_q,_s.set(sx,sy,sz));_nm.getNormalMatrix(_m);
  const pa=g.attributes.position.array,na=g.attributes.normal.array;
  _c.set(col);const cr=_c.r,cg=_c.g,cb=_c.b;
  for(let i=0;i<pa.length;i+=3){
   _t.set(pa[i],pa[i+1],pa[i+2]);
   if(cf){_c.set(cf(pa[i],pa[i+1],pa[i+2]));this.c.push(_c.r,_c.g,_c.b)}else this.c.push(cr,cg,cb);
   _t.applyMatrix4(_m);this.p.push(_t.x,_t.y,_t.z);
   _t.set(na[i],na[i+1],na[i+2]).applyMatrix3(_nm).normalize();this.n.push(_t.x,_t.y,_t.z);
  }
 }
 box(x,y,z,w,h,d,col,ry){this.add(G.box(),x,y+h/2,z,col,w,h,d,0,ry||0,0)}
 cyl(x,y,z,r,h,col,seg){this.add(G.cyl(seg||10),x,y+h/2,z,col,r,h,r)}
 cone(x,y,z,r,h,col,seg,ry){this.add(G.cone(seg||8),x,y+h/2,z,col,r,h,r,0,ry||0,0)}
 sph(x,y,z,r,col,seg,sy){this.add(G.sph(seg||8),x,y,z,col,r,r*(sy||1),r)}
 tcyl(x,y,z,rt,rb,h,col,seg){this.add(G.tcyl(rt,rb,seg||8),x,y+h/2,z,col,1,h,1)}
 build(mat){const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.computeBoundingSphere();return new THREE.Mesh(g,mat||MAT_V)}
}

/* ---------- levels ---------- */
const LEVELS=[
 {id:'sg',name:'Singapore',flag:'🇸🇬',sub:'Marina Bay Splash',sky:[0x3a86e0,0xffc09a],fog:0xffcaa6,water:0x18d0ea,wall:0xff5fa2,ground:0x3fae6e,amp:9,speed:25},
 {id:'mx',name:'Mexico',flag:'🇲🇽',sub:'Aztec Aqua Rush',sky:[0xff8a3d,0xffe08a],fog:0xffd98f,water:0x1ad9b8,wall:0xe8336d,ground:0xd08a52,amp:11,speed:27},
 {id:'fr',name:'France',flag:'🇫🇷',sub:'Paris Plunge',sky:[0x6aa6ff,0xf0e6ff],fog:0xe3e6ff,water:0x45c8f2,wall:0x2c4fa8,ground:0x86c46f,amp:12,speed:29},
 {id:'th',name:'Thailand',flag:'🇹🇭',sub:'Bangkok Bolt',sky:[0x1fb8d8,0xfff1a8],fog:0xfff2b8,water:0x00e2c4,wall:0xffb300,ground:0x2f9e6f,amp:13,speed:31},
 {id:'jp',name:'Japan',flag:'🇯🇵',sub:'Sakura Surge',sky:[0xf58fb8,0xfff0f6],fog:0xffe9f1,water:0x4fc3f7,wall:0xd6263b,ground:0x93c78f,amp:14,speed:33},
 {id:'eg',name:'Egypt',flag:'🇪🇬',sub:"Pharaoh's Plunge",sky:[0x2f9bff,0xffe3a8],fog:0xffe5b0,water:0x30d9d0,wall:0xc98a3a,ground:0xe6c477,amp:15,speed:35}
];

/* ---------- scenery props per country ---------- */
function palm(B,x,y,z,h,leaf){
 B.tcyl(x,y,z,0.35,0.6,h,0x8a6a45,6);
 for(let i=0;i<5;i++){const a=i/5*6.283;B.add(G.sph(6),x+Math.cos(a)*1.6,y+h,z+Math.sin(a)*1.6,leaf||0x2fa84f,2.4,0.35,0.9,0,-a,0.35)}
}
function mount(B,x,y,z,r,h,col,snow){B.cone(x,y,z,r,h,col,7);if(snow)B.cone(x,y+h*.72,z,r*.3,h*.28,0xffffff,7)}
function balloon(B,r,x,y,z){const c=[0xff4d6d,0xffc233,0x4dc3ff,0x7be35a][r()*4|0];B.sph(x,y,z,3.2,c,8,1.15);B.box(x,y-5.2,z,1.2,1,1.2,0x8a5a2b)}
function cloud(B,r,x,y,z){B.sph(x,y,z,6,0xffffff,6,.45);B.sph(x+5,y-.5,z+1,4.5,0xffffff,6,.45);B.sph(x-5,y-.5,z,4,0xffffff,6,.45)}
const PROPS={
 sg(B,r,x,y,z,off){
  const k=r();
  if(off>90){const h=40+r()*60;B.box(x,y,z,10+r()*8,h,10,0x7fa6cf);B.box(x,y+h,z,6,3,6,0x4a5a6a);return}
  if(k<.32){const w=5+r()*5,h=16+r()*38,d=5+r()*5;B.box(x,y,z,w,h,d,[0x6fb7e6,0x8fa8c8,0x5aa0d8,0xb8c9dc][r()*4|0]);B.box(x,y+h,z,w*.7,1.6,d*.7,0x40505f);B.box(x,y+h*.45,z,w+.2,.7,d+.2,0xe8f6ff)}
  else if(k<.46){for(let i=-1;i<=1;i++)B.box(x+i*8.5,y,z,6,46,10,0xd7e0e8);B.box(x,y+46,z,31,2.4,10,0xf3f6f8);B.sph(x+6,y+49.5,z,4,0x8fd8e8,8,.5)}
  else if(k<.68){const h=20+r()*10;B.tcyl(x,y,z,.8,1.5,h,0x4a3a35,7);B.sph(x,y+h,z,8,0xd94fa0,8,.35);B.sph(x,y+h+1.4,z,6,0x45c06a,8,.3)}
  else if(k<.86){const h=6+r()*4;B.box(x,y,z,5,h,6,[0xffc9d9,0xfff0a8,0xbfe8ff,0xc9f5c9][r()*4|0]);B.cone(x,y+h,z,4.4,2.2,0xc0583c,4,Math.PI/4)}
  else palm(B,x,y,z,8+r()*3);
 },
 mx(B,r,x,y,z,off){
  const k=r();
  if(off>90){mount(B,x,y,z,40+r()*30,40+r()*40,0x9a6a48,false);return}
  if(k<.2){let w=16;for(let i=0;i<5;i++){B.box(x,y+i*2.6,z,w,2.6,w,i%2?0xd9b88a:0xc9a370);w-=2.8}B.box(x,y+13,z,4,3,4,0xb08858)}
  else if(k<.5){const h=4+r()*5;B.box(x,y,z,6,h,6,[0xff5d8f,0xffc233,0x2ec4b6,0xff8a3d,0x7a4dff][r()*5|0]);B.box(x,y+h,z,6.6,.6,6.6,0xfff3d9)}
  else if(k<.75){const h=5+r()*4;B.cyl(x,y,z,.9,h,0x3d9a4a,7);B.cyl(x-1.7,y+h*.4,z,.5,2.6,0x3d9a4a,6);B.cyl(x+1.7,y+h*.55,z,.5,2.2,0x3d9a4a,6);B.sph(x,y+h+.3,z,.7,0xff5d8f,5)}
  else if(k<.9)balloon(B,r,x,y+24+r()*20,z);
  else{B.box(x,y,z,10,8,8,0xfff1d6);B.cone(x,y+8,z,6,4,0xc4432e,4,Math.PI/4);B.box(x+4,y,z,2,14,2,0xfff1d6);B.sph(x+4,y+15,z,1.4,0xffd24d,6)}
 },
 fr(B,r,x,y,z,off){
  const k=r();
  if(off>90){mount(B,x,y,z,45+r()*25,35+r()*30,0x9fb6d8,true);return}
  if(k<.2){B.tcyl(x,y,z,7,5,12,0x3a3f4a,4);B.tcyl(x,y+12,z,3.4,5.4,16,0x4a505c,4);B.tcyl(x,y+28,z,1.2,3.4,22,0x5a606c,4);B.box(x,y+10,z,10,1.2,10,0x666d79);B.box(x,y+26,z,6,1,6,0x666d79);B.cone(x,y+50,z,.4,8,0x333,4)}
  else if(k<.55){const h=12+r()*6;B.box(x,y,z,10,h,8,0xf1e6cf);B.box(x,y+h,z,9.4,3.2,7.4,0x5d6677);for(let i=0;i<3;i++)B.box(x-3.2+i*3.2,y+h+3.2,z,1,1.2,1,0x444)}
  else if(k<.75){B.cyl(x,y,z,.5,5,0x7a5a3a,6);B.sph(x,y+7,z,3.4,0x4fae4f,7)}
  else if(k<.88)balloon(B,r,x,y+26+r()*22,z);
  else{B.box(x-4,y,z,3,11,4,0xe9dcc0);B.box(x+4,y,z,3,11,4,0xe9dcc0);B.box(x,y+11,z,12,3,4,0xe9dcc0)}
 },
 th(B,r,x,y,z,off){
  const k=r();
  if(off>90){mount(B,x,y,z,45+r()*30,30+r()*40,0x2f7a55,false);return}
  if(k<.28){B.box(x,y,z,10,4,10,0xf2e2b8);let w=7,h=6;for(let i=0;i<4;i++){B.box(x,y+4+i*3,z,w,2,w,0xffd24d);B.cone(x,y+6+i*3,z,w*.78,1.6,0xd6263b,4,Math.PI/4);w-=1.4}B.cone(x,y+16,z,.7,9,0xffd24d,5)}
  else if(k<.52)palm(B,x,y,z,9+r()*4,0x2fa84f);
  else if(k<.72){B.box(x,y+3,z,6,3.5,6,0x8a5a2b);for(const dx of[-2.4,2.4])for(const dz of[-2.4,2.4])B.cyl(x+dx,y,z+dz,.3,3,0x6b4a2b,5);B.cone(x,y+6.5,z,5.2,3.2,0xb0462a,4,Math.PI/4)}
  else if(k<.88){B.cone(x,y,z,4,16,0xffd24d,6);B.cone(x,y+12,z,1.8,10,0xffe27a,6);B.sph(x,y+23,z,.6,0xffffff,5)}
  else{B.sph(x,y+30+r()*14,z,1.2,0xffb347,6);B.sph(x+4,y+34,z,1,0xff7a3d,6)}
 },
 jp(B,r,x,y,z,off){
  const k=r();
  if(off>90){mount(B,x,y,z,60+r()*40,70+r()*50,0x6f86b8,true);return}
  if(k<.2){let w=8;for(let i=0;i<5;i++){B.box(x,y+i*4.2,z,w-1.6,3,w-1.6,0xc8372d);B.box(x,y+i*4.2+3,z,w+1,.7,w+1,0x3a3040);w-=1}B.cone(x,y+21,z,.5,6,0xffd24d,5)}
  else if(k<.62){const h=4+r()*3;B.cyl(x,y,z,.6,h,0x6b4a3a,6);for(let i=0;i<4;i++)B.sph(x+(r()-.5)*4,y+h+r()*2.4,z+(r()-.5)*4,2.6+r()*1.4,[0xffb3cf,0xffc9dd,0xff9bbd][i%3],6)}
  else if(k<.78){B.box(x-3,y,z,1.2,10,1.2,0xd6263b);B.box(x+3,y,z,1.2,10,1.2,0xd6263b);B.box(x,y+8.5,z,9,1,1.4,0xd6263b);B.box(x,y+10,z,10.5,.7,1.8,0x222)}
  else if(k<.9){B.tcyl(x,y,z,1.5,6,26,0xe8423a,4);B.tcyl(x,y+26,z,.5,1.5,14,0xffffff,4)}
  else{B.box(x,y,z,9,6,8,0xf6ead0);B.box(x,y+6,z,11,1,10,0x3a3a4a);B.box(x,y+7,z,7,4,6,0xf6ead0);B.box(x,y+11,z,9,1,8,0x3a3a4a)}
 },
 eg(B,r,x,y,z,off){
  const k=r();
  if(off>90){const s=36+r()*30;B.cone(x,y,z,s*1.35,s*1.1,0xe0b25c,4,Math.PI/4);return}
  if(k<.28){const s=14+r()*10;B.cone(x,y,z,s*1.1,s,0xe6bd68,4,Math.PI/4)}
  else if(k<.46){B.tcyl(x,y,z,.7,1.6,16,0xd9c9a0,4);B.cone(x,y+16,z,.8,2,0xffd24d,4,Math.PI/4)}
  else if(k<.66)palm(B,x,y,z,8+r()*3,0x3f9a3f);
  else if(k<.8){B.box(x,y,z,8,3,12,0xdcc088);B.box(x,y+3,z-1,5,3.4,7,0xdcc088);B.sph(x,y+7,z+4.2,1.8,0xdcc088,6);B.box(x,y+3,z+5.6,1.4,2,1,0x6a8fd8)}
  else if(k<.9){for(let i=0;i<4;i++){B.cyl(x+i*3,y,z,.7,8,0xe8d8b0,8);}B.box(x+4.5,y+8,z,14,1.2,2.4,0xd6c496)}
  else balloon(B,r,x,y+24+r()*20,z);
 }
};

/* ---------- obstacle meshes ---------- */
function mkBlock(id){
 const B=new Batch();
 if(id==='sg'){B.sph(0,1,0,.95,0xc5d44a,8);for(let i=0;i<8;i++){const a=i/8*6.283;B.add(G.cone(5),Math.cos(a)*.88,1,Math.sin(a)*.88,0x7a8a20,.2,.55,.2,Math.sin(a)*1.2,0,-Math.cos(a)*1.2)}B.add(G.cone(5),0,1.95,0,0x7a8a20,.2,.55,.2)}
 else if(id==='mx'){B.cyl(0,0,0,.5,2.4,0x3d9a4a,7);B.add(G.cyl(6),-.8,1.3,0,0x3d9a4a,.3,1.1,.3,0,0,.5);B.add(G.cyl(6),.8,1.6,0,0x3d9a4a,.3,1,.3,0,0,-.5);B.sph(0,2.5,0,.4,0xff5d8f,5)}
 else if(id==='fr'){B.sph(0,.55,0,1,0xff9ec4,10,.38);B.cyl(0,.6,0,.88,.35,0xfff6e6,10);B.sph(0,1.2,0,1,0xff9ec4,10,.4)}
 else if(id==='th'){B.sph(-.55,.62,0,.62,0x6b4a2b,7);B.sph(.55,.62,.1,.62,0x7a5532,7);B.sph(0,1.3,0,.62,0x6b4a2b,7);B.cone(0,1.8,0,.5,.9,0x2fa84f,5)}
 else if(id==='jp'){B.sph(0,1,0,1,0xd62839,10);B.sph(0,1.3,.62,.56,0xfff3e0,8);B.sph(-.22,1.42,1.08,.1,0x111111,5);B.sph(.22,1.42,1.08,.1,0x111111,5);B.box(-.22,1.62,1.02,.32,.07,.05,0x111111);B.box(.22,1.62,1.02,.32,.07,.05,0x111111)}
 else {B.cone(0,0,0,1.35,2.5,0xe8b84a,4,Math.PI/4);B.box(0,1.2,1.0,.7,.12,.12,0x1b2a6b);B.sph(0,2.55,0,.18,0x2a5db0,5)}
 return B.build();
}
function mkSlider(id){
 const B=new Batch();
 if(id==='sg'){B.sph(0,.85,0,.95,0xffd93b,8,.8);B.sph(0,1.8,.2,.55,0xffd93b,8);B.box(0,1.72,.75,.5,.18,.4,0xff8a00);B.sph(-.2,1.95,.62,.08,0x111,4);B.sph(.2,1.95,.62,.08,0x111,4)}
 else if(id==='mx'){B.cyl(0,0,0,.8,1.6,0x8a5a2b,10);B.cyl(0,.25,0,.85,.12,0xcfa24a,10);B.cyl(0,1.2,0,.85,.12,0xcfa24a,10);B.sph(0,1.65,0,.5,0xffd24d,6,.3)}
 else if(id==='fr'){B.add(G.cyl(8),0,.75,0,0xd9a35b,.55,2.7,.55,0,0,1.5708);for(let i=-2;i<=2;i++)B.add(G.box(),i*.5,1.28,0,0xb3763a,.18,.08,.4,0,0,.7)}
 else if(id==='th'){B.box(0,.1,0,3.2,.7,1.2,0xd8642a);B.box(0,.8,0,1.6,.5,1.1,0x2b7fd0);B.add(G.cone(4),1.9,.5,0,0xd8642a,.6,1.1,.6,0,0,-1.5708);B.add(G.cyl(6),-1.9,.9,0,0x6b4a2b,.1,1.8,.1,0,0,1.0)}
 else if(id==='jp'){B.add(G.sph(8),0,.85,0,0xff7a2f,1.3,.6,.7);B.add(G.cone(4),-1.7,.85,0,0xff9a4f,.7,1,.2,0,0,1.5708);B.sph(.45,1.15,.2,.35,0xffffff,5);B.sph(.9,1.0,.5,.1,0x111,4)}
 else {B.sph(0,1,0,1.1,0x9b8466,7);B.sph(.55,1.55,.4,.5,0x8a7556,5);B.sph(-.6,.6,.5,.4,0x7a6a50,5)}
 return B.build();
}
const BAR={sg:[0xff4fa0,0xffffff,0xffe14d],mx:[0xff3e7f,0x22c7a9,0xffd24d],fr:[0xd9a35b,0xc08a45,0xffffff],th:[0x7bc043,0x4f9a2a,0xffd24d],jp:[0xd62839,0xffffff,0xffb3cf],eg:[0xe8b84a,0x2a5db0,0xffffff]};
function mkBar(id){
 const B=new Batch(),c=BAR[id],n=8,sl=.825;
 for(let i=0;i<n;i++){B.add(G.cyl(8),-3.3+(i+.5)*sl,.95,0,c[i%2],.32,sl*1.02,.32,0,0,1.5708)}
 B.sph(-3.35,.95,0,.5,c[2],7);B.sph(3.35,.95,0,.5,c[2],7);B.cyl(0,0,0,.5,1.5,0x333a44,8);B.cyl(0,1.5,0,.25,.4,0x333a44,6);
 return B.build();
}
const GATEC={sg:[0xff5fa2,0xffffff],mx:[0x16b8a0,0xff8a3d],fr:[0x2c4fa8,0xe03a3a],th:[0xd6263b,0xffd24d],jp:[0xd6263b,0x222222],eg:[0xd9b06a,0x2a5db0]};
function mkGate(id,w){
 const B=new Batch(),c=GATEC[id];
 B.box(0,0,0,w,1.7,1.3,c[0]);B.box(0,1.15,0,w+.05,.4,1.35,c[1]);
 if(id==='jp'){B.box(0,1.7,0,w+.8,.28,1.9,0x111111)}
 if(id==='eg'||id==='mx'||id==='th'){const n=Math.max(1,Math.floor(w/1.6));for(let i=0;i<n;i++){const x=-w/2+(i+.5)*w/n;B.cone(x,1.7,0,.5,.75,i%2?c[1]:0xffd24d,id==='eg'?4:5,Math.PI/4)}}
 if(id==='fr'){const n=Math.max(2,Math.floor(w/.9));for(let i=0;i<n;i++)B.box(-w/2+(i+.5)*w/n,1.7,0,.12,.8,.12,0xffffff)}
 if(id==='sg'){const n=Math.max(1,Math.floor(w/1.5));for(let i=0;i<n;i++)B.sph(-w/2+(i+.5)*w/n,1.95,0,.32,0xffe14d,6)}
 return B.build();
}
let _rampGeo=null;
function rampGeo(len,hgt,w){
 const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(len,0);sh.lineTo(len,hgt);sh.lineTo(0,0);
 const g=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false});g.translate(0,0,-w/2);g.rotateY(Math.PI/2);return g;
}
function mkRamp(len,hgt,w){
 const mesh=new THREE.Mesh(rampGeo(len,hgt,w),new THREE.MeshLambertMaterial({color:0xffd02a}));
 const B=new Batch();
 for(let i=0;i<3;i++)B.add(G.box(),0,.12+(i+1)*hgt/4+.0,-(i+1)*len/4,0xff4d2a,w*.96,.05,.5,Math.atan2(hgt,len),0,0);
 const g=new THREE.Group();g.add(mesh);g.add(B.build());return g;
}
function mkBoost(){
 const B=new Batch();B.box(0,0,0,3.4,.1,5.2,0x1f2a3a);
 for(let i=0;i<3;i++)B.add(G.cone(3),0,.2,1.3-i*1.5,0x8aff3a,.9,1.0,.9,-1.5708,0,0);
 return B.build();
}
const PUP={shield:{c:0x2aa0ff,e:'🛡',n:'SHIELD'},magnet:{c:0xff3a6a,e:'🧲',n:'MAGNET'},turbo:{c:0xffa000,e:'🚀',n:'TURBO'}};
function mkPup(type){
 const g=new THREE.Group();const col=PUP[type].c;
 g.add(new THREE.Mesh(new THREE.SphereGeometry(.7,12,10),new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.55})));
 const ring=new THREE.Mesh(new THREE.TorusGeometry(1.05,.1,6,18),new THREE.MeshBasicMaterial({color:0xffffff}));ring.name='ring';g.add(ring);
 return g;
}

/* ---------- rider ---------- */
const FLOATIES=[
 {n:'Classic',c:0xff4b4b,c2:0xffffff,cost:0},{n:'Sunny',c:0xffc233,c2:0xff8a3d,cost:60},{n:'Mint',c:0x31e0b0,c2:0xffffff,cost:100},
 {n:'Flamingo',c:0xff7eb6,c2:0xffc4de,cost:160},{n:'Galaxy',c:0x7a4dff,c2:0x2ad4ff,cost:240},{n:'Golden',c:0xffd700,c2:0xff9d00,cost:400}];
const RIDERS=[
 {n:'Splasher',suit:0x2d9cff,hat:'none',e:'🏊',cost:0},{n:'Coral',suit:0xff6b57,hat:'cap',e:'🧢',cost:50},
 {n:'Captain',suit:0xffffff,hat:'sailor',e:'⚓',cost:120},{n:'Royal',suit:0xff6fb5,hat:'crown',e:'👑',cost:200},
 {n:'Ninja',suit:0x2b303a,hat:'band',e:'🥷',cost:300},{n:'Pharaoh',suit:0xffd24d,hat:'pharaoh',e:'🏺',cost:450},
 {n:'Garden',suit:0x4f9a63,hat:'none',robe:true,e:'🌸',cost:0},
 {n:'Panda',suit:0x2a2a2a,hat:'none',animal:'panda',e:'🐼',cost:250},{n:'Bunny',suit:0xff9ec4,hat:'none',animal:'bunny',e:'🐰',cost:250}];
const SKINS=[0xffdcc0,0xf0c29a,0xd9a477,0xb97a56,0x8d5a3c,0x5e3b28];
const HAIRC=[0x2b1d16,0x6b3f1d,0xe8c35a,0xd8431f,0xff6fb5,0x3aa0ff];
const HSTYLES={b:['Spiky','Bowl','Curly'],g:['Pigtails','Bun','Pony']};
function dark(c,k){const x=new THREE.Color(c);x.multiplyScalar(k);return x.getHex()}
function buildRider(fl,cf){
 const B=new Batch(),an=cf.animal,girl=cf.gender==='g';
 const skin=an?0xfdfaf5:cf.skin,suit=cf.suit,limb=an==='panda'?0x2a2a2a:skin,INK=0x1d1830;
 B.add(G.torus(),0,.32,0,fl.c,1,1,1,0,0,0,(x,y,z)=>{const a=Math.atan2(z,x);return (Math.floor((a+Math.PI)/(Math.PI/6))%2)?fl.c2:fl.c});
 /* body */
 B.sph(0,.82,0,.4,suit,12,1.1);
 if(cf.robe){B.tcyl(0,.34,0,.42,.74,.42,0xf5ecd8,14);B.cyl(0,.74,0,.43,.12,0xc43a3a,14);B.box(.0,.9,-.36,.14,.4,.05,0x1f3a4a);B.add(G.box(),-.22,.78,-.4,0xc43a3a,.14,.28,.05,0,0,.5);B.add(G.box(),.22,.78,-.4,0xc43a3a,.14,.28,.05,0,0,-.5)}
 else if(!an&&girl)B.tcyl(0,.5,0,.36,.6,.3,suit,12);else B.tcyl(0,.5,0,.42,.44,.24,dark(suit,.72),12);
 /* limbs */
 B.add(G.cyl(8),-.2,.5,-.42,limb,.11,.5,.11,-1.25,0,0);B.add(G.cyl(8),.2,.5,-.42,limb,.11,.5,.11,-1.25,0,0);
 B.sph(-.2,.58,-.66,.15,limb,8);B.sph(.2,.58,-.66,.15,limb,8);
 if(cf.robe){B.add(G.tcyl(.16,.3,8),-.5,1.05,0,suit,1,.55,1,0,0,.7);B.add(G.tcyl(.16,.3,8),.5,1.05,0,suit,1,.55,1,0,0,-.7);B.add(G.tcyl(.31,.31,8),-.66,1.28,0,dark(suit,.8),1,.08,1,0,0,.7);B.add(G.tcyl(.31,.31,8),.66,1.28,0,dark(suit,.8),1,.08,1,0,0,-.7)}
 else{B.add(G.cyl(8),-.5,1.05,0,limb,.1,.5,.1,0,0,.7);B.add(G.cyl(8),.5,1.05,0,limb,.1,.5,.1,0,0,-.7)}
 B.sph(-.66,1.3,0,.14,limb,8);B.sph(.66,1.3,0,.14,limb,8);
 /* head */
 B.add(G.sph(18),0,1.75,0,skin,.71,.67,.67);
 if(!an){B.sph(-.67,1.72,0,.12,skin,6);B.sph(.67,1.72,0,.12,skin,6)}
 /* face (front = -z) */
 if(an==='panda'){
  B.add(G.sph(10),-.26,1.74,-.55,0x1d1830,.19,.23,.1);B.add(G.sph(10),.26,1.74,-.55,0x1d1830,.19,.23,.1);
  B.sph(0,1.6,-.64,.09,0x1d1830,6,.75);B.sph(-.26,1.78,-.64,.05,0xffffff,5);B.sph(.26,1.78,-.64,.05,0xffffff,5);
  B.sph(-.48,2.28,0,.22,0x2a2a2a,8);B.sph(.48,2.28,0,.22,0x2a2a2a,8);
 }else{
  const ex=.255,ey=1.67,ew=girl?.15:.135,eh=girl?.19:.175,hb=cf.hairCol?dark(cf.hairCol,.8):0x2a1d16;
  for(const sx of[-1,1]){
   B.add(G.sph(12),sx*ex,ey,-.56,0xfffaf2,ew*1.12,eh*1.1,.08);
   B.add(G.sph(12),sx*ex,ey-.005,-.6,0x4a3220,ew*.88,eh*.92,.07);
   B.add(G.sph(10),sx*ex,ey-.01,-.635,0x140c08,ew*.52,eh*.55,.05);
   B.add(G.sph(8),sx*ex-.045,ey+.07,-.68,0xffffff,.05,.055,.03);
   B.add(G.sph(6),sx*ex+.05,ey-.065,-.68,0xffffff,.025,.025,.02);
   B.add(G.sph(10),sx*ex,ey+eh*1.02,-.55,0x2a1d16,ew*1.2,.03,.07,0,0,sx*-.12);
   B.add(G.box(),sx*(ex+.02),1.96,-.55,hb,.2,.035,.04,0,0,sx*.1);
  }
  B.add(G.sph(6),0,1.57,-.68,dark(skin,.9),.045,.035,.04);
 }
 if(an==='bunny'){B.sph(0,1.6,-.65,.06,0xff7aa8,5)}
 else if(an!=='panda'){B.add(G.sph(8),-.42,1.5,-.46,0xff8c8c,.15,.1,.05,0,.5,0);B.add(G.sph(8),.42,1.5,-.46,0xff8c8c,.15,.1,.05,0,-.5,0)}
 B.add(G.box(),-.04,1.43,-.645,0xb0605a,.07,.026,.03,0,0,.35);B.add(G.box(),.04,1.43,-.645,0xb0605a,.07,.026,.03,0,0,-.35);
 if(an==='bunny'){
  B.add(G.sph(10),-.26,2.62,.02,0xffffff,.17,.55,.1,0,0,.12);B.add(G.sph(10),.26,2.62,.02,0xffffff,.17,.55,.1,0,0,-.12);
  B.add(G.sph(8),-.26,2.62,-.05,0xffb6cf,.09,.4,.05,0,0,.12);B.add(G.sph(8),.26,2.62,-.05,0xffb6cf,.09,.4,.05,0,0,-.12);
  B.sph(0,.6,.5,.2,0xffffff,8);
 }
 /* hair */
 if(!an){
  const hc=cf.hairCol,st=HSTYLES[cf.gender][cf.hs%3];
  B.sph(0,1.9,.05,.73,hc,14,.9);
  /* side-swept bangs + face-framing locks */
  const bangs=()=>{B.add(G.sph(10),-.2,2.05,-.5,hc,.5,.13,.2,0,0,.28);B.add(G.sph(10),.3,2.04,-.5,hc,.34,.12,.18,0,0,-.22);B.add(G.sph(10),-.08,2.0,-.58,hc,.2,.09,.1,0,0,.4);
   B.add(G.sph(8),-.64,1.55,-.12,hc,.11,.42,.22);B.add(G.sph(8),.64,1.55,-.12,hc,.11,.42,.22)};
  if(st==='Spiky'){for(let i=0;i<7;i++){const a2=i/7*6.283;B.add(G.cone(5),Math.sin(a2)*.34,2.3,Math.cos(a2)*.34*.8,hc,.17,.42,.17,Math.cos(a2)*.5,0,-Math.sin(a2)*.5)}B.add(G.cone(5),0,2.45,0,hc,.19,.5,.19);B.add(G.sph(10),-.2,1.98,-.5,hc,.5,.14,.2,0,0,.28)}
  else if(st==='Bowl'){bangs();B.sph(0,2.0,.1,.74,hc,12,.7)}
  else if(st==='Curly'){for(let i=0;i<9;i++){const a2=i/9*6.283;B.sph(Math.sin(a2)*.5,2.1+(i%2)*.1,Math.cos(a2)*.42+.05,.26,hc,7)}B.sph(0,2.35,.05,.32,hc,7);B.add(G.sph(10),-.2,1.98,-.5,hc,.5,.14,.2,0,0,.28)}
  else if(st==='Pigtails'){bangs();for(const sx of[-1,1]){B.add(G.sph(10),sx*.7,1.3,.14,hc,.2,.5,.2,0,0,sx*.12);B.sph(sx*.62,1.78,.14,.12,0xc43a3a,6)}}
  else if(st==='Bun'){bangs();B.sph(0,2.58,.1,.3,hc,10);B.sph(0,2.32,.1,.1,0xc43a3a,6)}
  else {bangs();B.add(G.sph(10),0,1.5,.74,hc,.2,.55,.2,.3,0,0);B.sph(0,1.95,.74,.1,0xc43a3a,6)}
  if(cf.robe){for(const sx of[1]){B.sph(sx*.58,1.98,-.28,.12,0xffffff,6);B.sph(sx*.58,1.98,-.38,.06,0xffa43a,5);B.sph(sx*.46,2.06,-.3,.09,0xff7a7a,6)}}
 }
 /* hats */
 const h=cf.hat;
 if(h==='cap'){B.sph(0,2.0,.02,.74,0xffffff,12,.6);B.add(G.box(),0,2.0,-.68,0xff3b3b,.6,.07,.42)}
 else if(h==='sailor'){B.cyl(0,2.14,0,.46,.2,0xffffff,12);B.cyl(0,2.08,0,.74,.07,0xffffff,14);B.cyl(0,2.14,0,.47,.06,0x1b3b8a,12)}
 else if(h==='crown'){B.cyl(0,2.14,0,.4,.16,0xffd700,10);for(let i=0;i<5;i++){const a=i/5*6.283;B.cone(Math.cos(a)*.34,2.3,Math.sin(a)*.34,.09,.26,0xffd700,4);B.sph(Math.cos(a)*.34,2.58,Math.sin(a)*.34,.06,0xff4d6d,5)}}
 else if(h==='band'){B.cyl(0,1.96,0,.69,.11,0xe83a3a,14);B.box(.2,1.93,.62,.1,.1,.5,0xe83a3a)}
 else if(h==='pharaoh'){B.cyl(0,2.1,0,.72,.2,0x2a5db0,12);B.cyl(0,2.0,0,.73,.07,0xffd24d,12);B.box(-.62,1.45,.05,.14,.8,.5,0x2a5db0);B.box(.62,1.45,.05,.14,.8,.5,0x2a5db0);B.box(0,1.5,.55,.8,.9,.1,0x2a5db0)}
 const mesh=B.build();mesh.position.y=-.9;
 const pivot=new THREE.Group();pivot.position.y=.9;pivot.add(mesh);
 const holder=new THREE.Group();holder.rotation.order='YXZ';holder.add(pivot);
 const bub=new THREE.Mesh(new THREE.SphereGeometry(2,14,10),new THREE.MeshBasicMaterial({color:0x66c8ff,transparent:true,opacity:.35,depthWrite:false}));
 bub.position.y=.7;bub.visible=false;pivot.add(bub);
 holder.userData={pivot:pivot,bub:bub,mesh:mesh};
 return holder;
}

/* ---------- level state ---------- */
let CUR=null;
const SLOTS=[-4.4,-2.6,-0.9,0.9,2.6,4.4];
const LIM=4.6;
function wp(s,lat,h,out){out=out||new THREE.Vector3();return out.set(CUR.cx(s)+lat,CUR.cy(s)+h,-s)}
function orient(g,s){g.rotation.order='YXZ';g.rotation.y=-Math.atan(CUR.dcx(s));g.rotation.x=Math.atan(CUR.dcy(s))}
function mkCurve(D,idx){
 const a=D.amp,ph=idx*1.7;
 const cx=s=>a*(0.6*Math.sin(s/34+ph)+0.4*Math.sin(s/19+ph*2))*clamp(s/70,0,1);
 const cy=s=>-0.2*s+1.4*Math.sin(s/26)*clamp(s/80,0,1);
 return {cx:cx,cy:cy,dcx:s=>(cx(s+.6)-cx(s-.6))/1.2,dcy:s=>(cy(s+.6)-cy(s-.6))/1.2};
}
function stripeTex(){
 const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
 x.fillStyle='#ffffff';x.fillRect(0,0,64,64);x.fillStyle='rgba(120,190,225,.55)';
 for(let i=-1;i<3;i++){x.beginPath();x.moveTo(0,i*32+6);x.lineTo(64,i*32-6);x.lineTo(64,i*32+4);x.lineTo(0,i*32+16);x.fill()}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
function bannerTex(text,bg,fg,check){
 const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');
 x.fillStyle=bg;x.fillRect(0,0,512,128);
 if(check){for(let i=0;i<32;i++)for(let j=0;j<8;j++){x.fillStyle=(i+j)%2?'#fff':'#111';x.fillRect(i*16,j*16*0+j*(j<1?0:0),0,0)}
  for(let i=0;i<32;i++){x.fillStyle=i%2?'#fff':'#111';x.fillRect(i*16,0,16,12);x.fillStyle=i%2?'#111':'#fff';x.fillRect(i*16,12,16,12);x.fillStyle=i%2?'#fff':'#111';x.fillRect(i*16,104,16,12);x.fillStyle=i%2?'#111':'#fff';x.fillRect(i*16,116,16,12)}}
 x.fillStyle=fg;x.font='700 64px Fredoka,Trebuchet MS,sans-serif';x.textAlign='center';x.textBaseline='middle';
 x.shadowColor='rgba(0,0,0,.4)';x.shadowBlur=8;x.fillText(text,256,66);
 const t=new THREE.CanvasTexture(c);return t;
}
function disposeGroup(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const m=o.material;if(m!==MAT_V){if(m.map)m.map.dispose();m.dispose()}}})}

function genCourse(D,idx,L,rnd){
 const obs=[],coins=[],pups=[];
 const LANES=[-4.4,-2.2,0,2.2,4.4];
 const coinLine=(s0,lat0,n,dLat,step,h)=>{for(let i=0;i<n;i++)coins.push({s:s0+i*step,lat:clamp(lat0+dLat(i),-4.6,4.6),h:h||.9,got:false})};
 let s=75;
 const kinds=['blocks','blocks','gate','gate','slider','ramp','ramp','boost','coins'];
 if(idx>=1){kinds.push('spinner','spinner');}
 if(idx>=3){kinds.push('slider','spinner','ramp')}
 let last='';
 while(s<L-80){
  let k=kinds[rnd()*kinds.length|0];if(k===last&&rnd()<.7)k=kinds[rnd()*kinds.length|0];last=k;
  let used=8;
  if(k==='blocks'){
   const rows=idx>=2?2:1;
   for(let r=0;r<rows;r++){
    const rs=s+r*11;const free=LANES.slice();const nb=idx<2?2:(idx<4?3:3);
    const blocked=[];
    for(let i=0;i<nb;i++){const j=rnd()*free.length|0;blocked.push(free.splice(j,1)[0])}
    blocked.forEach(l=>obs.push({t:'c',kind:'block',s:rs,lat:l,r:1.0}));
    const fl=free[rnd()*free.length|0];coinLine(rs-6,fl,5,()=>0,2.8);
   }
   used=rows*11+4;
  }else if(k==='gate'){
   const gw=Math.max(3.0,4.7-idx*.28),gl=(rnd()*2-1)*(5.2-gw/2-.2);
   const leftW=(gl-gw/2)-(-5.5),rightW=5.5-(gl+gw/2);
   if(leftW>.3)obs.push({t:'b',kind:'gate',s:s,lat:-5.5+leftW/2,hw:leftW/2,hd:.65,w:leftW});
   if(rightW>.3)obs.push({t:'b',kind:'gate',s:s,lat:5.5-rightW/2,hw:rightW/2,hd:.65,w:rightW});
   coinLine(s-8,gl,6,()=>0,2.6);used=6;
  }else if(k==='slider'){
   const two=idx>=2;
   obs.push({t:'c',kind:'slider',s:s,lat:0,r:1.15,mv:{amp:3.4,f:1.1+idx*.18,ph:rnd()*6}});
   if(two)obs.push({t:'c',kind:'slider',s:s+12,lat:0,r:1.15,mv:{amp:3.4,f:1.3+idx*.15,ph:rnd()*6}});
   coinLine(s-10,0,6,i=>Math.sin(i*.9)*3,2.4);used=two?18:8;
  }else if(k==='ramp'){
   const rl=(rnd()*2-1)*2.6,len=7,end=s+len;
   obs.push({t:'ramp',s:s,len:len,lat:rl,w:5.2,hgt:1.2,end:end});
   obs.push({t:'b',kind:'hurdle',s:end+13,lat:0,hw:5.5,hd:.6,w:11});
   for(let i=0;i<7;i++){const t=i/6;coins.push({s:end+3+t*17,lat:rl,h:1.1+2.0*Math.sin(Math.PI*t),got:false})}
   used=42;
  }else if(k==='spinner'){
   const two=idx>=3;
   const dir=rnd()<.5?-1:1;
   obs.push({t:'sp',kind:'spinner',s:s,lat:0,len:3.3,ang:rnd()*6.28,w:(1.5+idx*.28)*dir});
   if(two)obs.push({t:'sp',kind:'spinner',s:s+15,lat:0,len:3.3,ang:rnd()*6.28,w:-(1.7+idx*.25)*dir});
   coinLine(s-10,rnd()<.5?-4:4,4,()=>0,2.6);used=two?20:10;
  }else if(k==='boost'){
   const bl=(rnd()*2-1)*3;obs.push({t:'boost',s:s,lat:bl});
   coinLine(s+4,bl,7,()=>0,2.2);used=18;
  }else{
   const type=rnd();
   coinLine(s,0,12,i=>Math.sin(i*.55)*3.4,2.3);
   if(rnd()<.55){const pt=rnd()<.4?'shield':(rnd()<.5?'magnet':'turbo');pups.push({type:pt,s:s+14,lat:Math.sin(5.5*.55)*3.4,got:false})}
   used=30;
  }
  s+=used+Math.max(14,34-idx*3)+rnd()*10;
 }
 return {obs:obs,coins:coins,pups:pups};
}

function buildScenery(D,L,rnd){
 const batches={};
 const chunk=k=>batches[k]||(batches[k]=new Batch());
 const prop=PROPS[D.id];
 for(let s=-50;s<L+160;s+=21){
  const B=chunk(Math.floor((s+60)/160));
  for(const side of[-1,1]){
   const sj=s+rnd()*14;
   if(rnd()<.25&&!(side>0&&rnd()<.5)){
    const off=100+rnd()*70,x=CUR.cx(sj)+side*off,y=CUR.cy(sj)-12+(off-30)/170*30*0.9-3;prop(B,rnd,x,y,-sj,off);continue;
   }
   const off=14+rnd()*52,x=CUR.cx(sj)+side*off,y=CUR.cy(sj)-12;prop(B,rnd,x,y,-sj,off);
   if(rnd()<.3)cloud(B,rnd,CUR.cx(sj)+side*(20+rnd()*140),CUR.cy(sj)+25+rnd()*40,-sj-rnd()*60);
  }
 }
 for(let s=-20;s<L+80;s+=24){const B=chunk(Math.floor((s+60)/160));
  for(const sd of[-1,1])B.cyl(CUR.cx(s)+sd*4.8,CUR.cy(s)-11.8,-s,.45,11.4,0xe9eef3,7);
  B.box(CUR.cx(s),CUR.cy(s)-.7,-s,10.8,.5,.6,0xcdd6df)}
 return Object.keys(batches).map(k=>batches[k].build());
}
function buildTrack(D,L){
 const prof=[[-7.4,2.4],[-6.3,.95],[-5.7,.3],[-5.2,0],[5.2,0],[5.7,.3],[6.3,.95],[7.4,2.4]];
 const wall=new THREE.Color(D.wall),water=new THREE.Color(D.water),rim=new THREE.Color(0xffffff),mix=wall.clone().lerp(water,.5);
 const cols=[rim,wall,mix,water,water,mix,wall,rim];
 const P=[],C=[],U=[],I=[];let rows=0;
 for(let s=-30;s<=L+90;s+=2){
  const cx=CUR.cx(s),cy=CUR.cy(s);
  for(let j=0;j<8;j++){P.push(cx+prof[j][0],cy+prof[j][1],-s);C.push(cols[j].r,cols[j].g,cols[j].b);U.push(j/7*1.4,s/5)}
  if(rows>0){const a=(rows-1)*8,b=rows*8;for(let j=0;j<7;j++){I.push(a+j,a+j+1,b+j,a+j+1,b+j+1,b+j)}}
  rows++;
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
 g.setIndex(I);g.computeVertexNormals();
 const tex=stripeTex();
 const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,map:tex,side:THREE.DoubleSide}));
 m.frustumCulled=false;return {mesh:m,tex:tex};
}
function buildTerrain(D,L){
 const gc=new THREE.Color(D.ground),fc=new THREE.Color(D.fog);
 const colsR=[[8,0,gc],[34,0,gc],[90,10,gc.clone().lerp(fc,.25)],[260,50,gc.clone().lerp(fc,.5)]];
 const P=[],C=[],I=[];let rows=0;
 for(let s=-70;s<=L+220;s+=8){
  const cx=CUR.cx(s),cy=CUR.cy(s)-12;
  const left=colsR.slice().reverse().map(c=>[-c[0],c[1],c[2]]);
  const all=left.concat(colsR);
  for(const c of all){P.push(cx+c[0],cy+c[1],-s);const v=1+(Math.sin(s*.13+c[0]*.05)*.04);C.push(c[2].r*v,c[2].g*v,c[2].b*v)}
  if(rows>0){const n=all.length,a=(rows-1)*n,b=rows*n;for(let j=0;j<n-1;j++){if(j===3)continue;I.push(a+j,a+j+1,b+j,a+j+1,b+j+1,b+j)}}
  rows++;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
 g.setIndex(I);g.computeVertexNormals();
 const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));m.frustumCulled=false;return m;
}

const coinGeo=new THREE.CylinderGeometry(.5,.5,.14,14);coinGeo.rotateX(Math.PI/2);
const coinMat=new THREE.MeshLambertMaterial({color:0xffcc22,emissive:0x996600});
const _dummy=new THREE.Object3D();

function loadLevel(i){
 if(CUR){scene.remove(CUR.group);disposeGroup(CUR.group)}
 const D=LEVELS[i];const rnd=mkRng(1000+i*77);
 const L=1000+i*150;
 CUR={idx:i,data:D,L:L,group:new THREE.Group(),obs:[],coins:[],pups:[],...mkCurve(D,i)};
 const grp=CUR.group;
 scene.fog=new THREE.Fog(D.fog,70,340);
 domeMat.uniforms.top.value.set(D.sky[0]);domeMat.uniforms.bot.value.set(D.sky[1]);
 hemi.color.set(D.sky[1]);hemi.groundColor.set(D.ground);hemi.intensity=.95;sunL.color.set(0xffffff);
 sunMesh.material.color.set(0xfff4cc);
 const tr=buildTrack(D,L);grp.add(tr.mesh);CUR.tex=tr.tex;
 grp.add(buildTerrain(D,L));
 buildScenery(D,L,rnd).forEach(m=>{m.frustumCulled=true;grp.add(m)});
 /* arches */
 const mkArch=(s,txt,bg,check)=>{
  const g=new THREE.Group();const B=new Batch();
  for(const sd of[-1,1]){B.cyl(sd*6.6,0,0,.5,6.2,0xffffff,8);B.sph(sd*6.6,6.4,0,.8,D.wall,8)}
  g.add(B.build());
  const ban=new THREE.Mesh(new THREE.PlaneGeometry(13.4,3.3),new THREE.MeshBasicMaterial({map:bannerTex(txt,bg,'#fff',check),side:THREE.DoubleSide}));
  ban.position.set(0,5.3,0);g.add(ban);
  g.position.copy(wp(s,0,0));orient(g,s);grp.add(g);return g;
 };
 mkArch(18,D.name.toUpperCase(),'#'+new THREE.Color(D.wall).getHexString(),false);
 mkArch(L,'FINISH','#222',true);
 /* course */
 const course=genCourse(D,i,L,rnd);
 CUR.obs=course.obs;CUR.coins=course.coins;CUR.pups=course.pups;
 for(const o of CUR.obs){
  const g=new THREE.Group();let inner=null;
  if(o.t==='c'){inner=o.kind==='slider'?mkSlider(D.id):mkBlock(D.id)}
  else if(o.t==='b'){inner=mkGate(D.id,o.w)}
  else if(o.t==='sp'){inner=mkBar(D.id)}
  else if(o.t==='ramp'){inner=mkRamp(o.len,o.hgt,o.w)}
  else if(o.t==='boost'){inner=mkBoost()}
  if(o.t==='sp'){g.userData.spin=inner}
  g.add(inner);o.inner=inner;orient(g,o.s);
  g.position.copy(wp(o.s,o.lat,0));
  if(o.t==='ramp'){g.position.copy(wp(o.s,o.lat,0))}
  grp.add(g);o.mesh=g;
 }
 for(const p of CUR.pups){const m=mkPup(p.type);orient(m,p.s);m.position.copy(wp(p.s,p.lat,1.4));grp.add(m);p.mesh=m}
 CUR.coinMesh=new THREE.InstancedMesh(coinGeo,coinMat,Math.max(1,CUR.coins.length));
 CUR.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);CUR.coinMesh.frustumCulled=false;grp.add(CUR.coinMesh);
 scene.add(grp);
}

/* ---------- player / rivals ---------- */
const P={s:0,sPrev:0,lat:SLOTS[2],latT:SLOTS[2],vlat:0,h:0,vy:0,speed:0,hearts:3,inv:0,shield:0,magnet:0,turbo:0,boost:0,coins:0,air:0,airTot:1,flip:0,state:'menu',slow:0};
let riderObj=null;
function setPlayerRider(){
 if(riderObj){scene.remove(riderObj);disposeGroup(riderObj)}
 const rd=RIDERS[save.selR];riderObj=buildRider(FLOATIES[save.selF],{suit:rd.suit,hat:rd.hat,animal:rd.animal,robe:rd.robe,gender:save.selG,hs:save.selH,hairCol:HAIRC[save.selHC],skin:SKINS[save.selSk]});scene.add(riderObj);
}
const rivals=[];
function makeRivals(){
 const cfgs=[
  {f:1,r:6,g:'g',hs:0,hc:0,sk:0},{f:2,r:7,g:'b',hs:0,hc:0,sk:2},{f:3,r:3,g:'g',hs:1,hc:4,sk:4},{f:4,r:8,g:'b',hs:2,hc:1,sk:3},{f:0,r:2,g:'b',hs:1,hc:3,sk:5}];
 for(let i=0;i<5;i++){
  const c=cfgs[i],rd=RIDERS[c.r];
  const g=buildRider(FLOATIES[c.f],{suit:rd.suit,hat:rd.hat,animal:rd.animal,robe:rd.robe,gender:c.g,hs:c.hs,hairCol:HAIRC[c.hc],skin:SKINS[c.sk]});scene.add(g);
  rivals.push({g:g,s:0,lat:0,speed:0,pace:.95+i*.02,ph:i*1.7,f:.5+i*.13,stumble:0,slot:i<2?i:i+1,h:0,vy:0});
 }
}
let lastRank=3,runTime=0,shake=0,stateTimer=0,menuT=0,menuMode=true;
function resetRun(){
 Object.assign(P,{s:0,sPrev:0,lat:SLOTS[2],latT:SLOTS[2],vlat:0,h:0,vy:0,speed:0,hearts:3,inv:0,shield:0,magnet:0,turbo:0,boost:0,coins:0,air:0,airTot:1,flip:0});
 rivals.forEach((r,i)=>{r.s=0;r.lat=SLOTS[r.slot];r.speed=0;r.stumble=0;r.h=0;r.vy=0});
 for(const o of CUR.obs){o.dead=false;if(o.mesh)o.mesh.visible=true;if(o.t==='c'&&o.mv)o.lat=0;}
 for(const c of CUR.coins){c.got=false;c.s=c.s0===undefined?(c.s0=c.s):c.s0;c.lat=c.lat0===undefined?(c.lat0=c.lat):c.lat0;c.h=c.h0===undefined?(c.h0=c.h):c.h0}
 for(const p of CUR.pups){p.got=false;p.mesh.visible=true}
 runTime=0;shake=0;lastRank=3;
 CUR.coins.forEach(c=>{if(c.s0===undefined){c.s0=c.s;c.lat0=c.lat;c.h0=c.h}});
}

/* ---------- particles ---------- */
const NP=220;
const pPos=new Float32Array(NP*3).fill(-9999),pCol=new Float32Array(NP*3),pVel=new Float32Array(NP*3),pLife=new Float32Array(NP);
let pIdx=0;
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const pts=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.55,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));pts.frustumCulled=false;scene.add(pts);
function emit(x,y,z,vx,vy,vz,life,r,g,b){
 const i=pIdx;pIdx=(pIdx+1)%NP;
 pPos[i*3]=x;pPos[i*3+1]=y;pPos[i*3+2]=z;pVel[i*3]=vx;pVel[i*3+1]=vy;pVel[i*3+2]=vz;pLife[i]=life;pCol[i*3]=r;pCol[i*3+1]=g;pCol[i*3+2]=b;
}
function burst(x,y,z,n,r,g,b,spd){for(let i=0;i<n;i++){const a=Math.random()*6.283,u=Math.random()*spd;emit(x,y,z,Math.cos(a)*u,Math.random()*spd*.9+2,Math.sin(a)*u,.7+Math.random()*.4,r,g,b)}}
function updParticles(dt){
 for(let i=0;i<NP;i++){if(pLife[i]>0){pLife[i]-=dt;pVel[i*3+1]-=11*dt;pPos[i*3]+=pVel[i*3]*dt;pPos[i*3+1]+=pVel[i*3+1]*dt;pPos[i*3+2]+=pVel[i*3+2]*dt;if(pLife[i]<=0){pPos[i*3+1]=-9999}}}
 pGeo.attributes.position.needsUpdate=true;pGeo.attributes.color.needsUpdate=true;
}

/* ---------- HUD helpers ---------- */
const hRank=$('hRank'),hSuf=$('hSuf'),hCoins=$('hCoins'),hearts=$('hearts'),pwr=$('pwr'),prog=$('prog'),hint=$('hint');
const progDots=[];
for(let i=0;i<5;i++){const d=document.createElement('i');prog.appendChild(d);progDots.push(d)}
const progMe=document.createElement('i');progMe.className='me';prog.appendChild(progMe);
const ord=n=>n===1?'st':n===2?'nd':n===3?'rd':'th';
function popup(text,color){const d=document.createElement('div');d.className='pu';d.textContent=text;d.style.color=color||'#fff';$('popups').appendChild(d);setTimeout(()=>d.remove(),1200)}
function setHearts(){hearts.textContent='❤️'.repeat(Math.max(0,P.hearts))+'🖤'.repeat(Math.max(0,3-P.hearts))}
function updCoinsHud(bump){hCoins.textContent=P.coins;if(bump){const c=$('coinChip');c.classList.remove('bump');void c.offsetWidth;c.classList.add('bump')}}
function setCoinTotals(){document.querySelectorAll('.coinTotal').forEach(e=>e.textContent=save.coins)}

/* ---------- gameplay ---------- */
let gstate='menu';
function playerRank(){let r=1;for(const v of rivals)if(v.s>P.s)r++;return r}
function hit(){
 if(P.inv>0||P.state!=='play')return;
 if(P.turbo>0)return;
 if(P.shield>0){P.shield=0;riderObj.userData.bub.visible=false;SFX.hit();shake=.5;popup('SHIELD BROKE!','#66c8ff');burst(riderObj.position.x,riderObj.position.y+1,riderObj.position.z,18,.4,.8,1,6);P.inv=.8;return}
 P.hearts--;setHearts();P.speed*=.45;P.inv=1.5;shake=1;SFX.hit();
 try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}
 const f=$('flash');f.classList.add('on');setTimeout(()=>f.classList.remove('on'),60);
 burst(riderObj.position.x,riderObj.position.y+1,riderObj.position.z,26,1,1,1,7);
 if(P.hearts<=0){P.state='wipeout';stateTimer=0;SFX.lose();popup('WIPEOUT!','#ff6a6a')}
}
function segDist(px,py,ax,ay,bx,by){const dx=bx-ax,dy=by-ay;let t=((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy);t=clamp(t,0,1);const x=ax+dx*t-px,y=ay+dy*t-py;return Math.sqrt(x*x+y*y)}
function launch(){
 P.vy=7+P.speed*.12;P.airTot=2*P.vy/24;P.air=0;SFX.jump();
}
function stepPlay(dt){
 const D=CUR.data;
 runTime+=dt;
 const playing=P.state==='play';
 const v0=D.speed*(1+.18*Math.min(1,P.s/CUR.L));
 let mul=1;if(P.boost>0)mul=1.45;if(P.turbo>0)mul=1.8;
 const target=playing?v0*mul:0;
 const acc=playing?(P.speed<target?2.2:3):1.8;
 P.speed+=(target-P.speed)*Math.min(1,dt*acc);
 P.sPrev=P.s;P.s+=P.speed*dt;
 P.boost=Math.max(0,P.boost-dt);P.turbo=Math.max(0,P.turbo-dt);P.magnet=Math.max(0,P.magnet-dt);P.inv=Math.max(0,P.inv-dt);
 if(P.state==='play'){
  P.latT=clamp(P.latT,-LIM,LIM);
  const old=P.lat;P.lat+=(P.latT-P.lat)*Math.min(1,dt*10);P.vlat=(P.lat-old)/dt;
 }else P.vlat*=.9;
 /* air */
 if(P.h>0||P.vy!==0){
  P.vy-=24*dt;P.h+=P.vy*dt;P.air+=dt;
  if(P.h<=0){P.h=0;P.vy=0;SFX.land();burst(riderObj.position.x,riderObj.position.y,riderObj.position.z,14,.7,.9,1,5);
   if(P.air>.55&&playing){const b=Math.round(P.air*12);P.coins+=b;updCoinsHud(true);popup('AIR TIME! +'+b,'#ffe14d')}
   P.air=0}
 }
 if(playing){
  const sc=P.s,lat=P.lat,jumpable=P.h>1.0;
  /* obstacles */
  for(const o of CUR.obs){
   if(o.dead||Math.abs(o.s-sc)>20)continue;
   if(o.t==='c'){
    if(!jumpable||P.turbo>0){const dl=lat-o.lat,ds=sc-o.s,rr=o.r+.75;if(dl*dl+ds*ds<rr*rr){if(P.turbo>0){smash(o)}else hit()}}
   }else if(o.t==='b'){
    if(!jumpable||P.turbo>0){if(Math.abs(lat-o.lat)<o.hw+.6&&Math.abs(sc-o.s)<o.hd+.6){if(P.turbo>0)smash(o);else hit()}}
   }else if(o.t==='sp'){
    if(!jumpable||P.turbo>0){const ca=Math.cos(o.ang)*o.len,sa=Math.sin(o.ang)*o.len;
     if(segDist(lat,sc,o.lat-ca,o.s-sa,o.lat+ca,o.s+sa)<1.2){if(P.turbo>0)smash(o);else hit()}}
   }else if(o.t==='ramp'){
    if(P.sPrev<o.end&&sc>=o.end&&Math.abs(lat-o.lat)<o.w/2+.3&&P.h<.4&&P.vy===0)launch();
   }else if(o.t==='boost'){
    if(Math.abs(lat-o.lat)<2&&Math.abs(sc-o.s)<2.8&&P.boost<.8){P.boost=1.7;SFX.boost();popup('BOOST!','#8aff3a')}
   }
  }
  /* coins */
  const pm=P.magnet>0;
  for(const c of CUR.coins){
   if(c.got)continue;
   const ds=c.s-sc;if(ds>40||ds<-6)continue;
   if(pm&&Math.abs(ds)<13){const k=Math.min(1,dt*9);c.s+=(sc-c.s)*k;c.lat+=(lat-c.lat)*k;c.h+=(P.h+.8-c.h)*k}
   if(Math.abs(c.s-sc)<1.4&&Math.abs(c.lat-lat)<1.5&&Math.abs(P.h+.8-c.h)<1.4){c.got=true;P.coins++;updCoinsHud(true);SFX.coin();
    const w=wp(c.s,c.lat,c.h);burst(w.x,w.y,w.z,4,1,.85,.2,3)}
  }
  for(const p of CUR.pups){
   if(p.got)continue;
   if(Math.abs(p.s-sc)<1.6&&Math.abs(p.lat-lat)<1.8&&P.h<2.2){p.got=true;p.mesh.visible=false;SFX.pup();popup(PUP[p.type].e+' '+PUP[p.type].n+'!','#fff');
    if(p.type==='shield'){P.shield=1;riderObj.userData.bub.visible=true}else if(p.type==='magnet')P.magnet=8;else{P.turbo=3.6;P.speed=Math.max(P.speed,v0*1.2);SFX.boost()}}
  }
  if(P.s>=CUR.L)finishRun();
 }
 /* rivals */
 for(const v of rivals){
  if(P.state==='menu'||gstate==='countdown'){v.speed=0;continue}
  const base=v0*v.pace;let rub=clamp((P.s-v.s)*.06,-3.5,4.5);
  if(v.stumble>0){v.stumble-=dt;rub-=base*.5}else if(Math.random()<dt*.05)v.stumble=1+Math.random();
  const tgt=Math.max(0,base+rub);v.speed+=(tgt-v.speed)*Math.min(1,dt*2);v.s+=v.speed*dt;
  const tl=Math.sin(runTime*v.f+v.ph)*3.6;v.lat+=(tl-v.lat)*Math.min(1,dt*1.5);v.lat=clamp(v.lat,-LIM,LIM);
 }
 if(P.state==='finish'||P.state==='wipeout'){stateTimer+=dt;
  if(P.state==='finish'&&stateTimer>2.2)showResult(true);
  if(P.state==='wipeout'&&stateTimer>1.6)showResult(false);}
}
function smash(o){o.dead=true;o.mesh.visible=false;SFX.smash();shake=.4;P.coins+=3;updCoinsHud(true);const w=wp(o.s,o.lat,1);burst(w.x,w.y,w.z,22,1,.7,.2,8)}
let result={};
function finishRun(){
 if(P.state!=='play')return;
 const rank=playerRank();P.state='finish';stateTimer=0;result.rank=rank;SFX.win();
 popup(rank===1?'🏆 1st PLACE!':'FINISH!','#ffe14d');
}
function showResult(win){
 if(gstate==='result')return;gstate='result';
 const idx=CUR.idx;let stars=0,bonus=0;
 if(win){const r=result.rank;stars=r===1?3:r<=3?2:1;bonus=(7-r)*8;
  const key='l'+idx;save.stars[key]=Math.max(save.stars[key]||0,stars);
  if(idx+1<LEVELS.length)save.unlocked=Math.max(save.unlocked,idx+2);}
 save.coins+=P.coins+bonus;persist();setCoinTotals();
 $('rTitle').textContent=win?(result.rank===1?'Champion! 🏆':'Finished!'):'Wipeout! 💦';
 $('rStars').textContent=win?('★'.repeat(stars)+'☆'.repeat(3-stars)):'☆☆☆';
 $('rRank').textContent=win?('You placed '+result.rank+ord(result.rank)+' of 6'):'Out of hearts — try again!';
 $('rCoins').textContent='🪙 +'+(P.coins+bonus)+(bonus?'  (incl. '+bonus+' podium bonus)':'');
 const nx=$('rNext');nx.style.display=(win&&idx+1<LEVELS.length)?'':'none';
 if(win&&idx+1>=LEVELS.length)$('rRank').textContent+=' — World Tour complete! 🎉';
 $('hud').classList.add('hidden');showScreen('result');
}

/* ---------- rendering of actors ---------- */
let T=0,camLat=0,countT=0,lastCount=-1;
const _cp=new THREE.Vector3(),_lk=new THREE.Vector3(),_wv=new THREE.Vector3();
function placeRider(g,s,lat,h,vlat,flip,inv){
 wp(s,lat,h,g.position);
 g.rotation.y=-Math.atan(CUR.dcx(s));g.rotation.x=Math.atan(CUR.dcy(s));g.rotation.z=clamp(-vlat*.02,-.5,.5);
 g.userData.pivot.rotation.x=flip;
 g.visible=inv>0?(Math.floor(T*16)%2===0):true;
}
function updActors(dt){
 for(const o of CUR.obs){
  if(o.t==='c'&&o.mv){o.lat=o.mv.amp*Math.sin(T*o.mv.f+o.mv.ph);o.mesh.position.x=CUR.cx(o.s)+o.lat}
  else if(o.t==='sp'){o.ang+=o.w*dt;o.mesh.userData.spin.rotation.y=o.ang}
 }
 for(const p of CUR.pups){if(p.got)continue;wp(p.s,p.lat,1.4+.25*Math.sin(T*3+p.s),p.mesh.position);const r=p.mesh.getObjectByName('ring');if(r){r.rotation.x=T*2;r.rotation.y=T*1.3}}
 const cm=CUR.coinMesh;
 for(let i=0;i<CUR.coins.length;i++){
  const c=CUR.coins[i];
  if(c.got||c.s-P.s>300||c.s-P.s<-2){_dummy.scale.set(0,0,0);_dummy.position.set(0,-9999,0)}
  else{wp(c.s,c.lat,c.h,_dummy.position);_dummy.rotation.set(0,T*4+i,0);_dummy.scale.set(1,1,1)}
  _dummy.updateMatrix();cm.setMatrixAt(i,_dummy.matrix);
 }
 cm.instanceMatrix.needsUpdate=true;
 const flip=(P.h>0||P.vy!==0)?-6.2832*clamp(P.air/P.airTot,0,1):0;
 placeRider(riderObj,P.s,P.lat,P.h,P.vlat,flip,P.state==='play'?P.inv:0);
 riderObj.userData.bub.visible=P.shield>0;
 if(P.shield>0)riderObj.userData.bub.material.opacity=.3+.1*Math.sin(T*8);
 for(const v of rivals)placeRider(v.g,v.s,v.lat,0,0,0,0);
 CUR.tex.offset.y-=12*dt/5*(gstate==='play'?1:.3);
}
function sprayFx(dt){
 if(gstate!=='play'&&gstate!=='result')return;
 const p=riderObj.position;
 if(P.h===0&&P.speed>4){for(let i=0;i<2;i++)emit(p.x+(Math.random()-.5)*1.2,p.y+.4,p.z+.9,(Math.random()-.5)*3,1.5+Math.random()*3,P.speed*.3*Math.random()+1,.55,.85,.97,1)}
 if(P.turbo>0)for(let i=0;i<3;i++)emit(p.x+(Math.random()-.5),p.y+.7,p.z+1,(Math.random()-.5)*2,1+Math.random()*2,8+Math.random()*6,.45,1,.55+Math.random()*.3,.1);
 if(P.boost>0)emit(p.x+(Math.random()-.5)*1.6,p.y+.5,p.z+1,(Math.random()-.5)*2,1,9,.4,.5,1,.3);
}
function camFollow(dt){
 const sf=clamp(P.speed/(CUR.data.speed*1.15),0,1.7);
 camLat+=(P.lat*.7-camLat)*Math.min(1,dt*6);
 wp(P.s-9.8,camLat,4.4+P.h*.5,_cp);camera.position.copy(_cp);
 if(shake>0){camera.position.x+=(Math.random()-.5)*shake*.9;camera.position.y+=(Math.random()-.5)*shake*.9;shake=Math.max(0,shake-dt*2.6)}
 wp(P.s+10,P.lat*.9,1.3+P.h*.6,_lk);camera.lookAt(_lk);
 camera.rotateZ(clamp(-P.vlat*.012,-.14,.14));
 const tf=58+sf*13+(P.boost>0?8:0)+(P.turbo>0?12:0);
 camera.fov+=(tf-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
}
function menuCam(dt){
 const a=Math.PI+Math.sin(T*.4)*.9;wp(0,0,0,_wv);
 camera.position.set(_wv.x+Math.sin(a)*11,_wv.y+3.4,_wv.z+Math.cos(a)*11);
 camera.lookAt(_wv.x,_wv.y-.2,_wv.z);
 camera.fov+=(55-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
}
function shopCam(dt){
 const a=Math.PI+Math.sin(T*.5)*.5;wp(0,P.lat,0,_wv);
 camera.position.set(_wv.x+Math.sin(a)*8.6,_wv.y+2.6,_wv.z+Math.cos(a)*8.6);
 camera.lookAt(_wv.x,_wv.y-.3,_wv.z);
 camera.fov+=(52-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
}
function speedLines(){
 const w=fx.width,h=fx.height;fctx.clearRect(0,0,w,h);
 if(gstate!=='play')return;
 const inten=clamp((P.speed/(CUR.data.speed)-1.02)*2.4+(P.boost>0?.5:0)+(P.turbo>0?.6:0),0,1);
 if(inten<.05)return;
 const cx=w/2,cy=h*.42,R=Math.hypot(w,h)/2;
 fctx.lineWidth=2;
 for(let i=0;i<26;i++){
  const a=Math.random()*6.283,r0=R*(.35+Math.random()*.4),r1=r0+R*(.15+Math.random()*.35)*inten;
  fctx.strokeStyle='rgba(255,255,255,'+(.12+Math.random()*.3*inten)+')';
  fctx.beginPath();fctx.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);fctx.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);fctx.stroke();
 }
}
function updHud(){
 const rk=playerRank();
 if(rk!==lastRank){if(rk<lastRank&&P.state==='play'){popup('⬆ '+rk+ord(rk)+' place!','#9dff7a')}lastRank=rk}
 hRank.textContent=rk;hSuf.textContent=ord(rk);
 const f=v=>(clamp(v/CUR.L,0,1)*100)+'%';
 rivals.forEach((v,i)=>progDots[i].style.top=f(v.s));progMe.style.top=f(P.s);
 let h='';if(P.shield>0)h+='<span>🛡</span>';if(P.magnet>0)h+='<span>🧲 '+Math.ceil(P.magnet)+'</span>';if(P.turbo>0)h+='<span>🚀 '+Math.ceil(P.turbo)+'</span>';
 if(pwr._h!==h){pwr.innerHTML=h;pwr._h=h}
}

/* ---------- flow ---------- */
let selLevel=Math.min(save.unlocked,LEVELS.length)-1,selTab='F';
function showScreen(n){document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('show',s.id===n))}
function toMenu(){
 gstate='menu';P.state='menu';$('hud').classList.add('hidden');$('count').textContent='';
 resetRun();showScreen('menu');setCoinTotals();
}
function startRun(){
 if(CUR.idx!==selLevel)loadLevel(selLevel);
 resetRun();P.state='wait';gstate='countdown';countT=0;lastCount=-1;camLat=P.lat*.7;
 showScreen('none');$('hud').classList.remove('hidden');setHearts();updCoinsHud(false);pwr._h=null;
 hint.style.opacity=1;
 $('count').innerHTML='<small>'+LEVELS[selLevel].flag+' '+LEVELS[selLevel].name+'</small>';
 ac();if(AC&&AC.state==='suspended')AC.resume();
}
function countdownStep(dt){
 countT+=dt;const n=Math.floor(countT/.85);
 if(n!==lastCount){lastCount=n;const c=$('count');
  if(n<3){c.innerHTML=(3-n);c.className='';void c.offsetWidth;c.className='pop';SFX.beep()}
  else if(n===3){c.innerHTML='GO!';c.className='';void c.offsetWidth;c.className='pop';SFX.go();
   P.state='play';gstate='play';P.speed=CUR.data.speed*.55;P.latT=P.lat;setTimeout(()=>{if(gstate==='play')$('count').innerHTML=''},700);setTimeout(()=>{hint.style.opacity=0},3500)}}
}
function renderLevels(){
 const g=$('lvGrid');g.innerHTML='';
 LEVELS.forEach((L,i)=>{
  const lock=i+1>save.unlocked,st=save.stars['l'+i]||0;
  const d=document.createElement('div');d.className='card'+(i===selLevel?' sel':'')+(lock?' lock':'');
  d.innerHTML='<div class="big">'+(lock?'🔒':L.flag)+'</div>'+L.name+'<small>'+L.sub+'</small><small>'+('★'.repeat(st)+'☆'.repeat(3-st))+'</small>';
  d.onclick=()=>{if(lock){d.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'none'}],{duration:200});return}selLevel=i;loadLevel(i);resetRun();renderLevels()};
  g.appendChild(d);
 });
}
function renderShop(){
 const g=$('shGrid');g.innerHTML='';
 ['F','R','H','S'].forEach(k=>$('tab'+k).classList.toggle('off',selTab!==k));
 $('gB').classList.toggle('off',save.selG!=='b');$('gG').classList.toggle('off',save.selG!=='g');
 const hex=c=>'#'+('000000'+c.toString(16)).slice(-6);
 const shake=d=>d.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'none'}],{duration:200});
 const add=(html,sel,fn)=>{const d=document.createElement('div');d.className='card'+(sel?' sel':'');d.innerHTML=html;d.onclick=()=>fn(d);g.appendChild(d)};
 const apply=()=>{persist();setCoinTotals();setPlayerRider();renderShop()};
 if(selTab==='F'||selTab==='R'){
  const list=selTab==='F'?FLOATIES:RIDERS,own=selTab==='F'?save.ownF:save.ownR,selKey=selTab==='F'?'selF':'selR';
  list.forEach((it,i)=>{
   const owned=own.indexOf(i)>=0,sel=save[selKey]===i;
   const sw=selTab==='F'?'<div class="sw" style="background:conic-gradient('+hex(it.c)+' 0 25%,'+hex(it.c2)+' 0 50%,'+hex(it.c)+' 0 75%,'+hex(it.c2)+' 0)"></div>':'<div class="sw" style="background:'+hex(it.suit)+';display:flex;align-items:center;justify-content:center;font-size:20px">'+it.e+'</div>';
   add(sw+it.n+'<small>'+(sel?'✔ Equipped':owned?'Tap to equip':'🪙 '+it.cost)+'</small>',sel,d=>{
    if(!owned){if(save.coins<it.cost){shake(d);return}save.coins-=it.cost;own.push(i);SFX.pup()}
    save[selKey]=i;apply();
   });
  });
 }else if(selTab==='H'){
  HSTYLES[save.selG].forEach((n,i)=>add('<div class="big">'+(save.selG==='g'?['🎀','🍡','🐴'][i]:['⚡','🥣','🌀'][i])+'</div>'+n+'<small>Style</small>',save.selH===i,()=>{save.selH=i;apply()}));
  HAIRC.forEach((c,i)=>add('<div class="sw" style="background:'+hex(c)+'"></div>Colour<small>'+(i+1)+'</small>',save.selHC===i,()=>{save.selHC=i;apply()}));
 }else{
  SKINS.forEach((c,i)=>add('<div class="sw" style="background:'+hex(c)+'"></div>Tone '+(i+1),save.selSk===i,()=>{save.selSk=i;apply()}));
 }
}
const ACT={
 play(){selLevel=clamp(selLevel,0,save.unlocked-1);startRun()},
 levels(){renderLevels();showScreen('levels');gstate='levels'},
 shop(){renderShop();showScreen('shop');gstate='shop'},
 menu(){toMenu()},
 tabF(){selTab='F';renderShop()},tabR(){selTab='R';renderShop()},tabH(){selTab='H';renderShop()},tabS(){selTab='S';renderShop()},
 gB(){save.selG='b';save.selH=0;persist();setPlayerRider();renderShop()},gG(){save.selG='g';save.selH=0;persist();setPlayerRider();renderShop()},
 mute(){save.mute=!save.mute;persist();$('muteBtn').textContent=save.mute?'🔇':'🔊'},
 pause(){if(gstate==='play'){gstate='paused';showScreen('pause')}},
 resume(){if(gstate==='paused'){gstate='play';showScreen('none')}},
 retry(){startRun()},
 next(){selLevel=Math.min(LEVELS.length-1,CUR.idx+1);startRun()}
};
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-act]');if(!b)return;
 ac();if(AC&&AC.state==='suspended')AC.resume();
 const f=ACT[b.dataset.act];if(f)f();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)ACT.pause()});

/* ---------- input ---------- */
let dragId=null,lastX=0;const keys={};
window.addEventListener('pointerdown',e=>{
 ac();if(AC&&AC.state==='suspended')AC.resume();
 if(gstate!=='play'&&gstate!=='countdown')return;if(e.target.closest('button'))return;
 dragId=e.pointerId;lastX=e.clientX;
});
window.addEventListener('pointermove',e=>{
 if(e.pointerId!==dragId)return;
 const dx=e.clientX-lastX;lastX=e.clientX;
 P.latT=clamp(P.latT+dx*(10.5/Math.min(window.innerWidth,520)),-LIM,LIM);
});
const endDrag=e=>{if(e.pointerId===dragId)dragId=null};
window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);
window.addEventListener('keydown',e=>{keys[e.key]=true;if(e.key==='Escape'||e.key==='p'){if(gstate==='play')ACT.pause();else if(gstate==='paused')ACT.resume()}});
window.addEventListener('keyup',e=>{keys[e.key]=false});
document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('touchmove',e=>{if(!e.target.closest('.grid'))e.preventDefault()},{passive:false});

/* ---------- main loop ---------- */
let lastT=0;
function frame(t){
 requestAnimationFrame(frame);
 const dt=Math.min(.05,(t-lastT)/1000||.016);lastT=t;
 if(gstate!=='paused')T+=dt;
 if(gstate==='play'){
  const kd=(keys.ArrowRight||keys.d||keys.D?1:0)-(keys.ArrowLeft||keys.a||keys.A?1:0);
  if(kd&&P.state==='play')P.latT=clamp(P.latT+kd*13*dt,-LIM,LIM);
 }
 if(gstate==='countdown'){countdownStep(dt);updActors(dt);camFollow(dt)}
 else if(gstate==='play'){updActors(dt);stepPlay(dt);camFollow(dt);updHud();sprayFx(dt)}
 else if(gstate==='paused'){camFollow(0.0001)}
 else if(gstate==='result'){updActors(dt);camFollow(dt)}
 else{updActors(dt);if(gstate==='shop'){for(const v of rivals)v.g.visible=false;shopCam(dt)}else menuCam(dt)}
 updParticles(gstate==='paused'?0:dt);
 dome.position.copy(camera.position);
 sunMesh.position.set(camera.position.x-260,camera.position.y+190,camera.position.z-700);
 speedLines();
 renderer.render(scene,camera);
}

/* ---------- boot ---------- */
selLevel=clamp(selLevel,0,LEVELS.length-1);
loadLevel(selLevel);setPlayerRider();makeRivals();
$('muteBtn').textContent=save.mute?'🔇':'🔊';
toMenu();
requestAnimationFrame(frame);
})();

/* ---------- PWA: service worker + install ---------- */
(function(){
 if('serviceWorker' in navigator&&location.protocol!=='file:'){
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})});
 }
 var deferred=null,btn=document.getElementById('installBtn'),hint=document.getElementById('iosHint');
 var standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;if(!standalone)btn.style.display='';});
 window.addEventListener('appinstalled',function(){btn.style.display='none';deferred=null;});
 btn.addEventListener('click',function(){if(!deferred)return;deferred.prompt();deferred.userChoice.finally(function(){deferred=null;btn.style.display='none'})});
 var ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 if(ios&&!standalone)hint.style.display='block';
})();
