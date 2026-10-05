(()=>{
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d');
const W=343,H=418;
const laneX=[62,171.5,281], laneW=74, rowH=92, truckY=270, workY=160;
const truck=new Image(),panelImg=new Image(),cleanStack=new Image(),dirtyStack=new Image();
truck.src='./assets/truck.svg';panelImg.src='./assets/panel.svg';cleanStack.src='./assets/stack-clean.svg';dirtyStack.src='./assets/stack-dirty.svg';
const tips=[
 'Keep people clear of the lifting operation and load path.',
 'Ground conditions can change during a shift. Reassess before continuing.',
 'Crane operation is only represented as a game abstraction — real lifts follow the lift plan and method statement.',
 'If conditions change, stop and review the safe system of work.',
 'Overhead-line work needs the required site controls and dedicated procedure — not just a game button.',
 'Keep the crane stowed and secure for site movement except during a controlled lifting operation.'
];
let audioCtx=null,musicTimer=null;
function audio(){if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)()}if(audioCtx.state==='suspended')audioCtx.resume()}
function beep(freq=440,dur=.08,type='square',vol=.035){if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}
function sfx(name){audio();const m={move:[170,.05],grab:[520,.08],lay:[300,.12],good:[680,.11],bad:[95,.24],lock:[820,.12],taco:[440,.09]};const [f,d]=m[name]||[350,.07];beep(f,d,name==='bad'?'sawtooth':'square',name==='bad'?.055:.035);if(name==='good')setTimeout(()=>beep(860,.08),80);if(name==='taco'){setTimeout(()=>beep(554,.08),90);setTimeout(()=>beep(659,.16),180)}}
function music(on){clearInterval(musicTimer);musicTimer=null;if(!on)return;audio();const notes=[131,165,196,220,196,165,147,175];let i=0;musicTimer=setInterval(()=>{if(state.running&&!state.paused&&!state.gameOver)beep(notes[i++%notes.length],.055,'square',.012)},210)}

const state={running:false,paused:true,gameOver:false,lane:1,targetLane:1,x:laneX[1],score:0,clean:12,dirty:0,traction:100,vehicle:100,mult:1,streak:0,distance:0,minutes:420,pace:1,rows:[],rowSeq:0,toast:'',toastUntil:0,lift:0,liftTarget:null,liftKind:'',lockOff:false,nextTaco:620,tacoCount:0,ohlActive:false,lastTs:0,hi:JSON.parse(localStorage.getItem('trakwayTrailScores')||'[]')};
function reset(){Object.assign(state,{running:true,paused:false,gameOver:false,lane:1,targetLane:1,x:laneX[1],score:0,clean:12,dirty:0,traction:100,vehicle:100,mult:1,streak:0,distance:0,minutes:420,pace:1,rows:[],rowSeq:0,toast:'',toastUntil:0,lift:0,liftTarget:null,liftKind:'',lockOff:false,nextTaco:620,tacoCount:0,ohlActive:false,lastTs:performance.now()});
 for(let i=0;i<9;i++)state.rows.push(makeRow(H-i*rowH,true));
 $('home').hidden=true;$('panel').hidden=true;music(true);hud();
}
function makeRow(y,starter=false){const n=state.rowSeq++,surfaces=['panel','panel','panel'];let crossover=false,ohl=false,occupied=false,pickup=null;
 if(!starter){
  const r=Math.random();
  if(n%7===0){crossover=true;surfaces.fill('hard')}
  else{
   // create visible route choices / hazards; never block every lane at once
   if(r<.22){const l=Math.floor(Math.random()*3);surfaces[l]='gap'}
   else if(r<.35){const l=Math.floor(Math.random()*3);surfaces[l]=Math.random()<.65?'mud':'grass'}
   else if(r<.41){const l=Math.floor(Math.random()*3);surfaces[l]='water'}
   if(n>8&&n%18===0){ohl=true;surfaces[Math.floor(Math.random()*3)]='gap'}
   if(n>5&&n%13===0)occupied=true;
   if(Math.random()<.38){const side=Math.random()<.5?'left':'right';pickup={side,kind:Math.random()<.72?'clean':'dirty',taken:false}}
  }
 }
 return {id:n,y,surfaces,crossover,ohl,occupied,pickup,passed:false,warning:false};
}
function surfaceAtTruck(){let best=null,bd=1e9;for(const r of state.rows){const d=Math.abs((r.y+rowH/2)-truckY);if(d<bd){bd=d;best=r}}return best}
function closestWorkRow(){let best=null,bd=1e9;for(const r of state.rows){const d=Math.abs((r.y+rowH/2)-workY);if(d<bd){bd=d;best=r}}return bd<48?best:null}
function say(t,bad=false){state.toast=t;state.toastUntil=performance.now()+1250;$('toast').textContent=t;$('toast').classList.add('show');if(bad)sfx('bad')}
function safeAction(points=100){state.streak++;state.mult=state.streak>=12?10:state.streak>=8?6:state.streak>=5?4:state.streak>=2?2:1;state.score+=points*state.mult;sfx('good')}
function loseSafety(amount=0){state.streak=0;state.mult=1;if(amount)state.score=Math.max(0,state.score-amount)}
function startLift(kind,target){state.lift=.82;state.liftKind=kind;state.liftTarget=target;state.paused=false;sfx(kind==='lay'?'lay':'grab')}
function action(){if(!state.running||state.gameOver||state.paused||state.lift>0)return;audio();const r=closestWorkRow();if(!r){say('ALIGN WITH WORK ZONE');return}
 if(r.occupied){endGame('EXCLUSION ZONE','The work zone was occupied. Do not operate the crane until it is clear.');return}
 const surf=r.surfaces[state.lane];
 if(surf==='gap'){
  if(r.ohl&&!state.lockOff){endGame('ELECTRICAL DANGER','Required overhead-line control was not activated before the game lift.');return}
  if(state.clean+state.dirty<=0){say('NO PANELS LEFT',true);return}
  const dirty=state.clean<=0;
  if(dirty)state.dirty--;else state.clean--;
  r.surfaces[state.lane]=dirty?'panelDirty':'panel';
  if(dirty){state.traction=Math.max(0,state.traction-12);loseSafety(60);say('DIRTY PANEL · TRACTION −12',true)}else{safeAction(170);say('PANEL LAID +' + (170*state.mult))}
  startLift('lay',{x:laneX[state.lane],y:r.y+rowH/2});
  if(r.ohl){state.lockOff=false;sfx('lock')}
  return;
 }
 if(r.pickup&&!r.pickup.taken){const outer=(r.pickup.side==='left'?0:2);if(state.lane!==outer){say('MOVE TO '+r.pickup.side.toUpperCase()+' LANE');return}if(state.clean+state.dirty>=30){say('LOAD FULL · 30 MAX');return}
  const add=Math.min(4,30-state.clean-state.dirty);r.pickup.taken=true;if(r.pickup.kind==='clean'){state.clean+=add;safeAction(70);say('CLEAN +'+add)}else{state.dirty+=add;loseSafety(80);say('DIRTY +'+add+' · SCORE −80',true)}
  startLift('grab',{x:r.pickup.side==='left'?18:325,y:r.y+rowH/2});return;
 }
 say('SMOOTH +24');state.score+=24*state.mult;sfx('good')
}
function laneChange(dir){if(!state.running||state.gameOver||state.paused||state.lift>0)return;const nl=Math.max(0,Math.min(2,state.targetLane+dir));if(nl===state.targetLane)return;const r=surfaceAtTruck();if(!r||!r.crossover){say('WAIT FOR CROSSOVER');sfx('bad');return}state.targetLane=nl;state.lane=nl;sfx('move')}
function lockOff(){if(!$('lockBtn').hidden){state.lockOff=!state.lockOff;$('lockBtn').classList.toggle('active',state.lockOff);$('lockBtn').textContent=state.lockOff?'✓ LOCKED OFF':'🔒 LOCK OFF';say(state.lockOff?'CONTROL ACTIVE':'CONTROL RELEASED');sfx('lock')}}
function endGame(title,reason){if(state.gameOver)return;state.gameOver=true;state.paused=true;music(false);sfx('bad');const result={score:Math.round(state.score),distance:Math.round(state.distance),when:Date.now()};state.hi.push(result);state.hi.sort((a,b)=>b.score-a.score);state.hi=state.hi.slice(0,10);localStorage.setItem('trakwayTrailScores',JSON.stringify(state.hi));showPanel(title,`<div class="tipCard"><b>STOP WORK</b><p>${reason}</p></div><div class="tipCard"><b>SCORE ${result.score.toLocaleString()}</b><p>Distance ${result.distance} m · Taco breaks ${state.tacoCount} · Final SAFE ×${state.mult}</p></div><button class="menuBtn" data-p="retry">RETRY SHIFT</button><button class="menuBtn" data-p="home">MAIN MENU</button>`)}
function tacoBreak(){state.paused=true;state.tacoCount++;state.nextTaco+=680+state.tacoCount*90;sfx('taco');showPanel('🌮 TACO BREAK',`<div class="tipCard"><b>CHECKPOINT REACHED</b><p>Distance ${Math.round(state.distance)} m · Panels remaining ${state.clean+state.dirty}/30 · SAFE ×${state.mult}</p></div><div class="tipCard"><b>SHIFT AWARENESS</b><p>${tips[state.tacoCount%tips.length]}</p></div><button class="primary" data-p="continue">CONTINUE SHIFT</button>`)}
function hud(){const hh=String(Math.floor(state.minutes/60)%24).padStart(2,'0'),mm=String(Math.floor(state.minutes)%60).padStart(2,'0');$('shift').textContent=`${hh}:${mm}`;$('score').textContent=String(Math.round(state.score)).padStart(6,'0');$('panels').textContent=`${state.clean+state.dirty}/30`;$('mult').textContent=state.mult;$('clean').textContent=state.clean;$('dirty').textContent=state.dirty;$('tractionBar').style.width=state.traction+'%';$('vehicleBar').style.width=state.vehicle+'%'}
function update(dt){if(!state.running||state.paused||state.gameOver)return;state.x+=(laneX[state.targetLane]-state.x)*Math.min(1,dt*12);
 if(state.lift>0){state.lift-=dt;if(state.lift<=0){state.lift=0;state.liftTarget=null;state.liftKind=''}hud();return}
 const scroll=83+Math.min(26,state.distance/80);state.distance+=scroll*dt*.075;state.minutes+=dt*(.58+Math.min(2.2,state.distance/700));state.pace=1+Math.min(1.4,state.distance/1300);
 for(const r of state.rows)r.y+=scroll*dt;
 while(state.rows.length&&state.rows[0].y>H+rowH){state.rows.shift();const top=Math.min(...state.rows.map(r=>r.y));state.rows.push(makeRow(top-rowH))}
 // hazards at truck position
 const r=surfaceAtTruck();if(r&&!r.passed&&r.y+rowH/2>truckY-6){r.passed=true;const s=r.surfaces[state.lane];if(s==='grass'||s==='mud'||s==='water'){endGame('OFF TRAK',s==='water'?'The vehicle left the approved route and entered water/unsuitable ground.':'The vehicle left the approved panel/hardstanding route.');return}if(s==='gap'){state.vehicle=Math.max(0,state.vehicle-22);state.traction=Math.max(0,state.traction-18);loseSafety(120);say('MISSED PANEL · DAMAGE',true);if(state.vehicle<=0||state.traction<=0){endGame('STOP WORK','Vehicle condition or traction was lost after repeated missed/dirty panel sections.');return}}if(s==='panelDirty'){state.traction=Math.max(0,state.traction-7);loseSafety(25)}}
 // OHL proximity / lock button
 let ohl=false;for(const row of state.rows){if(row.ohl&&Math.abs(row.y+rowH/2-workY)<145)ohl=true}state.ohlActive=ohl;$('lockBtn').hidden=!ohl;if(!ohl){state.lockOff=false;$('lockBtn').classList.remove('active');$('lockBtn').textContent='🔒 LOCK OFF'}
 if(state.distance>=state.nextTaco)tacoBreak();
 if(performance.now()>state.toastUntil)$('toast').classList.remove('show');hud();
}
function drawGrass(){ctx.fillStyle='#75ad55';ctx.fillRect(0,0,W,H);for(let y=0;y<H;y+=34){for(let x=0;x<W;x+=43){const o=((x*13+y*7)%19)-9;ctx.fillStyle=((x+y)/10|0)%2?'#669b4d':'#84b860';ctx.globalAlpha=.32;ctx.beginPath();ctx.arc(x+o+12,y+9,9,0,Math.PI*2);ctx.fill()}}ctx.globalAlpha=1;ctx.fillStyle='#4b7e3d';ctx.fillRect(0,0,7,H);ctx.fillRect(W-7,0,7,H)}
function drawPanel(x,y,dirty=false){ctx.save();if(dirty){ctx.globalAlpha=.82;ctx.filter='sepia(.65) saturate(.7) brightness(.78)'}ctx.drawImage(panelImg,x-laneW/2,y,rowH*.52,rowH*.82);ctx.restore()}
function drawRow(r){for(let l=0;l<3;l++){const x=laneX[l],s=r.surfaces[l];if(r.crossover){ctx.fillStyle='#969c8e';ctx.fillRect(x-laneW/2-10,r.y+5,laneW+20,rowH-10);ctx.fillStyle='#b6bbad';for(let yy=r.y+12;yy<r.y+rowH-8;yy+=16)ctx.fillRect(x-laneW/2-7,yy,laneW+14,3);continue}if(s==='panel'||s==='panelDirty')drawPanel(x,r.y+4,s==='panelDirty');else if(s==='gap'){ctx.fillStyle='#5b412c';ctx.fillRect(x-laneW/2,r.y+7,laneW,rowH-12);ctx.fillStyle='#76543a';for(let k=0;k<5;k++)ctx.fillRect(x-laneW/2+10+(k*17)%55,r.y+18+(k*14)%55,9,7);ctx.strokeStyle='#f4c72c';ctx.setLineDash([5,5]);ctx.strokeRect(x-laneW/2+3,r.y+10,laneW-6,rowH-18);ctx.setLineDash([])}else if(s==='mud'||s==='grass'){ctx.fillStyle=s==='mud'?'#68452e':'#78aa58';ctx.fillRect(x-laneW/2,r.y,laneW,rowH);if(s==='mud'){ctx.fillStyle='#4e3324';for(let k=0;k<5;k++)ctx.fillRect(x-laneW/2+8+(k*14)%55,r.y+18+(k*12)%60,8,6)}}else if(s==='water'){ctx.fillStyle='#3b98b4';ctx.fillRect(x-laneW/2,r.y+5,laneW,rowH-10);ctx.strokeStyle='#80d2df';for(let k=0;k<4;k++){ctx.beginPath();ctx.moveTo(x-laneW/2+5,r.y+18+k*18);ctx.quadraticCurveTo(x,r.y+10+k*18,x+laneW/2-5,r.y+18+k*18);ctx.stroke()}}}
 if(r.pickup&&!r.pickup.taken){const img=r.pickup.kind==='clean'?cleanStack:dirtyStack;const x=r.pickup.side==='left'?2:W-58;ctx.drawImage(img,x,r.y+17,56,56);const good=r.pickup.kind==='clean';ctx.fillStyle=good?'#1a8b39':'#b54a26';ctx.beginPath();ctx.arc(r.pickup.side==='left'?52:W-52,r.y+16,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 13px sans-serif';ctx.textAlign='center';ctx.fillText(good?'✓':'!',r.pickup.side==='left'?52:W-52,r.y+21)}
 if(r.occupied){const cx=laneX[1]+22;ctx.fillStyle='#ff8d25';ctx.beginPath();ctx.arc(cx,r.y+36,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#253a36';ctx.fillRect(cx-6,r.y+44,12,23);ctx.strokeStyle='#ffedb0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx-3,r.y+64);ctx.lineTo(cx-8,r.y+79);ctx.moveTo(cx+3,r.y+64);ctx.lineTo(cx+8,r.y+79);ctx.stroke();ctx.fillStyle='#101713dd';ctx.fillRect(cx-34,r.y+4,68,19);ctx.fillStyle='#ffd83d';ctx.font='900 9px sans-serif';ctx.textAlign='center';ctx.fillText('WAIT',cx,r.y+17)}
 if(r.ohl){ctx.strokeStyle='#e8bc1d';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(14,r.y+11);ctx.lineTo(14,r.y+76);ctx.moveTo(W-14,r.y+11);ctx.lineTo(W-14,r.y+76);ctx.moveTo(14,r.y+16);ctx.lineTo(W-14,r.y+16);ctx.stroke();ctx.fillStyle='#ffe54a';ctx.beginPath();ctx.moveTo(W/2,r.y+22);ctx.lineTo(W/2-11,r.y+45);ctx.lineTo(W/2+11,r.y+45);ctx.closePath();ctx.fill();ctx.fillStyle='#141812';ctx.font='900 13px sans-serif';ctx.fillText('⚡',W/2,r.y+41)}
}
function drawTruck(){const x=state.x;ctx.save();ctx.translate(x,truckY);if(state.lift>0){ctx.strokeStyle='#efc821';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-53,30);ctx.lineTo(53,30);ctx.stroke();ctx.fillStyle='#222';ctx.fillRect(-61,25,10,13);ctx.fillRect(51,25,10,13)}ctx.drawImage(truck,-38,-88,76,172);if(state.lift>0&&state.liftTarget){const tx=state.liftTarget.x-x,ty=state.liftTarget.y-truckY;ctx.strokeStyle='#1b5b35';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-73);ctx.lineTo(tx*.48,ty*.65);ctx.lineTo(tx,ty);ctx.stroke();ctx.strokeStyle='#65dc62';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#e2c31d';ctx.fillRect(tx-9,ty-4,18,8)}ctx.restore()}
function draw(){drawGrass();const rows=[...state.rows].sort((a,b)=>a.y-b.y);for(const r of rows)drawRow(r);ctx.fillStyle='#10381888';ctx.fillRect(0,0,6,H);ctx.fillRect(W-6,0,6,H);ctx.strokeStyle='#e2d23288';ctx.setLineDash([6,7]);ctx.strokeRect(5,workY-43,W-10,86);ctx.setLineDash([]);drawTruck();if(!state.running){ctx.fillStyle='#0009';ctx.fillRect(0,0,W,H)}}
function frame(ts){const dt=Math.min(.05,(ts-(state.lastTs||ts))/1000);state.lastTs=ts;update(dt);draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);

function showPanel(title,html){state.paused=true;$('panelTitle').textContent=title;$('panelBody').innerHTML=html;$('panel').hidden=false}
function hidePanel(){if(!state.gameOver&&state.running){state.paused=false;$('panel').hidden=true;state.lastTs=performance.now()}else $('panel').hidden=true}
function home(){state.running=false;state.paused=true;state.gameOver=false;music(false);$('panel').hidden=true;$('home').hidden=false}
function how(){showPanel('HOW TO PLAY',`<div class="tipCard"><b>BUILD THE ROAD</b><p>The lorry reverses along the route. Use LEFT / RIGHT only at a hardstanding crossover. Grass, mud and water are not playable route surfaces.</p></div><div class="tipCard"><b>GRAB / LAY</b><p>Time the orange action button as a clean or dirty panel stack reaches the work zone. A controlled lift animation stops the vehicle while the crane operates. Maximum load: 30 panels.</p></div><div class="tipCard"><b>CLEAN VS DIRTY</b><p>Clean panels build score. Dirty panels cost points and reduce traction when they must be laid.</p></div><div class="tipCard"><b>GS6 / OHL EVENT</b><p>When the yellow overhead-line gate appears, activate the blue LOCK OFF game control before the required panel operation. This is awareness gameplay only — real OHL work follows the required procedure and site controls.</p></div><div class="tipCard"><b>WORK ZONE</b><p>Do not operate while the exclusion zone is occupied. Sometimes the correct game action is to wait.</p></div><div class="tipCard"><b>🌮 TACO BREAK</b><p>Checkpoint, score bank and a short safety-awareness reminder before the shift continues.</p></div>`)}
function scores(){const rows=state.hi.length?state.hi.map((s,i)=>`<div class="scoreRow"><strong>${i+1}</strong><span>${s.distance} m</span><b>${s.score.toLocaleString()}</b></div>`).join(''):'<div class="tipCard"><p>No scores yet. Start a shift.</p></div>';showPanel('HIGH SCORES',rows)}
function menu(){if(!state.running){home();return}showPanel('PAUSED',`<button class="menuBtn" data-p="continue">RESUME SHIFT</button><button class="menuBtn" data-p="how">HOW TO PLAY</button><button class="menuBtn" data-p="scores">HIGH SCORES</button><button class="menuBtn" data-p="home">MAIN MENU</button>`)}

$('leftBtn').addEventListener('pointerdown',()=>laneChange(-1));$('rightBtn').addEventListener('pointerdown',()=>laneChange(1));$('actionBtn').addEventListener('pointerdown',action);$('lockBtn').addEventListener('pointerdown',lockOff);$('menuBtn').onclick=menu;$('closePanel').onclick=hidePanel;
document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='a')laneChange(-1);if(e.key==='ArrowRight'||e.key==='d')laneChange(1);if(e.key===' '){e.preventDefault();action()}if(e.key==='l')lockOff();if(e.key==='Escape')menu()});
$('home').addEventListener('click',e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(a==='play'){audio();reset()}if(a==='how')how();if(a==='scores')scores()});
$('panelBody').addEventListener('click',e=>{const p=e.target.closest('[data-p]')?.dataset.p;if(!p)return;if(p==='continue')hidePanel();if(p==='retry'){hidePanel();reset()}if(p==='home')home();if(p==='how')how();if(p==='scores')scores()});
window.addEventListener('blur',()=>{if(state.running&&!state.paused&&!state.gameOver)menu()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused&&!state.gameOver)menu()});
function fit(){const vv=visualViewport,w=vv?.width||innerWidth,h=vv?.height||innerHeight,s=Math.min(w/375,h/667);$('app').style.setProperty('--scale',s);$('app').style.left=((vv?.offsetLeft||0)+w/2)+'px';$('app').style.top=((vv?.offsetTop||0)+h/2)+'px'}fit();addEventListener('resize',fit);visualViewport?.addEventListener('resize',fit);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
hud();home();
})();
