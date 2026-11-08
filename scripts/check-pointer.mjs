import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const base=process.env.APP_URL || 'http://127.0.0.1:5177/';
const chrome=process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
const out='analysis/pointer';
await fs.mkdir(out,{recursive:true});
const result={checkedAt:new Date().toISOString(),errors:[],checks:[],screenshots:{},failures:[]};
const instrument=async page=>{
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await page.goto(base+'?clean');
  await page.waitForFunction(()=>Boolean(window.glass));
  await page.evaluate(()=>{
    window.__pointerCheckEvents=[];
    for(const type of ['pointermove','pointerdown','pointerout','mousemove']) {
      window.addEventListener(type,e=>window.__pointerCheckEvents.push({type,time:performance.now(),pointerType:e.pointerType,buttons:e.buttons,trusted:e.isTrusted,x:e.clientX,y:e.clientY}),true);
    }
  });
};
const settled=async(page,label,x,y,extra={})=>{
  await page.waitForFunction(({x,y})=>{
    const s=window.glass.getState();
    return s.pointerActive && Math.hypot(s.light[0]-x,s.light[1]-(1-y))<.025;
  },{x,y},{timeout:300,polling:'raf'});
  const state=await page.evaluate(()=>({state:window.glass.getState(),events:window.__pointerCheckEvents.slice(-4),now:performance.now()}));
  const distance=Math.hypot(state.state.light[0]-x,state.state.light[1]-(1-y));
  assert.ok(distance<.025,`${label}: light should reach pointer UVs`);
  const input=state.events.findLast(e=>['pointermove','pointerdown','mousemove'].includes(e.type));
  const responseMs=input?state.now-input.time:null;
  assert.ok(responseMs===null || responseMs<300, `${label}: response exceeded 300 ms (${responseMs})`);
  result.checks.push({label,targetUV:[x,1-y],light:state.state.light,distance,responseMs,pointerActive:state.state.pointerActive,playing:state.state.playing,events:state.events,...extra});
  return state;
};
const check=async(label,fn)=>{
  try { await fn(); }
  catch(error) { result.failures.push({label,error:error.message}); }
};
try {
  const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
  await instrument(page);
  for(const [label,x,y] of [['top-left',.08,.08],['top-right',.92,.08],['bottom-right',.92,.92],['bottom-left',.08,.92],['center',.5,.5]]) {
    await check(`hover ${label}`,async()=>{
      await page.mouse.move(x*1200,y*900);
      const {events}=await settled(page,`hover ${label}`,x,y);
      assert.ok(events.some(e=>e.type==='pointermove'&&e.buttons===0&&e.trusted),'Must be actual hover without pressing a mouse button');
    });
  }
  await check('paused mouse still follows',async()=>{
    await page.locator('#scene').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>window.glass.getState().playing),false);
    await page.mouse.move(900,225);
    await settled(page,'paused mouse still follows',.75,.25);
  });
  await check('controls do not restart idle or change light',async()=>{
    await page.keyboard.press('Escape');
    // A settled canvas target far from the control tests both the target exclusion
    // and the relatedTarget guard when moving off the canvas into a button.
    await page.mouse.move(480,450);
    await settled(page,'before control hover',.4,.5);
    await page.locator('.settings-button').hover();
    await page.waitForTimeout(180);
    const state=await page.evaluate(()=>window.glass.getState());
    assert.equal(state.pointerActive,true);
    assert.ok(Math.hypot(state.light[0]-.4,state.light[1]-.5)<.025);
    result.checks.push({label:'controls keep pointer target',light:state.light,pointerActive:state.pointerActive});
  });
  await check('mouse event fallback',async()=>{
    // Synthetic only for the compatibility route: native Chrome sends both event
    // families, so a mouse-only event is the smallest isolated fallback check.
    await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{clientX:240,clientY:630,bubbles:true})));
    await settled(page,'mouse-only compatibility event',.2,.7,{synthetic:true});
  });
  await check('opposite pointers visibly change rendered pixels',async()=>{
    await page.locator('#scene').focus();
    await page.keyboard.press('h');
    await page.mouse.move(240,270);
    await settled(page,'left image',.2,.3);
    const left=await page.screenshot({path:out+'/left.png'});
    await page.mouse.move(960,630);
    await settled(page,'right image',.8,.7);
    const right=await page.screenshot({path:out+'/right.png'});
    const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
    result.screenshots={left:{path:out+'/left.png',sha256:sha(left)},right:{path:out+'/right.png',sha256:sha(right)}};
    assert.notEqual(result.screenshots.left.sha256,result.screenshots.right.sha256,'Opposite pointer positions must change screenshot pixels');
  });
  await check('leaving the window restores idle',async()=>{
    await page.mouse.move(-10,-10);
    await page.waitForTimeout(50);
    const state=await page.evaluate(()=>window.glass.getState());
    assert.equal(state.pointerActive,false);
    result.checks.push({label:'window exit restores idle',pointerActive:state.pointerActive});
  });
  const touchContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const touch=await touchContext.newPage();
  await instrument(touch);
  await check('touch tap moves light',async()=>{
    await touch.touchscreen.tap(117,253.2);
    await settled(touch,'touch tap',.3,.3);
  });
  await check('touch drag moves light while down',async()=>{
    const cdp=await touchContext.newCDPSession(touch);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:117,y:253.2,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:292.5,y:633,id:1}]});
    await settled(touch,'touch drag while down',.75,.75);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const released=await touch.evaluate(()=>window.glass.getState());
    assert.equal(released.pointerActive,true,'Finger release must retain manual light target');
    assert.ok(Math.hypot(released.pointer[0]-.75,released.pointer[1]-.75)<.005);
    result.checks.push({label:'touch release retains target',pointerActive:released.pointerActive,pointer:released.pointer});
    await cdp.detach();
  });
} finally {
  result.passed=result.failures.length===0&&result.errors.length===0;
  await fs.writeFile('analysis/pointer-checks.json',JSON.stringify(result,null,2)+'\n');
  await browser.close();
}
console.log(JSON.stringify({passed:result.passed,checks:result.checks.length,errors:result.errors,failures:result.failures},null,2));
if(!result.passed)process.exitCode=1;
