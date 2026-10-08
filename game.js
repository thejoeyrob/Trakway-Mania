(()=>{
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d');
const hero=$('heroCanvas'),hctx=hero.getContext('2d');
const W=351,H=378;
const laneX=[62,175.5,289], laneW=76, rowH=86;
const truckY=276, workY=154;
const MAX_PANELS=30;
const COLORS={grass:'#75a957',grass2:'#67974d',hard:'#9fa69c',hard2:'#c1c6bc',panel:'#c8cfca',panel2:'#9ba39f',mud:'#6c4931',mud2:'#4d3325',water:'#3a94b9',water2:'#75c8da',yellow:'#efcb28',orange:'#f1652d',ink:'#111713',green:'#76bd43'};
const SECTORS=[
 {at:0,name:'COMPOUND START',label:'SECTOR 1',sky:'#80b968',hazard:.12,pickup:.28},
 {at:420,name:'FIELD ACCESS',label:'SECTOR 2',sky:'#78ad5b',hazard:.20,pickup:.31},
 {at:900,name:'SOFT GROUND',label:'SECTOR 3',sky:'#6c9951',hazard:.27,pickup:.30},
 {at:1400,name:'GS6 CROSSING',label:'SECTOR 4',sky:'#739451',hazard:.31,pickup:.28},
 {at:1880,name:'LIVE SITE',label:'SECTOR 5',sky:'#678b4d',hazard:.36,pickup:.27},
 {at:2380,name:'WEATHER CLOSING',label:'SECTOR 6',sky:'#577846',hazard:.41,pickup:.25},
 {at:2920,name:'OVERTIME',label:'ENDLESS',sky:'#4e6c41',hazard:.47,pickup:.24}
];
const TIPS=[
 'Ground conditions can change during a shift. Reassess before continuing.',
 'People must remain clear of the lifting operation and load path.',
 'Real crane movements follow the lift plan and method statement — this game deliberately compresses them.',
 'If site conditions change, stop and review the safe system of work.',
 'Overhead-line work requires the dedicated site controls and procedure. The LOCK OFF button is only a game abstraction.',
 'Keep the crane stowed and secure for site movement except during a controlled lifting operation.'
];
const rng=()=>Math.random();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=n=>Math.round(n).toString().padStart(6,'0');
const state={};
let last=0,acc=0,toastTimer=0,sectorTimer=0,audioCtx=null,musicTimer=null,musicStep=0,menuOpen=false;

function resetState(){
 Object.assign(state,{running:false,paused:true,over:false,lane:1,targetLane:1,x:laneX[1],score:0,clean:12,dirty:0,traction:100,vehicle:100,mult:1,streak:0,dist:0,minutes:420,rows:[],seq:0,lift:null,lockOff:false,ohlNearby:false,checkpoint:0,nextTaco:650,lastSector:-1,sector:0,fx:[],pops:[],perfects:0,banked:0,misses:0,reason:'',rain:0,screenShake:0,actionLabel:'ALIGN · GRAB · LAY'});
}
resetState();

function audio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();}
function tone(freq,dur=.08,type='square',vol=.025,delay=0){if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+dur+.02)}
function noise(dur=.08,vol=.02,delay=0){if(!audioCtx)return;const n=Math.max(1,Math.floor(audioCtx.sampleRate*dur)),buf=audioCtx.createBuffer(1,n,audioCtx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*(1-i/n);const src=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();f.type='bandpass';f.frequency.value=850;g.gain.value=vol;src.buffer=buf;src.connect(f);f.connect(g);g.connect(audioCtx.destination);src.start(audioCtx.currentTime+delay)}
function sfx(name){audio();if(name==='move'){tone(170,.045,'square',.018);tone(120,.035,'square',.013,.03)}
 else if(name==='lay'){noise(.14,.045);tone(245,.08,'triangle',.035);tone(160,.12,'triangle',.028,.06)}
 else if(name==='grab'){tone(390,.06,'square',.025);noise(.07,.026,.04);tone(520,.07,'triangle',.022,.09)}
 else if(name==='good'){tone(620,.07,'square',.019);tone(820,.09,'square',.017,.07)}
 else if(name==='bad'){tone(105,.26,'sawtooth',.055);noise(.18,.03)}
 else if(name==='lock'){tone(740,.06,'square',.024);tone(940,.12,'square',.02,.07)}
 else if(name==='taco'){[392,494,587,784].forEach((f,i)=>tone(f,.1,'square',.018,i*.08))}
 else if(name==='damage'){noise(.22,.055);tone(78,.24,'sawtooth',.04)}
 else if(name==='crane'){noise(.16,.018);tone(118,.18,'triangle',.018)}
}
function music(start){clearInterval(musicTimer);musicTimer=null;if(!start)return;audio();musicStep=0;const melody=[131,165,196,220,196,247,220,196,147,175,220,196,175,165,147,131];musicTimer=setInterval(()=>{if(state.running&&!state.paused&&!state.over){const f=melody[musicStep++%melody.length];tone(f,.06,'square',.007);if(musicStep%4===1)tone(f/2,.08,'triangle',.005)}},195)}

function sectorForDistance(d){let i=0;for(let s=0;s<SECTORS.length;s++)if(d>=SECTORS[s].at)i=s;return i}
function showSector(i){state.sector=i;const s=SECTORS[i];$('sectorBadge').innerHTML=`<small>${s.label}</small><b>${s.name}</b>`;$('sectorBadge').classList.add('show');clearTimeout(sectorTimer);sectorTimer=setTimeout(()=>$('sectorBadge').classList.remove('show'),1900);}
function say(text,bad=false,dur=1150){$('callout').textContent=text;$('callout').classList.toggle('bad',bad);$('callout').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('callout').classList.remove('show'),dur)}
function pop(text,x,y,color='#fff0a3'){state.pops.push({text,x,y,life:1,color});}
function particle(x,y,color,n=8){for(let i=0;i<n;i++){const a=rng()*Math.PI*2,v=35+rng()*55;state.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.35+rng()*.25,color,r:1+rng()*2})}}
function safe(points=100,perfect=false){state.streak++;state.mult=state.streak>=18?10:state.streak>=11?6:state.streak>=6?4:state.streak>=3?2:1;const gain=points*state.mult;state.score+=gain;if(perfect){state.perfects++;state.score+=70*state.mult;pop(`PERFECT +${gain+70*state.mult}`,W/2,72,'#fff274')}else pop(`+${gain}`,W/2,72,'#dff7a9');sfx('good')}
function breakCombo(penalty=0){state.streak=0;state.mult=1;if(penalty)state.score=Math.max(state.banked||0,state.score-penalty)}

function starterRow(y){return{id:state.seq++,y,surf:['panel','panel','panel'],cross:false,pickup:null,ohl:false,occupied:false,passed:false,decor:Math.floor(rng()*4)}}
function makeRow(y){
 const s=SECTORS[sectorForDistance(state.dist)],surf=['panel','panel','panel'];let cross=false,pickup=null,ohl=false,occupied=false;
 if(state.seq%7===0){cross=true;surf.fill('hard')}
 else{
  const hazard=s.hazard,roll=rng();
  if(roll<hazard){const lane=Math.floor(rng()*3);const typeRoll=rng();surf[lane]=typeRoll<.52?'gap':typeRoll<.72?'mud':typeRoll<.88?'grass':'water'}
  if(state.dist>1250&&state.seq%17===0){ohl=true;const lane=Math.floor(rng()*3);surf[lane]='gap'}
  if(state.dist>900&&state.seq%13===0)occupied=true;
  if(rng()<s.pickup){pickup={side:rng()<.5?'left':'right',kind:rng()<.76?'clean':'dirty',count:rng()<.6?3:4,taken:false}}
 }
 // Never create every lane unsafe at once.
 if(surf.every(v=>['gap','mud','grass','water'].includes(v)))surf[Math.floor(rng()*3)]='panel';
 return{id:state.seq++,y,surf,cross,pickup,ohl,occupied,passed:false,decor:Math.floor(rng()*5)};
}
function seedRows(){state.rows=[];for(let i=0;i<8;i++)state.rows.push(starterRow(H-i*rowH));}
function closestRowTo(y){let best=null,d=1e9;for(const r of state.rows){const dd=Math.abs(r.y+rowH/2-y);if(dd<d){d=dd;best=r}}return{row:best,d}}
function workRow(){const q=closestRowTo(workY);return q.d<47?q:null}
function truckRow(){return closestRowTo(truckY).row}
function rowSafeAt(r,lane){return r&&['panel','panelDirty','hard'].includes(r.surf[lane])}
function laneChange(dir){if(!state.running||state.paused||state.over||state.lift)return;const nl=clamp(state.targetLane+dir,0,2);if(nl===state.targetLane)return;const r=truckRow();if(!r||!rowSafeAt(r,state.targetLane)||!rowSafeAt(r,nl)){say('NO SAFE CROSSOVER',true);breakCombo();sfx('bad');return}state.targetLane=nl;sfx('move');}
function timing(row){return Math.abs(row.y+rowH/2-workY)}
function action(){if(!state.running||state.paused||state.over||state.lift)return;audio();const q=workRow();if(!q){say('ALIGN WITH WORK ZONE');return}const r=q.row,perfect=q.d<11;
 if(r.occupied){endGame('EXCLUSION ZONE','The work zone was occupied. Sometimes the correct game action is to wait.');return}
 const s=r.surf[state.lane];
 if(s==='gap'){
  if(r.ohl&&!state.lockOff){endGame('ELECTRICAL DANGER','The required game control was not activated before the OHL event. Real overhead-line work follows the dedicated procedure and site controls.');return}
  if(state.clean+state.dirty<=0){say('NO PANELS AVAILABLE',true);breakCombo();return}
  const useDirty=state.clean<=0;if(useDirty)state.dirty--;else state.clean--;
  r.surf[state.lane]=useDirty?'panelDirty':'panel';
  if(useDirty){state.traction=clamp(state.traction-11,0,100);breakCombo(80);say('DIRTY PANEL · TRACTION −11',true);pop('−80',W/2,72,'#ff9c75')}else{safe(180,perfect);say(perfect?'PERFECT LAY':'PANEL LAID')}
  state.lift={kind:'lay',t:0,dur:.78,row:r,targetX:laneX[state.lane],targetY:r.y+rowH/2,dirty:useDirty};sfx('crane');setTimeout(()=>sfx('lay'),380);if(r.ohl){state.lockOff=false;updateLock()};return;
 }
 if(r.pickup&&!r.pickup.taken){const sideLane=r.pickup.side==='left'?0:2;if(state.lane!==sideLane){say(`MOVE TO ${r.pickup.side.toUpperCase()} LANE`);return}if(state.clean+state.dirty>=MAX_PANELS){say('LOAD FULL · 30 MAX');return}const add=Math.min(r.pickup.count,MAX_PANELS-state.clean-state.dirty);r.pickup.taken=true;
  if(r.pickup.kind==='clean'){state.clean+=add;safe(85,perfect);say(perfect?`PERFECT GRAB · CLEAN +${add}`:`CLEAN +${add}`)}else{state.dirty+=add;breakCombo(90);say(`DIRTY +${add} · SCORE −90`,true)}
  state.lift={kind:'grab',t:0,dur:.76,row:r,targetX:r.pickup.side==='left'?18:W-18,targetY:r.y+rowH/2,dirty:r.pickup.kind==='dirty'};sfx('crane');setTimeout(()=>sfx('grab'),350);return;
 }
 safe(24,perfect);say(perfect?'PERFECT ALIGN +94':'SMOOTH +24');
}
function toggleLock(){if(!state.running||state.over||state.paused||!state.ohlNearby)return;state.lockOff=!state.lockOff;sfx('lock');updateLock();say(state.lockOff?'GAME CONTROL ACTIVE':'GAME CONTROL RELEASED')}
function updateLock(){$('lockBtn').classList.toggle('active',state.lockOff);$('lockBtn').innerHTML=state.lockOff?'<span>✓</span><b>LOCKED</b><small>GAME CONTROL</small>':'<span>⚡</span><b>LOCK OFF</b><small>GAME CONTROL</small>'}

function startGame(){resetState();state.running=true;state.paused=false;state.lastSector=0;seedRows();$('home').hidden=true;$('modal').hidden=true;showSector(0);music(true);last=performance.now();hud();}
function endGame(title,reason){if(state.over)return;state.over=true;state.running=false;state.paused=true;state.reason=reason;music(false);sfx('bad');const entry={score:Math.round(state.score),dist:Math.round(state.dist),clock:formatTime(state.minutes)};let scores=readScores();scores.push(entry);scores.sort((a,b)=>b.score-a.score);scores=scores.slice(0,8);localStorage.setItem('groundShiftScores',JSON.stringify(scores));showResult(title,reason,entry)}
function taco(){state.paused=true;state.checkpoint++;state.banked=state.score;state.nextTaco+=720;sfx('taco');const tip=TIPS[state.checkpoint%TIPS.length];showModal('🌮 TACO BREAK',`<div class="card"><b>CHECKPOINT ${state.checkpoint}</b><p>Score banked: ${Math.round(state.banked).toLocaleString()} · Panels on truck: ${state.clean+state.dirty}/30</p></div><div class="card"><b>SHIFT AWARENESS</b><p>${tip}</p></div><button class="wide" data-do="resume">BACK TO IT →</button>`,false)}
function formatTime(mins){let m=Math.floor(mins)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function readScores(){try{return JSON.parse(localStorage.getItem('groundShiftScores')||'[]')}catch{return[]}}

function update(dt){if(!state.running||state.paused||state.over)return;
 state.screenShake=Math.max(0,state.screenShake-dt*12);state.x+=(laneX[state.targetLane]-state.x)*Math.min(1,dt*13);
 for(const f of state.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=55*dt;f.life-=dt}state.fx=state.fx.filter(f=>f.life>0);
 for(const p of state.pops){p.y-=28*dt;p.life-=dt}state.pops=state.pops.filter(p=>p.life>0);
 if(state.lift){state.lift.t+=dt;if(state.lift.t>=state.lift.dur){if(state.lift.kind==='lay')particle(state.lift.targetX,state.lift.targetY,'#f3d44e',10);state.lift=null}hud();return}
 const sector=sectorForDistance(state.dist);if(sector!==state.lastSector){state.lastSector=sector;showSector(sector)}state.sector=sector;
 const scroll=94;state.dist+=scroll*dt*.078;state.minutes+=dt*(.90+Math.min(4.4,state.dist/820));state.rain=state.dist>2320?clamp((state.dist-2320)/600,0,.75):0;
 for(const r of state.rows)r.y+=scroll*dt;
 while(state.rows.length&&state.rows[0].y>H+rowH){state.rows.shift();const top=Math.min(...state.rows.map(r=>r.y));state.rows.push(makeRow(top-rowH))}
 const r=truckRow();if(r&&!r.passed&&r.y+rowH/2>=truckY-4){r.passed=true;const s=r.surf[state.lane];if(['grass','mud','water'].includes(s)){endGame('OFF TRAK',s==='water'?'The vehicle left the approved route into water/unsuitable ground.':'The vehicle left the panel/hardstanding route onto unsuitable ground.');return}if(s==='gap'){state.vehicle=clamp(state.vehicle-24,0,100);state.traction=clamp(state.traction-17,0,100);state.misses++;state.screenShake=4;breakCombo(150);say('MISSED PANEL · VEHICLE DAMAGE',true,1500);sfx('damage');if(state.vehicle<=0||state.traction<=0){endGame('STOP WORK','Vehicle condition or traction was lost after repeated route errors.');return}}if(s==='panelDirty'){state.traction=clamp(state.traction-(7+state.rain*4),0,100);breakCombo(35);pop('SLIP',state.x,truckY-45,'#ffb18b');if(state.traction<=0){endGame('TRACTION LOST','Too much slip accumulated from poor route choices.');return}}}
 state.ohlNearby=state.rows.some(row=>row.ohl&&Math.abs(row.y+rowH/2-workY)<135);$('lockBtn').hidden=!state.ohlNearby;if(!state.ohlNearby&&state.lockOff){state.lockOff=false;updateLock()}
 if(state.dist>=state.nextTaco){taco();return}
 const wr=workRow();if(wr){const rr=wr.row;if(rr.occupied)state.actionLabel='WAIT · ZONE OCCUPIED';else if(rr.surf[state.lane]==='gap')state.actionLabel='LAY PANEL';else if(rr.pickup&&!rr.pickup.taken)state.actionLabel=`GRAB ${rr.pickup.kind.toUpperCase()}`;else state.actionLabel=wr.d<11?'PERFECT ALIGN':'ALIGN · GRAB · LAY'}else state.actionLabel='ALIGN · GRAB · LAY';
 hud();
}

function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
function drawGrass(){const s=SECTORS[state.sector];ctx.fillStyle=s.sky;ctx.fillRect(0,0,W,H);for(let y=-20;y<H+20;y+=28){for(let x=0;x<W;x+=37){const o=((x*7+y*11)%17)-8;ctx.strokeStyle=((x+y)/5|0)%2?'#476f3c99':'#9bc56c77';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+o,y+18);ctx.lineTo(x+o+3,y+11);ctx.moveTo(x+o+3,y+18);ctx.lineTo(x+o+8,y+13);ctx.stroke()}}if(state.rain){ctx.fillStyle=`rgba(45,66,58,${state.rain*.45})`;ctx.fillRect(0,0,W,H)}}
function drawRoadBed(){ctx.fillStyle='#405b3c77';ctx.fillRect(26,0,W-52,H);ctx.strokeStyle='#324934aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(29,0);ctx.lineTo(29,H);ctx.moveTo(W-29,0);ctx.lineTo(W-29,H);ctx.stroke()}
function drawPanelTile(x,y,dirty=false){ctx.save();ctx.translate(x,y);ctx.fillStyle=dirty?'#8b8770':COLORS.panel;ctx.strokeStyle='#5c655f';ctx.lineWidth=2;roundRect(ctx,-laneW/2+2,-rowH*.39,laneW-4,rowH*.78,5);ctx.fillStyle=dirty?'#6f654d':'#e2e7e3';ctx.fillRect(-laneW/2+8,-rowH*.31,laneW-16,5);ctx.fillRect(-laneW/2+8,rowH*.20,laneW-16,4);ctx.strokeStyle=dirty?'#574a39':'#89928e';ctx.lineWidth=1;for(let yy=-22;yy<=20;yy+=10){ctx.beginPath();ctx.moveTo(-laneW/2+11,yy);ctx.lineTo(laneW/2-11,yy);ctx.stroke()}ctx.fillStyle='#414a45';for(const xx of [-laneW/2+9,laneW/2-12])for(const yy of [-rowH*.28,rowH*.27])ctx.fillRect(xx,yy,3,3);if(dirty){ctx.fillStyle='#5d452e77';for(let k=0;k<6;k++){ctx.beginPath();ctx.arc(-24+k*9,(-13+(k*11)%30),4+(k%2),0,Math.PI*2);ctx.fill()}}ctx.restore()}
function drawHard(x,y){ctx.fillStyle=COLORS.hard;ctx.fillRect(x-laneW/2-5,y-rowH/2,laneW+10,rowH);ctx.fillStyle=COLORS.hard2;for(let yy=y-rowH/2+8;yy<y+rowH/2;yy+=17)ctx.fillRect(x-laneW/2,yy,laneW,3);ctx.strokeStyle='#777f78';ctx.strokeRect(x-laneW/2-5,y-rowH/2,laneW+10,rowH)}
function drawUnsafe(x,y,type){if(type==='water'){ctx.fillStyle=COLORS.water;ctx.fillRect(x-laneW/2,y-rowH/2,laneW,rowH);ctx.strokeStyle=COLORS.water2;ctx.lineWidth=2;for(let k=0;k<4;k++){ctx.beginPath();ctx.moveTo(x-laneW/2+5,y-rowH/2+15+k*18);ctx.quadraticCurveTo(x,y-rowH/2+8+k*18,x+laneW/2-5,y-rowH/2+15+k*18);ctx.stroke()}}else{ctx.fillStyle=type==='mud'?COLORS.mud:'#6da04f';ctx.fillRect(x-laneW/2,y-rowH/2,laneW,rowH);if(type==='mud'){ctx.fillStyle=COLORS.mud2;for(let k=0;k<7;k++){ctx.beginPath();ctx.ellipse(x-25+(k*9)%55,y-28+(k*13)%58,5,3,.4,0,Math.PI*2);ctx.fill()}}else{ctx.strokeStyle='#507b43';for(let k=0;k<8;k++){ctx.beginPath();ctx.moveTo(x-30+k*8,y+28);ctx.lineTo(x-28+k*8,y+18);ctx.stroke()}}}}
function drawGap(x,y){ctx.fillStyle='#765038';ctx.fillRect(x-laneW/2,y-rowH/2+2,laneW,rowH-4);ctx.fillStyle='#4e3427';for(let k=0;k<8;k++)ctx.fillRect(x-29+(k*13)%58,y-31+(k*17)%62,7,5);ctx.strokeStyle='#e5c52d';ctx.setLineDash([6,5]);ctx.lineWidth=2;ctx.strokeRect(x-laneW/2+4,y-rowH/2+7,laneW-8,rowH-14);ctx.setLineDash([])}
function drawStack(x,y,kind,count){ctx.save();ctx.translate(x,y);ctx.fillStyle='#151c18bb';roundRect(ctx,-24,-27,48,56,7);for(let i=0;i<Math.min(4,count);i++){ctx.fillStyle=kind==='clean'?'#cdd4ce':'#8b8069';ctx.strokeStyle='#57625c';ctx.lineWidth=1;roundRect(ctx,-20,-18+i*8,40,9,2);ctx.strokeRect(-20,-18+i*8,40,9)}ctx.fillStyle=kind==='clean'?'#3ca657':'#9e5a35';roundRect(ctx,-26,17,52,15,4);ctx.fillStyle='#fff';ctx.font='900 7px system-ui';ctx.textAlign='center';ctx.fillText(kind==='clean'?`CLEAN +${count}`:`DIRTY +${count}`,0,27);ctx.restore()}
function drawWorker(x,y){ctx.save();ctx.translate(x,y);ctx.fillStyle='#ff8b28';ctx.beginPath();ctx.arc(0,-14,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#efc328';ctx.fillRect(-7,-7,14,19);ctx.fillStyle='#28362f';ctx.fillRect(-5,12,4,13);ctx.fillRect(1,12,4,13);ctx.fillStyle='#121713cc';roundRect(ctx,-25,-34,50,13,3);ctx.fillStyle='#ffec8c';ctx.font='900 7px system-ui';ctx.textAlign='center';ctx.fillText('WAIT',0,-25);ctx.restore()}
function drawOHL(y){ctx.save();ctx.strokeStyle='#f0c72d';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(11,y-35);ctx.lineTo(11,y+35);ctx.moveTo(W-11,y-35);ctx.lineTo(W-11,y+35);ctx.moveTo(11,y-29);ctx.lineTo(W-11,y-29);ctx.stroke();ctx.strokeStyle='#111';ctx.lineWidth=2;for(let x=18;x<W-18;x+=18){ctx.beginPath();ctx.moveTo(x,y-34);ctx.lineTo(x+8,y-24);ctx.stroke()}ctx.fillStyle='#f4dc43';ctx.beginPath();ctx.moveTo(W/2,y-18);ctx.lineTo(W/2-11,y+4);ctx.lineTo(W/2+11,y+4);ctx.closePath();ctx.fill();ctx.fillStyle='#111';ctx.font='900 13px system-ui';ctx.textAlign='center';ctx.fillText('⚡',W/2,y-1);ctx.restore()}
function drawRow(r){const cy=r.y+rowH/2;if(r.cross){ctx.fillStyle='#8f978e';ctx.fillRect(18,r.y+4,W-36,rowH-8);ctx.fillStyle='#b7bdb6';for(let y=r.y+10;y<r.y+rowH-8;y+=16)ctx.fillRect(20,y,W-40,3);ctx.strokeStyle='#6f786f';ctx.strokeRect(18,r.y+4,W-36,rowH-8)}else{for(let i=0;i<3;i++){const s=r.surf[i],x=laneX[i];if(s==='panel'||s==='panelDirty')drawPanelTile(x,cy,s==='panelDirty');else if(s==='gap')drawGap(x,cy);else drawUnsafe(x,cy,s)}}
 if(r.pickup&&!r.pickup.taken){drawStack(r.pickup.side==='left'?17:W-17,cy,r.pickup.kind,r.pickup.count)}
 if(r.occupied)drawWorker(laneX[1]+23,cy+2);if(r.ohl)drawOHL(cy)}
function drawCrane(c,x,y,progress,targetX,targetY,kind){c.save();c.translate(x,y);const rearY=-75;c.strokeStyle='#182a21';c.lineCap='round';c.lineJoin='round';c.lineWidth=11;c.beginPath();c.moveTo(-8,rearY);c.lineTo(12,rearY-14);c.lineTo(28,rearY-2);c.stroke();c.strokeStyle='#79b94c';c.lineWidth=6;c.stroke();if(progress>0){const p=Math.sin(Math.min(1,progress)*Math.PI/2),tx=(targetX-x)*p,ty=(targetY-y-rearY)*p;c.strokeStyle='#1a2d23';c.lineWidth=10;c.beginPath();c.moveTo(20,rearY-5);c.lineTo(tx*.55, rearY+ty*.55);c.lineTo(tx,rearY+ty);c.stroke();c.strokeStyle='#7ac44d';c.lineWidth=5;c.stroke();c.fillStyle='#efce2d';roundRect(c,tx-11,rearY+ty-5,22,10,3);c.strokeStyle='#2d322f';c.lineWidth=3;c.beginPath();c.moveTo(tx-8,rearY+ty+5);c.lineTo(tx-14,rearY+ty+13);c.moveTo(tx+8,rearY+ty+5);c.lineTo(tx+14,rearY+ty+13);c.stroke();if(kind==='lay'||kind==='grab'){c.fillStyle='#cbd2cd';c.strokeStyle='#68736c';c.lineWidth=1;roundRect(c,tx-27,rearY+ty+13,54,15,2);c.strokeRect(tx-27,rearY+ty+13,54,15);c.fillStyle='#89928d';c.fillRect(tx-23,rearY+ty+18,46,2);c.fillRect(tx-23,rearY+ty+24,46,2)}}c.restore()}
function drawTruck(c,x,y,scale=1,heroMode=false){c.save();c.translate(x,y);c.scale(scale,scale);c.shadowColor='#0007';c.shadowBlur=heroMode?8:4;c.shadowOffsetY=heroMode?5:3;
 // rear working end / crane deck
 c.fillStyle='#202925';roundRect(c,-37,-82,74,28,8);c.fillStyle='#111';c.fillRect(-34,-77,68,4);
 // open flat bed with three representative panel/stillage stacks running longitudinally
 c.fillStyle='#343c38';roundRect(c,-36,-55,72,91,7);c.fillStyle='#202723';c.fillRect(-33,-52,66,86);
 for(let i=0;i<3;i++){const sy=-47+i*27;c.fillStyle=i%2?'#bcc4bf':'#d3d9d5';roundRect(c,-28,sy,56,22,2);c.strokeStyle='#66716a';c.lineWidth=1;c.strokeRect(-28,sy,56,22);c.fillStyle='#8a948e';c.fillRect(-24,sy+5,48,2);c.fillRect(-24,sy+14,48,2);c.fillStyle='#735f40';c.fillRect(-24,sy+20,48,2)}
 // chassis
 c.fillStyle='#161d19';c.fillRect(-39,-42,7,112);c.fillRect(32,-42,7,112);
 // cab
 c.fillStyle='#8bc94a';c.strokeStyle='#101611';c.lineWidth=3;roundRect(c,-39,34,78,64,14);c.stroke();c.fillStyle='#b7e26c';roundRect(c,-33,39,66,20,7);c.fillStyle='#17251f';roundRect(c,-29,43,58,13,5);c.fillStyle='#d8f0af22';c.fillRect(-22,45,18,8);
 // bonnet / bumper
 c.fillStyle='#78b33f';roundRect(c,-34,63,68,28,9);c.fillStyle='#181e1b';c.fillRect(-31,88,62,6);
 // mirrors
 c.fillStyle='#111';roundRect(c,-46,51,8,17,3);roundRect(c,38,51,8,17,3);
 // wheels
 c.fillStyle='#0b0d0c';for(const wx of [-42,34]){roundRect(c,wx,-32,8,25,3);roundRect(c,wx,48,8,25,3)}
 // rear stabiliser beam stowed
 c.fillStyle='#e5c628';c.fillRect(-44,-69,88,5);c.fillStyle='#252a27';c.fillRect(-46,-73,7,13);c.fillRect(39,-73,7,13);
 // Sunbelt marking
 c.fillStyle='#101611';c.font='900 8px system-ui';c.textAlign='center';c.fillText('SUNBELT',0,75);c.font='700 5px system-ui';c.fillText('TRAKWAY',0,82);
 // cab direction chevrons (reversing direction is upward)
 c.fillStyle='#f3ca2a';c.beginPath();c.moveTo(-18,30);c.lineTo(0,20);c.lineTo(18,30);c.lineTo(12,34);c.lineTo(0,27);c.lineTo(-12,34);c.closePath();c.fill();
 c.restore();
}
function drawTruckGame(){const x=state.x,y=truckY;ctx.save();if(state.screenShake){ctx.translate((Math.random()-.5)*state.screenShake,(Math.random()-.5)*state.screenShake)}
 if(state.lift){const q=clamp(state.lift.t/state.lift.dur,0,1);ctx.strokeStyle='#e5c628';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-58,y-70);ctx.lineTo(x+58,y-70);ctx.stroke();ctx.fillStyle='#1b211e';ctx.fillRect(x-63,y-77,8,15);ctx.fillRect(x+55,y-77,8,15);drawCrane(ctx,x,y,q,state.lift.targetX,state.lift.targetY,state.lift.kind)}
 drawTruck(ctx,x,y,.88,false);ctx.restore()}
function drawRain(){if(!state.rain)return;ctx.save();ctx.strokeStyle=`rgba(195,225,230,${state.rain*.35})`;ctx.lineWidth=1;for(let i=0;i<30;i++){const x=(i*57+state.dist*7)%W,y=(i*31+state.dist*13)%H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+10);ctx.stroke()}ctx.restore()}
function draw(){ctx.save();drawGrass();drawRoadBed();for(const r of [...state.rows].sort((a,b)=>a.y-b.y))drawRow(r);ctx.strokeStyle='#f0cf4b55';ctx.setLineDash([5,6]);ctx.lineWidth=2;ctx.strokeRect(5,workY-43,W-10,86);ctx.setLineDash([]);drawTruckGame();drawRain();for(const f of state.fx){ctx.globalAlpha=clamp(f.life/.5,0,1);ctx.fillStyle=f.color;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;for(const p of state.pops){ctx.globalAlpha=clamp(p.life,0,1);ctx.fillStyle=p.color;ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y)}ctx.globalAlpha=1;ctx.restore()}
function drawHero(){const c=hctx;c.clearRect(0,0,hero.width,hero.height);const g=c.createLinearGradient(0,0,0,170);g.addColorStop(0,'#263b2b');g.addColorStop(1,'#101812');c.fillStyle=g;c.fillRect(0,0,330,170);c.fillStyle='#527848';c.fillRect(0,118,330,52);for(let x=0;x<330;x+=34){c.fillStyle=x%68?'#658e51':'#486d40';c.fillRect(x,120,18,50)}c.save();c.translate(245,117);c.rotate(-.08);for(let i=0;i<5;i++){drawPanelHero(c,-35+i*2,-53-i*11)}c.restore();drawTruck(c,230,92,.72,true);c.fillStyle='#f3cc2e';c.font='900 9px system-ui';c.textAlign='right';c.fillText('REAR-MOUNTED LORRY LOADER',316,157)}
function drawPanelHero(c,x,y){c.fillStyle='#cbd2cd';c.strokeStyle='#69736d';c.lineWidth=1;roundRect(c,x,y,56,23,3);c.strokeRect(x,y,56,23);c.fillStyle='#838d87';c.fillRect(x+4,y+6,48,2);c.fillRect(x+4,y+15,48,2)}

function hud(){$('clock').textContent=formatTime(state.minutes);$('score').textContent=fmt(state.score);$('stock').textContent=`${state.clean+state.dirty}/30`;$('mult').textContent='×'+state.mult;$('clean').textContent=state.clean;$('dirty').textContent=state.dirty;$('traction').style.width=state.traction+'%';$('vehicle').style.width=state.vehicle+'%';$('actionHint').textContent=state.actionLabel;}
function loop(ts){const dt=Math.min(.05,(ts-(last||ts))/1000);last=ts;if(!state.paused&&state.running&&!state.over){acc+=dt;let n=0;while(acc>=1/60&&n++<4){update(1/60);acc-=1/60}}else acc=0;draw();requestAnimationFrame(loop)}

function showModal(title,html,closable=true){state.paused=true;menuOpen=true;$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modalClose').hidden=!closable;$('modal').hidden=false}
function closeModal(){menuOpen=false;$('modal').hidden=true;if(state.running&&!state.over){state.paused=false;last=performance.now()}}
function how(){showModal('HOW TO PLAY',`<div class="card"><b>REVERSE THE ROUTE</b><p>The truck faces down the screen and reverses upward. Move LEFT / RIGHT only where the route safely connects.</p></div><div class="card"><b>GRAB / LAY</b><p>Line a panel stack or missing road section up with the dashed work zone, then press GRAB / LAY. The vehicle pauses while the game crane animation operates.</p></div><div class="card"><b>30 PANEL MAX</b><p>Clean panels build score. Dirty panels occupy capacity, reduce score and increase slip when driven over.</p></div><div class="card"><b>KEEP ON THE ROUTE</b><p>Installed Trakway and hardstanding are playable. Grass, mud and water are not. Missing a gap damages the vehicle and traction.</p></div><div class="card"><b>WORK ZONE</b><p>If a person is shown in the lift zone, wait. Pressing the action button while occupied ends the run.</p></div><div class="card"><b>GS6 / OHL EVENT</b><p>The blue LOCK OFF control is an arcade abstraction only. Real overhead-line operations follow the dedicated site procedure, supervision and controls.</p></div><div class="card"><b>🌮 TACO BREAK</b><p>Checkpoints bank the score and show one short awareness reminder. The shift clock accelerates as difficulty increases; it does not represent real vehicle speed.</p></div>`)}
function scores(){const rows=readScores();showModal('HIGH SCORES',rows.length?rows.map((s,i)=>`<div class="scoreRow"><strong>${i+1}</strong><span>${s.dist} m · ${s.clock}</span><b>${s.score.toLocaleString()}</b></div>`).join(''):'<div class="card"><b>NO RUNS YET</b><p>Start a shift and build the route.</p></div>')}
function pauseMenu(){if(!state.running){$('home').hidden=false;return}showModal('SHIFT PAUSED',`<button class="wide" data-do="resume">RESUME SHIFT</button><button class="wide" data-do="how">HOW TO PLAY</button><button class="wide" data-do="scores">HIGH SCORES</button><button class="wide" data-do="quit">END SHIFT</button>`)}
function showResult(title,reason,entry){showModal(title,`<div class="card"><b>SHIFT ENDED</b><p>${reason}</p></div><div class="resultScore">${entry.score.toLocaleString()}</div><div class="resultStats"><span><small>DISTANCE</small><b>${entry.dist} m</b></span><span><small>PERFECTS</small><b>${state.perfects}</b></span><span><small>MISSES</small><b>${state.misses}</b></span></div><button class="wide" data-do="retry">START NEW SHIFT</button><button class="wide" data-do="home">MAIN MENU</button>`,false)}
function home(){music(false);resetState();$('modal').hidden=true;$('home').hidden=false;drawHero();hud()}

$('leftBtn').addEventListener('pointerdown',()=>laneChange(-1));$('rightBtn').addEventListener('pointerdown',()=>laneChange(1));$('actionBtn').addEventListener('pointerdown',action);$('lockBtn').addEventListener('pointerdown',toggleLock);$('menuBtn').addEventListener('click',pauseMenu);$('modalClose').addEventListener('click',closeModal);
$('home').addEventListener('click',e=>{const a=e.target.closest('[data-act]')?.dataset.act;if(a==='start'){audio();startGame()}else if(a==='how')how();else if(a==='scores')scores()});
$('modalBody').addEventListener('click',e=>{const a=e.target.closest('[data-do]')?.dataset.do;if(!a)return;if(a==='resume')closeModal();else if(a==='how')how();else if(a==='scores')scores();else if(a==='retry'){closeModal();startGame()}else if(a==='home'||a==='quit')home()});
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;if(['ArrowLeft','ArrowRight','Space','KeyA','KeyD','KeyL','Escape'].includes(e.code))e.preventDefault();if(e.code==='ArrowLeft'||e.code==='KeyA')laneChange(-1);if(e.code==='ArrowRight'||e.code==='KeyD')laneChange(1);if(e.code==='Space')action();if(e.code==='KeyL')toggleLock();if(e.code==='Escape')pauseMenu()});
window.addEventListener('blur',()=>{if(state.running&&!state.paused&&!state.over)pauseMenu()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused&&!state.over)pauseMenu()});
function fit(){const vv=visualViewport,w=vv?.width||innerWidth,h=vv?.height||innerHeight,s=Math.min(w/375,h/667);document.documentElement.style.setProperty('--scale',s);$('fit').style.left=((vv?.offsetLeft||0)+w/2)+'px';$('fit').style.top=((vv?.offsetTop||0)+h/2)+'px'}
fit();addEventListener('resize',fit);visualViewport?.addEventListener('resize',fit);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
resetState();drawHero();hud();requestAnimationFrame(loop);
})();
