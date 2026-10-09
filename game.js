(()=>{'use strict';
const $=id=>document.getElementById(id),W=390,H=575,LANES=[98,195,292],MAX=30;
const cv=$('world'),ctx=cv.getContext('2d');
function storageGet(k,fallback=null){try{const v=localStorage.getItem(k);return v===null?fallback:v}catch{return fallback}}
function storageSet(k,v){try{localStorage.setItem(k,v)}catch{}}
const imgNames=['grass','mud','hardstanding','water','panel_clean','panel_dirty','stack_clean','stack_dirty','truck_drive','truck_work','operative','cone','excavator','gs6_gate','taco_break'];const I={};let loaded=0;
for(const n of imgNames){const im=new Image();im.src=n+'.png';I[n]=im;im.onload=()=>loaded++}
const S={menu:true,running:false,paused:false,lane:1,targetLane:1,laneLerp:1,score:0,distance:0,panels:18,clean:18,dirty:0,multi:1,traction:100,vehicle:100,elapsed:0,shiftMinutes:420,speed:86,timeRate:5,rows:[],nextY:-100,seed:2341,workTimer:0,lockoff:false,gs6:false,gameover:false,cleanPicked:0,dirtyPicked:0,laid:0,tacos:0,lastT:0,sector:0};
let audio=null;
function rand(){S.seed=(S.seed*1664525+1013904223)>>>0;return S.seed/4294967296}
function snd(type){try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.connect(g);g.connect(audio.destination);let f=220,d=.09;if(type==='lay'){f=90;d=.16}else if(type==='grab'){f=360;d=.1}else if(type==='bad'){f=70;d=.28}else if(type==='taco'){f=620;d=.35}else if(type==='lock'){f=440;d=.18}o.frequency.setValueAtTime(f,t);if(type==='grab')o.frequency.exponentialRampToValueAtTime(720,t+d);if(type==='bad')o.type='sawtooth';g.gain.setValueAtTime(.16,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.start(t);o.stop(t+d)}catch{}}
function reset(){Object.assign(S,{running:true,paused:false,lane:1,targetLane:1,laneLerp:1,score:0,distance:0,panels:18,clean:18,dirty:0,multi:1,traction:100,vehicle:100,elapsed:0,shiftMinutes:420,speed:86,timeRate:5,rows:[],nextY:-80,seed:2341,workTimer:0,lockoff:false,gs6:false,gameover:false,cleanPicked:0,dirtyPicked:0,laid:0,tacos:0,lastT:performance.now(),sector:0});for(let i=0;i<16;i++)addRow(-i*96);showScreen('game');hideModal();banner('COMPOUND START · BUILD THE ACCESS',1400);requestAnimationFrame(loop)}
function surfaceRow(i){
  const prog=Math.floor(S.distance/900);let surf=['grass','track','grass'];let cross=false,gap=-1,pickup=null,dirty=false,worker=false,plant=false,gs6=false;
  const r=rand();
  if(i<5){surf=['grass','track','grass']}
  else if(r<.13){surf=['hard','hard','hard'];cross=true}
  else {const lane=Math.floor(rand()*3);surf=['grass','grass','grass'];surf[lane]='track';if(rand()<.34){const lane2=Math.max(0,Math.min(2,lane+(rand()<.5?-1:1)));surf[lane2]='track'}}
  if(i>4&&rand()<.19){const candidates=surf.map((v,k)=>v==='track'?k:-1).filter(k=>k>=0);if(candidates.length)gap=candidates[Math.floor(rand()*candidates.length)]}
  if(i>2&&rand()<.24){pickup={side:rand()<.5?'L':'R',dirty:rand()<Math.min(.45,.08+prog*.04)}}
  if(i>12&&rand()<.07)worker=true;
  if(i>18&&rand()<.055)plant=true;
  if(i>24&&rand()<.045)gs6=true;
  return {surf,cross,gap,pickup,worker,plant,gs6,laid:false,laidDirty:false,handled:false,passed:false};
}
function addRow(y){const i=Math.round(Math.abs(y)/96)+S.rows.length;S.rows.push({y,...surfaceRow(i)});S.nextY=Math.min(S.nextY,y-96)}
function update(dt){if(!S.running||S.paused||S.gameover)return;S.elapsed+=dt;const stage=Math.min(6,Math.floor(S.distance/900));S.sector=stage;S.speed=86+stage*7;S.timeRate=5+stage*2.4;S.shiftMinutes+=dt*S.timeRate;S.distance+=dt*S.speed*.42;S.score+=dt*S.speed*.08*S.multi;S.workTimer=Math.max(0,S.workTimer-dt);
  // lane smooth animation
  S.laneLerp+=(S.targetLane-S.laneLerp)*Math.min(1,dt*9);if(Math.abs(S.targetLane-S.laneLerp)<.01)S.laneLerp=S.targetLane;
  const scroll=S.workTimer>0?0:S.speed*dt;for(const r of S.rows)r.y+=scroll;S.rows=S.rows.filter(r=>r.y<680);while(Math.min(...S.rows.map(r=>r.y))>-180)addRow(Math.min(...S.rows.map(r=>r.y))-96);
  // active row around truck contact point
  const contact=450;for(const r of S.rows){if(!r.passed&&r.y>contact-18&&r.y<contact+18){r.passed=true;const lane=S.targetLane;let surf=r.surf[lane];if(r.gap===lane&&!r.laid){S.vehicle-=24;S.traction-=15;S.multi=1;flash('MISSED PANEL · VEHICLE DAMAGE','bad');snd('bad')}else if(r.laidDirty&&r.gap===lane){S.traction-=9;S.multi=1;flash('DIRTY PANEL · TRACTION LOSS','bad')}else if(!['track','hard'].includes(surf)&&!(r.gap===lane&&r.laid)){end('OFF TRAK','You entered unsuitable ground without a completed Trakway route.');return}}
  }
  if(S.traction<=0)end('TRACTION LOST','Too much slip accumulated. Stop work.');if(S.vehicle<=0)end('VEHICLE DAMAGE','The vehicle accumulated too much damage.');
  // GS6 state
  const near=S.rows.find(r=>r.gs6&&r.y>90&&r.y<360);S.gs6=!!near;$('lockPanel').classList.toggle('hidden',!S.gs6);if(!S.gs6)S.lockoff=false;
  if(S.distance>900*(S.tacos+1)&&S.tacos<3){S.tacos++;tacoBreak()}
  hud();
}
function rowAtWork(){return S.rows.filter(r=>r.y>230&&r.y<350).sort((a,b)=>Math.abs(a.y-292)-Math.abs(b.y-292))[0]}
function canChange(to){if(to<0||to>2)return false;const r=S.rows.filter(r=>r.y>405&&r.y<500).sort((a,b)=>Math.abs(a.y-450)-Math.abs(b.y-450))[0];if(!r)return false;return r.cross||(['track','hard'].includes(r.surf[S.targetLane])&&['track','hard'].includes(r.surf[to])&&r.surf[S.targetLane]==='hard')}
function move(dir){if(!S.running||S.paused||S.workTimer>0)return;const to=S.targetLane+dir;if(canChange(to)){S.targetLane=to;snd('grab')}else flash('NO SAFE CROSSOVER','bad')}
function action(){if(!S.running||S.paused||S.workTimer>0)return;const r=rowAtWork();if(!r){flash('NO CRANE TASK','');return}if(r.gs6&&!S.lockoff){end('ELECTRICAL DANGER','Required OHL game control was not activated before the crane action.');return}if(r.worker){end('EXCLUSION ZONE BREACH','The work zone was occupied. The winning move was to wait.');return}if(r.plant){flash('WAIT · PLANT IN WORK ZONE','bad');S.multi=1;return}
  const lane=S.targetLane;let did=false;
  if(r.gap===lane&&!r.laid){if(S.panels<=0){flash('NO PANELS AVAILABLE','bad');return}r.laid=true;r.laidDirty=S.clean<=0;if(S.clean>0)S.clean--;else S.dirty--;S.panels--;S.laid++;S.score+=400*S.multi;S.multi=Math.min(8,S.multi+1);did=true;snd('lay');flash(r.laidDirty?'DIRTY PANEL LAID · WATCH TRACTION':'PERFECT LAY +'+400*S.multi,'good')}
  else if(r.pickup&&!r.handled){const wantLane=r.pickup.side==='L'?0:2;if(lane!==wantLane){flash('ALIGN WITH '+(r.pickup.side==='L'?'LEFT':'RIGHT')+' STACK','');return}if(S.panels>=MAX){flash('TRUCK FULL · 30 MAX','');return}const n=Math.min(3,MAX-S.panels);r.handled=true;if(r.pickup.dirty){S.dirty+=n;S.dirtyPicked+=n;S.score=Math.max(0,S.score-80*n);S.multi=1;flash('DIRTY PICKUP · -'+80*n,'bad')}else{S.clean+=n;S.cleanPicked+=n;S.score+=250*n*S.multi;S.multi=Math.min(8,S.multi+1);flash('CLEAN PICKUP +'+250*n*S.multi,'good')}S.panels+=n;did=true;snd('grab')}
  else flash('NO TASK IN CRANE ZONE','');
  if(did){S.workTimer=.65;}
}
function lock(){if(!S.gs6)return;S.lockoff=!S.lockoff;$('lockState').textContent=S.lockoff?'ACTIVE · CONTROL SET':'NOT ACTIVE';$('lockState').style.color=S.lockoff?'#91f27a':'#ffca45';snd('lock');flash(S.lockoff?'LOCK OFF ACTIVE':'LOCK OFF RELEASED',S.lockoff?'good':'')}
function draw(){ctx.clearRect(0,0,W,H);ctx.fillStyle='#5f9147';ctx.fillRect(0,0,W,H);const roadX=48,roadW=294;ctx.save();
  // wide rendered grass base
  const pg=ctx.createPattern(I.grass,'repeat');ctx.fillStyle=pg||'#5e9148';ctx.fillRect(0,0,W,H);
  // tyre/mud corridor
  const pm=ctx.createPattern(I.mud,'repeat');ctx.fillStyle=pm||'#765337';ctx.fillRect(roadX,0,roadW,H);
  // work zone edge fencing/hazard tape
  ctx.strokeStyle='#d84a2e';ctx.lineWidth=3;ctx.setLineDash([12,10]);ctx.beginPath();ctx.moveTo(roadX+5,0);ctx.lineTo(roadX+5,H);ctx.moveTo(roadX+roadW-5,0);ctx.lineTo(roadX+roadW-5,H);ctx.stroke();ctx.setLineDash([]);
  for(const r of S.rows)drawRow(r);
  // action zone guide behind rear crane
  ctx.strokeStyle='rgba(255,214,52,.85)';ctx.lineWidth=2;ctx.setLineDash([7,6]);ctx.strokeRect(55,246,280,95);ctx.setLineDash([]);ctx.fillStyle='rgba(8,12,11,.68)';ctx.fillRect(143,246,104,18);ctx.fillStyle='#ffe167';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.fillText('CRANE WORK ZONE',195,258);
  // truck shadow and sprite
  const tx=LANES[0]+(LANES[2]-LANES[0])*(S.laneLerp/2);const tr=S.workTimer>0?I.truck_work:I.truck_drive;const tw=112,th=224;ctx.drawImage(tr,tx-tw/2,334,tw,th);
  // crane action panel animation
  if(S.workTimer>0){const q=1-S.workTimer/.65;ctx.globalAlpha=Math.sin(Math.PI*q);const r=rowAtWork();if(r){const p=r.laidDirty?I.panel_dirty:I.panel_clean;ctx.drawImage(p,tx-45,265-q*18,90,54)}ctx.globalAlpha=1}
  // rain later sectors
  if(S.sector>=4){ctx.strokeStyle='rgba(200,235,255,.25)';ctx.lineWidth=1;for(let i=0;i<55;i++){const x=(i*67+S.elapsed*180)%W,y=(i*91+S.elapsed*260)%H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7,y+18);ctx.stroke()}}
  ctx.restore();
}
function drawRow(r){const cellW=82,cellH=84;for(let l=0;l<3;l++){const x=LANES[l]-cellW/2,y=r.y;const surf=r.surf[l];if(surf==='hard'){ctx.drawImage(I.hardstanding,x,y,cellW,cellH)}else if(surf==='track'){drawPanel(x,y,cellW,cellH,false)}else if(S.sector>=2&&randStatic(r.y,l)>.82){ctx.drawImage(I.mud,x,y,cellW,cellH)} }
  if(r.gap>=0&&!r.laid){const x=LANES[r.gap]-41;ctx.fillStyle='#4e7040';ctx.fillRect(x,r.y,82,84);ctx.strokeStyle='#ff5c49';ctx.lineWidth=3;ctx.setLineDash([5,5]);ctx.strokeRect(x+4,r.y+4,74,76);ctx.setLineDash([]);ctx.fillStyle='#ff6b55';ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillText('GAP',LANES[r.gap],r.y+47)}else if(r.gap>=0&&r.laid){drawPanel(LANES[r.gap]-41,r.y,82,84,r.laidDirty)}
  if(r.pickup&&!r.handled){const im=r.pickup.dirty?I.stack_dirty:I.stack_clean;const x=r.pickup.side==='L'?0:310;ctx.drawImage(im,x,r.y-15,80,58)}
  if(r.worker){ctx.drawImage(I.operative,31,r.y-10,48,60);ctx.drawImage(I.cone,305,r.y+15,32,40)}
  if(r.plant){ctx.drawImage(I.excavator,4,r.y-18,100,88);ctx.fillStyle='#ffd83f';ctx.fillRect(100,r.y+12,52,21);ctx.fillStyle='#111';ctx.font='bold 11px Arial';ctx.fillText('WAIT',126,r.y+27)}
  if(r.gs6){ctx.drawImage(I.gs6_gate,32,r.y-45,326,135)}
}
function randStatic(y,l){return (Math.sin(y*.031+l*9.1)*43758.5453)%1+1>>0}
function drawPanel(x,y,w,h,dirty){const im=dirty?I.panel_dirty:I.panel_clean;ctx.drawImage(im,x-4,y-3,w+8,h+7)}
function loop(t){if(!S.running)return;const dt=Math.min(.05,(t-S.lastT)/1000||0);S.lastT=t;update(dt);draw();if(S.running)requestAnimationFrame(loop)}
function hud(){const hh=Math.floor(S.shiftMinutes/60)%24,mm=Math.floor(S.shiftMinutes)%60;$('timeHud').textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');$('panelHud').textContent=S.panels+'/'+MAX;$('stockHud').textContent='C '+S.clean+' · D '+S.dirty;$('scoreHud').textContent=String(Math.floor(S.score)).padStart(6,'0');$('multiHud').textContent='SAFE ×'+S.multi;$('tractionBar').style.width=Math.max(0,S.traction)+'%';$('vehicleBar').style.width=Math.max(0,S.vehicle)+'%';$('tractionBar').style.background=S.traction<35?'#ff5548':'linear-gradient(90deg,#7ed347,#d5e94b)';$('vehicleBar').style.background=S.vehicle<35?'#ff5548':'linear-gradient(90deg,#7ed347,#d5e94b)';$('actionHint').textContent=contextHint()}
function contextHint(){const r=rowAtWork();if(!r)return'TIME THE CRANE';if(r.gs6&&!S.lockoff)return'LOCK OFF FIRST';if(r.worker||r.plant)return'WAIT FOR CLEAR';if(r.gap===S.targetLane&&!r.laid)return'LAY PANEL NOW';if(r.pickup&&!r.handled)return(r.pickup.dirty?'DIRTY ':'CLEAN ')+'PICKUP '+r.pickup.side;return'TIME THE CRANE'}
function banner(txt,ms=1000){const b=$('banner');b.textContent=txt;b.classList.remove('hidden');clearTimeout(b._to);b._to=setTimeout(()=>b.classList.add('hidden'),ms)}
function flash(txt,type=''){banner(txt,1100);if(type==='bad')$('banner').style.borderColor='#ff534c';else if(type==='good')$('banner').style.borderColor='#6fe35b';else $('banner').style.borderColor='#ffcb2f'}
function tacoBreak(){S.paused=true;snd('taco');const bonus=Math.round((S.multi*750)+(S.cleanPicked*60)-(S.dirtyPicked*50));S.score+=Math.max(0,bonus);showModal(`<img class="tacoImg" src="taco_break.png"><h2>CHECKPOINT REACHED</h2><div class="stats"><div><span>Panels laid</span><b>${S.laid}</b></div><div><span>Safe multiplier</span><b>×${S.multi}</b></div><div><span>Clean pickups</span><b>${S.cleanPicked}</b></div><div><span>Time bonus</span><b>+${bonus}</b></div></div><p>Site conditions can change as work progresses. Reassess the route and controls before continuing.</p><button class="primary" id="continueShift">CONTINUE SHIFT</button>`);setTimeout(()=>{$('continueShift').addEventListener('click',()=>{hideModal();S.paused=false;S.lastT=performance.now()},{once:true})},0)}
function end(title,msg){if(S.gameover)return;S.gameover=true;S.running=false;snd('bad');saveScore();showModal(`<h1 class="danger">${title}</h1><p>${msg}</p><div class="stats"><div><span>Distance</span><b>${Math.floor(S.distance)}m</b></div><div><span>Score</span><b>${Math.floor(S.score)}</b></div><div><span>Panels laid</span><b>${S.laid}</b></div><div><span>Best SAFE</span><b>×${S.multi}</b></div></div><p><b>Awareness note:</b> this is a stylised game outcome, not a simulation of real operational limits.</p><button class="primary" id="retry">RETRY SHIFT</button><button id="backMenu">MAIN MENU</button>`);setTimeout(()=>{$('retry').addEventListener('click',reset,{once:true});$('backMenu').addEventListener('click',()=>showScreen('menu'),{once:true})},0)}
function showScreen(id){for(const s of document.querySelectorAll('#app>.screen'))s.classList.remove('active');const modal=$('modal');modal.classList.add('hidden');modal.classList.remove('active');$(id).classList.add('active');if(id==='menu'){S.running=false;S.menu=true}else S.menu=false}
function showModal(html){$('modalCard').innerHTML=html;const m=$('modal');m.classList.remove('hidden');m.classList.add('active');m.setAttribute('aria-hidden','false')}
function hideModal(){const m=$('modal');m.classList.add('hidden');m.classList.remove('active');m.setAttribute('aria-hidden','true')}
function scores(){try{return JSON.parse(storageGet('groundShiftScores','[]')||'[]')}catch{return[]}}
function saveScore(){const a=scores();a.push({score:Math.floor(S.score),distance:Math.floor(S.distance),date:new Date().toLocaleDateString()});a.sort((a,b)=>b.score-a.score);storageSet('groundShiftScores',JSON.stringify(a.slice(0,10)))}
function scoreModal(){const a=scores();showModal(`<h1>HIGH SCORES</h1>${a.length?a.map((s,i)=>`<div class="scoreRow"><b>${i+1}</b><span>${s.distance}m · ${s.date}</span><b>${s.score.toLocaleString()}</b></div>`).join(''):'<p>No completed shifts yet.</p>'}<button id="closeModal">CLOSE</button>`);setTimeout(()=>$('closeModal').addEventListener('click',hideModal,{once:true}),0)}
function how(){showModal(`<h1>HOW TO PLAY</h1><p><span class="chip">◀ ▶</span> Move between safe lanes only where a hardstanding/crossover connects them.</p><p><span class="chip">GRAB / LAY</span> Time the rear-mounted crane action when a clean/dirty panel stack or route gap is inside the yellow crane work zone.</p><p><b>30 panel maximum.</b> Clean panels score more. Dirty panels can be carried, but laying and driving over them reduces traction.</p><p>Missing a route panel damages the vehicle and traction. Entering unsuitable ground is game over.</p><p>When a GS6/OHL event appears, use the game’s <b>LOCK OFF</b> control before crane action. If the work zone is occupied by people or plant, wait.</p><p>Taco Break checkpoints bank a bonus and give a short awareness reminder.</p><p class="danger"><b>Game / awareness only.</b> The timings, controls, distances, speeds and crane actions are deliberately simplified and do not represent actual Trakway operations.</p><button id="closeModal">GOT IT</button>`);setTimeout(()=>$('closeModal').addEventListener('click',hideModal,{once:true}),0)}
function settings(){const muted=storageGet('gsMute','0')==='1';showModal(`<h1>SETTINGS</h1><p>Sound effects use lightweight generated tones so the PWA remains fully offline.</p><button id="muteBtn">${muted?'TURN SOUND ON':'TURN SOUND OFF'}</button><button id="closeModal">CLOSE</button>`);setTimeout(()=>{ $('muteBtn').onclick=()=>{const m=storageGet('gsMute','0')==='1';storageSet('gsMute',m?'0':'1');hideModal()};$('closeModal').addEventListener('click',hideModal,{once:true}) },0)}
const snd0=snd;snd=(type)=>{if(storageGet('gsMute','0')!=='1')snd0(type)};
function bindClick(id,fn){const el=$(id);if(!el)throw new Error('Missing control: '+id);el.addEventListener('click',e=>{e.preventDefault();fn(e)},{passive:false})}
bindClick('playBtn',reset);bindClick('howBtn',how);bindClick('scoresBtn',scoreModal);bindClick('settingsBtn',settings);bindClick('leftBtn',()=>move(-1));bindClick('rightBtn',()=>move(1));bindClick('actionBtn',action);bindClick('lockBtn',lock);bindClick('pauseBtn',()=>{if(!S.running)return;S.paused=true;showModal(`<h1>SHIFT PAUSED</h1><p>${Math.floor(S.distance)}m completed · ${S.panels}/30 panels aboard.</p><button class="primary" id="resume">RESUME</button><button id="quit">END SHIFT</button>`);setTimeout(()=>{$('resume').addEventListener('click',()=>{hideModal();S.paused=false;S.lastT=performance.now()},{once:true});$('quit').addEventListener('click',()=>{S.running=false;hideModal();showScreen('menu')},{once:true})},0)});
window.__GROUND_SHIFT_TEST__={state:S,reset,how,scoreModal,settings,action,move,lock,showScreen,hideModal};
window.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='a')move(-1);if(e.key==='ArrowRight'||e.key==='d')move(1);if(e.key===' '||e.key==='Enter')action();if(e.key==='l')lock()});
// scale entire portrait console as one unit
function fit(){const app=$('app'),s=Math.min(innerWidth/390,innerHeight/844);app.style.transform=`scale(${s})`}addEventListener('resize',fit);fit();showScreen('menu');
if('serviceWorker'in navigator){navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});}
})();
