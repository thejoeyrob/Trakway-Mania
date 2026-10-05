(() => {
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d');
const W=canvas.width,H=canvas.height;
const START_HTML=$('overlay').innerHTML;
const lanes=[100,180,260], rowH=58, truckY=408, workY=307;
const COLORS={grass:'#7ca55e',grass2:'#6a944f',hard:'#aeb1aa',panel:'#b9beb4',panelDark:'#858b84',mud:'#76573b',water:'#4d8ca8',yellow:'#f3c61d',orange:'#ea582a',green:'#71bd44'};
const safetyCards=[
  'Keep the work area controlled. If the lifting zone is not clear, WAIT.',
  'Ground conditions can change. Hardstanding is fine; unsuitable ground needs the planned Trakway route.',
  'Crane work is controlled work. In this game the unit stops for every GRAB / LAY action.',
  'A test lift is part of the real method. The game compresses it into the clamp animation.',
  'Overhead-line work needs the correct site-specific controls and procedure. The LOCK OFF button is only a game abstraction.',
  'Dirty, buried or changed-condition panels can introduce different recovery hazards. Inspect and report issues.'
];
let audioCtx=null,musicTimer=null,musicStep=0;
function audio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}
function tone(freq=440,dur=.08,type='square',vol=.035,delay=0){try{const a=audio(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,a.currentTime+delay);g.gain.linearRampToValueAtTime(vol,a.currentTime+delay+.008);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+delay+dur);o.connect(g);g.connect(a.destination);o.start(a.currentTime+delay);o.stop(a.currentTime+delay+dur+.02)}catch{}}
function sfx(kind){if(kind==='move')tone(180,.04,'square',.018);if(kind==='clamp'){tone(115,.08,'square',.05);tone(86,.12,'square',.035,.07);tone(330,.08,'square',.025,.18)}if(kind==='good'){tone(520,.07);tone(690,.08,'square',.03,.08)}if(kind==='bad'){tone(95,.22,'sawtooth',.045);tone(70,.24,'square',.035,.12)}if(kind==='electric'){tone(980,.18,'square',.05);tone(520,.3,'sawtooth',.05,.08)}if(kind==='taco'){[392,494,587,784].forEach((f,i)=>tone(f,.11,'square',.03,i*.1))}}
function startMusic(){stopMusic();musicStep=0;musicTimer=setInterval(()=>{if(!state.playing||state.paused)return;const seq=[196,220,247,220,196,294,247,220,174,196,220,196,165,220,247,294];tone(seq[musicStep++%seq.length],.06,'square',.012)},180)}
function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=null}}

const state={playing:false,paused:true,over:false,score:0,clean:12,dirty:0,slip:0,damage:0,lane:1,targetLane:1,rows:[],pickups:[],scroll:0,speed:83,distance:0,shiftMinutes:420,safeStreak:0,mult:1,lock:false,action:null,actionT:0,nextTaco:900,tacoNo:0,runSeed:1,banner:'',bannerT:0,blocked:false,gs6Active:false,meters:0};
function reset(){Object.assign(state,{playing:true,paused:false,over:false,score:0,clean:12,dirty:0,slip:0,damage:0,lane:1,targetLane:1,rows:[],pickups:[],scroll:0,speed:83,distance:0,shiftMinutes:420,safeStreak:0,mult:1,lock:false,action:null,actionT:0,nextTaco:900,tacoNo:0,runSeed:(Date.now()&0xffff),banner:'ROUTE OPEN',bannerT:1.4,blocked:false,gs6Active:false,meters:0});
  let y=-rowH*2;for(let i=0;i<14;i++){state.rows.push(makeRow(y,i));y+=rowH} updateHUD(); startMusic();
}
function rand(){state.runSeed=(state.runSeed*1664525+1013904223)>>>0;return state.runSeed/4294967296}
function safeLaneForIndex(i){const phase=Math.floor(i/8)%4;return [1,1,0,2][phase]}
function makeRow(y,index){
  const d=state.distance+index*12,r=rand(); let types=['grass','grass','grass'];
  let route=safeLaneForIndex(Math.floor(d/12));
  let kind='route',cross=false,gs6=false,blocked=false;
  if(Math.floor(d/12)%8===0){types=['hard','hard','hard'];cross=true;kind='hard'}
  else{types[route]='panel';}
  // Missing route panels become timing challenges.
  if(d>120 && r<.24 && !cross){types[route]=r<.13?'gap':'softgap';kind=types[route]}
  // Visual environment on non-route lanes.
  for(let i=0;i<3;i++)if(i!==route&&types[i]==='grass')types[i]=r>.82?'mud':(r>.94?'water':'grass');
  // GS6 signature event around fixed intervals.
  const cycle=Math.floor(d)%1500;
  if(d>650 && cycle>980 && cycle<1160){gs6=true;if(!cross&&Math.abs(cycle-1060)<32){types[route]='gs6gap';kind='gs6gap'}}
  // Rare exclusion-zone interruption at a lay point.
  if((kind==='gap'||kind==='softgap') && d>500 && rand()<.14)blocked=true;
  return {y,index,types,route,cross,kind,gs6,blocked,laid:false,dirtyLaid:false,checked:false};
}
function recycleRows(){
  while(state.rows.length && state.rows[state.rows.length-1].y>H+rowH){state.rows.pop()}
  while(state.rows.length<14){const first=state.rows[0],idx=(first?.index??0)-1,y=(first?.y??0)-rowH;state.rows.unshift(makeRow(y,idx))}
}
function spawnPickup(row){if(state.pickups.length>5||rand()>.25||row.cross)return;const side=rand()<.5?'left':'right';const dirty=rand()<.28;state.pickups.push({y:row.y-4,side,dirty,count:dirty?2:3,taken:false})}
function update(dt){if(!state.playing||state.paused||state.over)return;
  state.bannerT=Math.max(0,state.bannerT-dt);
  if(state.action){state.actionT-=dt;if(state.actionT<=0){state.action=null;state.paused=false}return}
  const difficulty=Math.min(1,state.distance/4500);state.speed=83+difficulty*60;const dy=state.speed*dt;
  state.shiftMinutes+=dt*(.62+difficulty*1.9);state.distance+=dt*(8+difficulty*5);state.meters+=dt*(5+difficulty*3);
  for(const row of state.rows)row.y+=dy;for(const p of state.pickups)p.y+=dy;
  recycleRows();
  // New pickup on rows that enter top.
  const top=state.rows[0];if(top&&!top.pickupChecked){top.pickupChecked=true;spawnPickup(top)}
  // GS6 visual/state.
  state.gs6Active=state.rows.some(r=>r.gs6 && r.y>200 && r.y<470);
  if(!state.gs6Active && state.lock)toggleLock(false);
  // Smooth lane move only if the row under the truck permits lateral movement.
  if(state.targetLane!==state.lane){const row=currentRow();if(row&&(row.cross||row.types[state.lane]==='hard'))state.lane=state.targetLane;else{state.targetLane=state.lane;banner('NO CROSSOVER',.8);sfx('bad')}}
  // Check row when it reaches truck wheels.
  for(const row of state.rows){if(!row.checked && row.y+rowH/2>=truckY){row.checked=true;driveOver(row)}}
  state.pickups=state.pickups.filter(p=>p.y<H+50&&!p.taken);
  if(state.distance>=state.nextTaco){state.nextTaco+=950;showTaco();return}
  updateHUD();
}
function currentRow(){return state.rows.reduce((best,r)=>Math.abs((r.y+rowH/2)-truckY)<Math.abs(((best?.y??999)+rowH/2)-truckY)?r:best,null)}
function workRow(){return state.rows.reduce((best,r)=>Math.abs((r.y+rowH/2)-workY)<Math.abs(((best?.y??999)+rowH/2)-workY)?r:best,null)}
function driveOver(row){const type=row.types[state.lane];if(type==='hard'||type==='panel'){reward(12,'SMOOTH')}else if(type==='dirtypanel'){state.slip=Math.min(100,state.slip+10);state.score=Math.max(0,state.score-75);banner('DIRTY PANEL · TRACTION ↓',1)}else if(type==='gap'||type==='gs6gap'){state.damage=Math.min(100,state.damage+30);state.slip=Math.min(100,state.slip+18);state.score=Math.max(0,state.score-250);state.safeStreak=0;calcMult();banner('PANEL GAP · VEHICLE HIT',1.2);sfx('bad')}else if(type==='softgap'||type==='grass'||type==='mud'||type==='water'){gameOver('OFF TRAK','Unsuitable ground reached without the planned Trakway route.');return}
  if(state.slip>=100)gameOver('TRACTION LOST','Too much slip accumulated. Stop work.');if(state.damage>=100)gameOver('VEHICLE STOP','Too much vehicle damage accumulated. Stop work.')
}
function move(dir){if(!state.playing||state.paused||state.over)return;state.targetLane=Math.max(0,Math.min(2,state.lane+dir));sfx('move')}
function toggleLock(force){const next=force===undefined?!state.lock:force;state.lock=next;$('lockBtn').classList.toggle('active',next);$('lockBtn').setAttribute('aria-pressed',String(next));if(next)banner('LOCK OFF ACTIVE · GAME CONTROL',.9)}
function action(){if(!state.playing||state.paused||state.over)return;audio();const row=workRow();if(!row)return;const lane=state.lane, type=row.types[lane];
  if(row.blocked && Math.abs((row.y+rowH/2)-workY)<34){gameOver('EXCLUSION ZONE BREACH','The work zone was occupied. The correct action was to wait.');return}
  if((type==='gap'||type==='softgap'||type==='gs6gap') && Math.abs((row.y+rowH/2)-workY)<34){
    if(type==='gs6gap'&&!state.lock){sfx('electric');gameOver('ELECTRICAL DANGER','Required overhead-line game control was not activated. Real work requires the full approved OHL procedure.');return}
    if(state.clean+state.dirty<=0){banner('NO PANELS ON TRUCK',1);sfx('bad');return}
    const dirty=state.clean<=0; if(dirty)state.dirty--; else state.clean--;
    row.types[lane]=dirty?'dirtypanel':'panel';row.laid=true;row.dirtyLaid=dirty;craneAction('lay',lane,dirty? 'DIRTY PANEL LAID':'PANEL LAID');
    if(dirty){state.score=Math.max(0,state.score-120);state.safeStreak=0;calcMult()}else reward(220,'PERFECT LAY');return;
  }
  const candidates=state.pickups.filter(p=>!p.taken&&Math.abs(p.y-workY)<38&&((p.side==='left'&&lane===0)||(p.side==='right'&&lane===2)));if(candidates.length){const p=candidates[0],space=30-(state.clean+state.dirty);if(space<=0){banner('LOAD FULL · 30 MAX',1);sfx('bad');return}const take=Math.min(space,p.count);p.taken=true;if(p.dirty){state.dirty+=take;state.score=Math.max(0,state.score-60*take);state.safeStreak=0;calcMult();craneAction('grab',lane,`DIRTY ×${take} · SCORE ↓`)}else{state.clean+=take;craneAction('grab',lane,`CLEAN ×${take}`);reward(140*take,'CLEAN PICKUP')}return}
  banner('NO LIFT IN ZONE',.65);tone(140,.05,'square',.018)
}
function craneAction(kind,lane,label){state.paused=true;state.action={kind,lane,label};state.actionT=.72;sfx('clamp');banner('STOP · CLAMP · TEST LIFT · '+label,1.15);setTimeout(()=>{if(state.playing&&!state.over&&state.action){state.action=null;state.paused=false}},730)}
function reward(base,label){state.safeStreak++;calcMult();state.score+=Math.round(base*state.mult);if(label)banner(`${label}  +${Math.round(base*state.mult)}`,.8);sfx('good')}
function calcMult(){state.mult=state.safeStreak>=18?4:state.safeStreak>=10?3:state.safeStreak>=5?2:1}
function banner(text,t=.9){state.banner=text;state.bannerT=t}
function showTaco(){state.paused=true;state.tacoNo++;sfx('taco');const card=safetyCards[(state.tacoNo-1)%safetyCards.length];showOverlay(`<div class="panel"><div class="taco">🌮</div><h2>TACO BREAK</h2><p class="event">CHECKPOINT ${state.tacoNo}</p><p class="brief">${card}</p><p class="brief"><strong>SHIFT:</strong> ${formatTime(state.shiftMinutes)} &nbsp; <strong>SCORE:</strong> ${state.score.toLocaleString()}</p><button class="primary" id="resumeTaco">BACK TO IT</button></div>`);setTimeout(()=>$('resumeTaco')?.addEventListener('click',()=>{hideOverlay();state.paused=false}),0)}
function gameOver(title,msg){state.over=true;state.paused=true;stopMusic();sfx('bad');showOverlay(`<div class="panel"><h2>${title}</h2><p class="brief">${msg}</p><div class="result-score">${state.score.toLocaleString()}</div><p class="event">${Math.floor(state.distance)} m · ${formatTime(state.shiftMinutes)}</p><button class="primary" id="retryBtn">START NEW SHIFT</button><button class="secondary" id="menuReturn">MAIN MENU</button></div>`);setTimeout(()=>{$('retryBtn')?.addEventListener('click',()=>{hideOverlay();reset()});$('menuReturn')?.addEventListener('click',showStart)},0)}
function formatTime(m){let mins=Math.floor(m)%1440;return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0')}
function updateHUD(){$('clock').textContent=formatTime(state.shiftMinutes);$('score').textContent=String(state.score).padStart(6,'0');$('panels').textContent=`${state.clean+state.dirty}/30`;$('cleanCount').textContent=state.clean;$('dirtyCount').textContent=state.dirty;$('mult').textContent=state.mult;$('slipBar').style.width=state.slip+'%';$('damageBar').style.width=state.damage+'%';$('slipBar').style.background=state.slip>70?'#e14a22':'#f2c441';$('damageBar').style.background=state.damage>70?'#e14a22':'#78bd52'}

function draw(){ctx.clearRect(0,0,W,H);drawGround();for(const row of state.rows)drawRow(row);for(const p of state.pickups)drawPickup(p);drawWorkBand();drawTruck();if(state.bannerT>0)drawBanner();requestAnimationFrame(draw)}
function drawGround(){ctx.fillStyle=COLORS.grass;ctx.fillRect(0,0,W,H);for(let y=0;y<H;y+=20){ctx.fillStyle=(y/20%2)?'#7fa960':'#779f59';ctx.fillRect(0,y,W,10)}ctx.fillStyle='#5b7848';ctx.fillRect(62,0,236,H);ctx.fillStyle='#6d8b56';ctx.fillRect(68,0,224,H)}
function drawRow(row){const y=row.y;for(let i=0;i<3;i++)drawTile(lanes[i]-30,y,60,rowH,row.types[i],row);if(row.gs6)drawGS6(row);if(row.blocked&&y<workY+60&&y>workY-90)drawWorker(180,y+28)}
function drawTile(x,y,w,h,type,row){if(type==='grass'){ctx.fillStyle=COLORS.grass2;ctx.fillRect(x,y,w,h);return}if(type==='mud'){ctx.fillStyle=COLORS.mud;ctx.fillRect(x,y,w,h);for(let i=0;i<5;i++){ctx.fillStyle='#59412e';ctx.fillRect(x+8+i*10,y+12+(i%2)*17,6,10)}return}if(type==='water'){ctx.fillStyle=COLORS.water;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#8fc6da';ctx.beginPath();ctx.moveTo(x+6,y+18);ctx.lineTo(x+w-5,y+18);ctx.moveTo(x+10,y+36);ctx.lineTo(x+w-10,y+36);ctx.stroke();return}if(type==='hard'){ctx.fillStyle=COLORS.hard;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#969b94';ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.fillStyle='#8f948d';for(let i=0;i<4;i++)ctx.fillRect(x+6+i*14,y+7+(i%2)*19,4,3);return}
  if(type==='gap'||type==='gs6gap'||type==='softgap'){ctx.fillStyle=type==='gap'||type==='gs6gap'?'#6b6c66':COLORS.grass2;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#f3c61d';ctx.setLineDash([5,5]);ctx.strokeRect(x+3,y+3,w-6,h-6);ctx.setLineDash([]);ctx.fillStyle='#101410';ctx.font='900 8px monospace';ctx.textAlign='center';ctx.fillText(type==='gs6gap'?'GS6 GAP':'LAY',x+w/2,y+h/2+3);return}
  ctx.fillStyle=type==='dirtypanel'?'#8c806a':COLORS.panel;ctx.fillRect(x,y,w,h);ctx.fillStyle=COLORS.panelDark;ctx.fillRect(x+3,y+4,w-6,4);ctx.fillRect(x+3,y+h-8,w-6,4);ctx.strokeStyle='#70756f';ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.strokeStyle='#555b56';for(let xx=x+12;xx<x+w;xx+=16){ctx.beginPath();ctx.moveTo(xx,y+9);ctx.lineTo(xx,y+h-9);ctx.stroke()}ctx.fillStyle='#333';ctx.fillRect(x+5,y+5,3,3);ctx.fillRect(x+w-8,y+h-8,3,3);if(type==='dirtypanel'){ctx.fillStyle='#65513c';ctx.beginPath();ctx.arc(x+18,y+24,10,0,Math.PI*2);ctx.arc(x+43,y+39,8,0,Math.PI*2);ctx.fill()}}
function drawGS6(row){const y=row.y;ctx.strokeStyle='#efcf2b';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(57,y+7);ctx.lineTo(303,y+7);ctx.stroke();ctx.strokeStyle='#222';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(67,y);ctx.lineTo(67,y+rowH);ctx.moveTo(293,y);ctx.lineTo(293,y+rowH);ctx.stroke();ctx.fillStyle='#f4d127';ctx.font='900 8px Arial';ctx.textAlign='center';ctx.fillText('GS6',180,y+17)}
function drawPickup(p){const x=p.side==='left'?30:330,y=p.y;ctx.save();ctx.translate(x,y);ctx.fillStyle=p.dirty?'#83664a':'#c2c8bd';ctx.strokeStyle='#141714';ctx.lineWidth=2;for(let i=0;i<p.count;i++){ctx.fillRect(-17,-10-i*5,34,13);ctx.strokeRect(-17,-10-i*5,34,13)}if(p.dirty){ctx.fillStyle='#5d4937';ctx.beginPath();ctx.arc(-5,-9,5,0,Math.PI*2);ctx.arc(8,-1,4,0,Math.PI*2);ctx.fill()}ctx.fillStyle='#171a17';ctx.font='900 7px monospace';ctx.textAlign='center';ctx.fillText(p.dirty?'DIRTY':'CLEAN',0,17);ctx.restore()}
function drawWorkBand(){ctx.fillStyle='#f3c61d22';ctx.fillRect(68,workY-19,224,38);ctx.strokeStyle='#f3c61d77';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(68,workY);ctx.lineTo(292,workY);ctx.stroke();ctx.setLineDash([])}
function drawTruck(){const x=lanes[state.lane],y=truckY;ctx.save();ctx.translate(x,y);ctx.lineWidth=3;ctx.strokeStyle='#0d100e';// shadow
  ctx.fillStyle='#0005';ctx.fillRect(-31,-93,62,139);
  // wheels - 3 axle look
  ctx.fillStyle='#111';for(const yy of [-60,-25,25]){ctx.fillRect(-37,yy-9,11,18);ctx.fillRect(26,yy-9,11,18)}
  // chassis/bed
  ctx.fillStyle='#424b46';ctx.strokeRect(-29,-82,58,86);ctx.fillRect(-29,-82,58,86);
  // loaded panels on bed
  const load=Math.min(6,Math.ceil((state.clean+state.dirty)/5));for(let i=0;i<load;i++){ctx.fillStyle=i>=Math.ceil(state.clean/5)?'#86735c':'#bfc4bb';ctx.fillRect(-24,-59+i*9,48,7);ctx.strokeStyle='#666';ctx.strokeRect(-24,-59+i*9,48,7)}
  // cab at bottom / front faces downward
  ctx.fillStyle=COLORS.green;ctx.strokeStyle='#111';ctx.lineWidth=3;roundRect(-31,2,62,55,10,true,true);ctx.fillStyle='#99df69';ctx.fillRect(-25,31,50,15);ctx.fillStyle='#22322d';ctx.fillRect(-23,37,46,12);ctx.fillStyle='#111';ctx.font='900 7px Arial';ctx.textAlign='center';ctx.fillText('SUNBELT',0,22);ctx.font='700 5px Arial';ctx.fillText('TRAKWAY',0,29);
  // rear fairing and stabiliser beam at working end
  ctx.fillStyle='#202722';ctx.fillRect(-36,-89,72,12);ctx.fillStyle='#f3c61d';for(let i=-30;i<30;i+=12){ctx.save();ctx.translate(i,-83);ctx.rotate(-.65);ctx.fillRect(-4,-8,5,16);ctx.restore()}
  // rear mounted crane base and folded arm
  ctx.fillStyle='#315a38';ctx.beginPath();ctx.arc(0,-84,10,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#315a38';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-84);ctx.lineTo(-14,-101);ctx.lineTo(-25,-94);ctx.moveTo(2,-84);ctx.lineTo(18,-100);ctx.lineTo(26,-91);ctx.stroke();
  // outriggers deploy during action
  if(state.action){ctx.strokeStyle='#242a25';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-28,-80);ctx.lineTo(-50,-80);ctx.moveTo(28,-80);ctx.lineTo(50,-80);ctx.stroke();ctx.fillStyle='#cabf91';ctx.beginPath();ctx.arc(-52,-80,6,0,Math.PI*2);ctx.arc(52,-80,6,0,Math.PI*2);ctx.fill();drawCraneAction(state.action)}
  // reverse lights
  ctx.fillStyle='#fff3b0';ctx.fillRect(-20,-90,7,4);ctx.fillRect(13,-90,7,4);ctx.restore()}
function drawCraneAction(a){ctx.save();ctx.strokeStyle='#315a38';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-84);if(a.kind==='lay'){ctx.lineTo(0,-114);ctx.lineTo(0,-136)}else if(a.lane===0){ctx.lineTo(-22,-101);ctx.lineTo(-55,-110)}else{ctx.lineTo(22,-101);ctx.lineTo(55,-110)}ctx.stroke();const tx=a.kind==='lay'?0:(a.lane===0?-59:59),ty=a.kind==='lay'?-143:-113;ctx.fillStyle='#18211c';ctx.fillRect(tx-9,ty-4,18,8);ctx.strokeStyle='#f3c61d';ctx.lineWidth=2;ctx.strokeRect(tx-9,ty-4,18,8);ctx.restore()}
function drawWorker(x,y){ctx.save();ctx.translate(x,y);ctx.fillStyle='#ff8a29';ctx.beginPath();ctx.arc(0,-7,5,0,Math.PI*2);ctx.fill();ctx.fillRect(-5,-2,10,15);ctx.fillStyle='#222';ctx.fillRect(-7,12,5,9);ctx.fillRect(2,12,5,9);ctx.restore();ctx.fillStyle='#d74c2c';ctx.font='900 7px Arial';ctx.textAlign='center';ctx.fillText('WAIT · ZONE OCCUPIED',180,y-18)}
function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill)ctx.fill();if(stroke)ctx.stroke()}
function drawBanner(){ctx.fillStyle='#111a14dd';ctx.fillRect(48,65,264,30);ctx.strokeStyle='#e6c747';ctx.strokeRect(48.5,65.5,263,29);ctx.fillStyle='#ffe67b';ctx.font='900 10px Arial';ctx.textAlign='center';ctx.fillText(state.banner,180,84)}

function showOverlay(html){const o=$('overlay');o.innerHTML=html;o.classList.add('open')}
function hideOverlay(){$('overlay').classList.remove('open');$('overlay').innerHTML=''}
function showStart(){state.playing=false;state.paused=true;stopMusic();showOverlay(START_HTML);setTimeout(wireStart,0)}
function wireStart(){const start=$('startBtn')||$('startAgain');start?.addEventListener('click',()=>{audio();hideOverlay();reset()});$('howBtn')?.addEventListener('click',showHow)}
function showHow(){showOverlay(`<div class="panel"><h2>HOW TO PLAY</h2><div class="how"><p><strong>◀ ▶ MOVE:</strong> change lane only where hardstanding/crossover allows it.</p><p><strong>GRAB / LAY:</strong> time the action when a clean/dirty panel stack or missing route panel reaches the yellow work line. The unit stops automatically for the lift animation.</p><p><strong>30 MAX:</strong> the truck carries up to 30 standard panels in this game.</p><p><strong>CLEAN / DIRTY:</strong> clean panels score. Dirty panels cost points and add traction loss when used.</p><p><strong>OFF TRAK:</strong> grass, mud or water without the planned route is game over.</p><p><strong>GS6 EVENT:</strong> use the game LOCK OFF control before the special missing-panel lift. It is a simplified awareness mechanic, not an instruction for real overhead-line work.</p><p><strong>WORK ZONE:</strong> if a person is shown in the crane work zone, wait. Operating the clamp ends the run.</p><p><strong>🌮 TACO BREAK:</strong> checkpoints bank your progress and show a short safety-awareness reminder.</p></div><button class="primary" id="howBack">BACK</button></div>`);setTimeout(()=>$('howBack')?.addEventListener('click',()=>{state.playing?showMenu():showStart()}),0)}
function showMenu(){if(!state.playing){showStart();return}state.paused=true;showOverlay(`<div class="panel"><h2>SHIFT PAUSED</h2><div class="menu-list"><button id="resumeBtn">RESUME</button><button id="howMenu">HOW TO PLAY</button><button id="restartBtn">RESTART SHIFT</button><button id="quitBtn">MAIN MENU</button></div><p class="warning">Game mechanics are stylised awareness cues only and do not replace the current approved method statement or job-specific controls.</p></div>`);setTimeout(()=>{$('resumeBtn').onclick=()=>{hideOverlay();state.paused=false};$('howMenu').onclick=showHow;$('restartBtn').onclick=()=>{hideOverlay();reset()};$('quitBtn').onclick=showStart},0)}

$('leftBtn').addEventListener('pointerdown',e=>{e.preventDefault();move(-1)});$('rightBtn').addEventListener('pointerdown',e=>{e.preventDefault();move(1)});$('actionBtn').addEventListener('pointerdown',e=>{e.preventDefault();action()});$('lockBtn').addEventListener('click',()=>toggleLock());$('menuBtn').addEventListener('click',showMenu);$('startBtn').addEventListener('click',()=>{audio();hideOverlay();reset()});$('howBtn').addEventListener('click',showHow);
addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='a')move(-1);if(e.key==='ArrowRight'||e.key==='d')move(1);if(e.key===' '||e.key==='Enter'){e.preventDefault();action()}if(e.key==='l')toggleLock();if(e.key==='Escape')showMenu()});
function fit(){const scale=Math.min(innerWidth/390,innerHeight/844,1.25);document.documentElement.style.setProperty('--scale',scale)}addEventListener('resize',fit);fit();
let last=performance.now();function loop(t){const dt=Math.min(.05,(t-last)/1000);last=t;update(dt);requestAnimationFrame(loop)}requestAnimationFrame(loop);requestAnimationFrame(draw);updateHUD();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
