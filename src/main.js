import * as THREE from 'three';
import { makeSurface } from './surface.js';
import { referenceLight } from './motion.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { setupControls } from './controls.js';
import { GardenAudio } from './audio.js';
import './style.css';

const canvas=document.querySelector('#scene');
const loading=document.querySelector('#loading');
const params=new URLSearchParams(location.search);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let renderer,material,texture,surface,mesh,controls;
let elapsed=Number(params.get('time'))||0;
let playing=!reducedMotion.matches && !params.has('still');
let playingBeforeContextLoss=playing, contextUnavailable=false;
let last=performance.now(), animationFrame=0, disposed=false;
const pointer=new THREE.Vector2(.5,.5);
const light=new THREE.Vector2(.25,.74);
const targetLight=new THREE.Vector2();
let pointerActive=false;
const audio=new GardenAudio();
const defaults={relief:.65,diffusion:.42,light:.78,wire:.40,motion:.40,preset:'wired'};
const settings={...defaults};
const presetIndex={wired:0,frosted:1,fluted:2,clear:3};

function change(key,value) {
  settings[key]=value;
  const names={relief:'uRelief',diffusion:'uDiffusion',light:'uLightPower',wire:'uWire',motion:'uMotion',preset:'uPreset'};
  if(material && names[key]) material.uniforms[names[key]].value=key==='preset' ? (presetIndex[value] ?? 0) : Number(value);
}
function togglePlaying() { if(contextUnavailable)return false; playing=!playing; return playing; }
function save() {
  return new Promise((resolve,reject)=>{
    renderer.render(scene,camera);
    canvas.toBlob(blob=>{
      if(!blob) { reject(new Error('The canvas could not be encoded.')); return; }
      let url, a;
      try {
        url=URL.createObjectURL(blob); a=document.createElement('a');
        a.href=url; a.download='glass-garden.png'; a.hidden=true;
        document.body.append(a); a.click();
        resolve();
      } catch(error) { reject(error); }
      finally { a?.remove(); if(url)setTimeout(()=>URL.revokeObjectURL(url),1000); }
    },'image/png');
  });
}
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);

function resize() {
  if(!renderer)return;
  const width=window.innerWidth,height=window.innerHeight;
  // Fine normals benefit from native resolution; cap to protect laptop/mobile GPUs.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.setSize(width,height);
  material?.uniforms.uResolution.value.set(width,height);
}
function frame(now) {
  if(disposed)return;
  const dt=Math.min((now-last)/1000,.05); last=now;
  if(playing) elapsed+=dt*(settings.motion/.4);
  if(material) {
    if(pointerActive) {
      // Pointer coordinates run down from the top; shader UVs run up.
      targetLight.set(pointer.x,1-pointer.y);
    } else {
      // The reference sweep is only the idle presentation.
      referenceLight(elapsed,targetLight);
    }
    light.lerp(targetLight,1-Math.exp(-dt*(pointerActive?18.0:5.0)));
    material.uniforms.uLight.value.copy(light);
    material.uniforms.uTime.value=elapsed;
    renderer.render(scene,camera);
    if(import.meta.env.DEV) {
      canvas.dataset.light=light.toArray().map(v=>v.toFixed(3)).join(',');
      canvas.dataset.frame=String(renderer.info.render.frame);
      canvas.dataset.pointerActive=String(pointerActive);
    }
  }
  animationFrame=requestAnimationFrame(frame);
}
function pointerMove(e) {
  // Listen at window level so embedded browser event routing and decorative
  // overlays cannot drop hover input. Material controls keep their own input.
  if(e.target instanceof Element && e.target.closest('button, input, select, textarea, dialog'))return;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width || !rect.height)return;
  const x=(e.clientX-rect.left)/rect.width, y=(e.clientY-rect.top)/rect.height;
  if(x<0 || x>1 || y<0 || y>1)return;
  pointer.set(x,y); pointerActive=true;
  canvas.dataset.pointer=pointer.toArray().map(v=>v.toFixed(3)).join(',');
}
function pointerLeave(e) {
  // Entering a control must not restart the automatic light sweep.
  if(e.pointerType==='touch')return;
  if(!e.relatedTarget)pointerActive=false;
}

async function visibility() {
  if(document.hidden) { cancelAnimationFrame(animationFrame); await audio.suspend(); }
  else { last=performance.now(); cancelAnimationFrame(animationFrame); animationFrame=requestAnimationFrame(frame); await audio.resume(); }
}
function contextLost(e) {
  e.preventDefault();
  if(!contextUnavailable)playingBeforeContextLoss=playing;
  contextUnavailable=true; playing=false; controls?.setPlaying(false);
  loading.textContent='Graphics paused. Restoring the glass…'; loading.hidden=false;
}
function contextRestored() {
  loading.hidden=true; contextUnavailable=false; playing=playingBeforeContextLoss;
  last=performance.now(); controls?.setPlaying(playing);
}
function dispose() {
  disposed=true;cancelAnimationFrame(animationFrame);controls?.destroy();audio.destroy();
  window.removeEventListener('resize',resize);
  window.removeEventListener('pointermove',pointerMove,true);
  window.removeEventListener('mousemove',pointerMove,true);
  window.removeEventListener('pointerdown',pointerMove,true);
  window.removeEventListener('pointerout',pointerLeave);
  canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);
  document.removeEventListener('visibilitychange',visibility);
  texture?.dispose();surface?.dispose();material?.dispose();mesh?.geometry.dispose();renderer?.dispose();
}
async function init() {
  try {
    renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
    renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    surface=makeSurface();
    texture=await new THREE.TextureLoader().loadAsync('/garden-reconstructed.jpg');
    texture.colorSpace=THREE.NoColorSpace;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    material=new THREE.ShaderMaterial({vertexShader,fragmentShader,depthTest:false,depthWrite:false,uniforms:{
      uGarden:{value:texture},uSurface:{value:surface},uResolution:{value:new THREE.Vector2(innerWidth,innerHeight)},
      uLight:{value:light.clone()},uTime:{value:elapsed},uRelief:{value:defaults.relief},uDiffusion:{value:defaults.diffusion},
      uLightPower:{value:defaults.light},uWire:{value:defaults.wire},uMotion:{value:defaults.motion},uPreset:{value:0},
      uImageAspect:{value:texture.image.width/texture.image.height}
    }});
    mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);scene.add(mesh);
    controls=setupControls({onChange:change,onPause:togglePlaying,onSound:()=>audio.toggle(),onSave:save,onReset:()=>{for(const [k,v] of Object.entries(defaults))change(k,v);elapsed=0;pointerActive=false;}});
    controls.setPlaying(playing);
    resize(); loading.hidden=true;
    document.body.classList.add('ready');
    if(params.has('clean'))controls.setHidden(true);
    window.addEventListener('pointermove',pointerMove,{capture:true,passive:true});
    // Some embedded webviews route hover as mouse events, touch as pointer events.
    window.addEventListener('mousemove',pointerMove,{capture:true,passive:true});
    window.addEventListener('pointerdown',pointerMove,{capture:true,passive:true});
    window.addEventListener('pointerout',pointerLeave);
    canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
    window.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',visibility);
    // Deterministic capture API: no automation hooks in the visible product UI.
    window.glass={
      setTime(t) { elapsed=t; pointerActive=false; referenceLight(t,light);material.uniforms.uTime.value=t;material.uniforms.uLight.value.copy(light);renderer.render(scene,camera); },
      setPlaying(v) { playing=v;controls.setPlaying(v); },
      setLight(x,y) { pointerActive=true;pointer.set(x,1-y);light.set(x,y);material.uniforms.uLight.value.copy(light);renderer.render(scene,camera); },
      change, getState:()=>({elapsed,playing,pointerActive,pointer:pointer.toArray(),settings:{...settings},light:light.toArray(),renderer:renderer.info.render,webgl:renderer.capabilities.isWebGL2}),
      capture:()=>{renderer.render(scene,camera);return canvas.toDataURL('image/png');}
    };
    window.glass.setTime(elapsed);
    animationFrame=requestAnimationFrame(frame);
  } catch(error) {
    console.error('Unable to initialize glass:',error);
    loading.hidden=true;
    const fallback=document.createElement('div');fallback.className='fallback';
    fallback.innerHTML='<h1>Glass</h1><p>This scene needs WebGL 2. Enable hardware acceleration or open it in a current browser.</p><button type="button">Try again</button>';
    fallback.querySelector('button').onclick=()=>location.reload();document.querySelector('#app').append(fallback);
  }
}
init();
if(import.meta.hot)import.meta.hot.dispose(dispose);
window.addEventListener('pagehide',e=>{if(!e.persisted)dispose();},{once:true});
