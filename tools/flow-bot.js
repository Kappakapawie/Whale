// Food-chain flow check: a hunting bot plays a new game for N simulated minutes and prints when each species
// unlocks, the size over time and what killed it. Needs Playwright and the game served on :8123.
// Usage: node tools/flow-bot.js 30
const {chromium}=require('playwright');const MIN=+process.argv[2]||30;(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8123');await p.waitForTimeout(1200);await p.mouse.click(640,400);await p.waitForTimeout(300);
const res=await p.evaluate((MIN)=>{game.reset(1);game.state='playing';const w=game.whale;const log=[];let lastTop=w.topSpecies().id,lastT=0;const dt=1/30;let deaths=0;const sizeAt={};
 const origRespawn=game.respawnAtSurface.bind(game);const why={};game.respawnAtSurface=()=>{deaths++;why[w.lastDamage]=(why[w.lastDamage]||0)+1;origRespawn();};
 for(let f=0;f<MIN*60*30;f++){
  const I=game.input;I.left=I.right=I.up=I.down=I.sprint=false;
  const top=w.topSpecies();let tgt=null,bd=1e9;
  const needAir=w.oxygen<w.stats.maxOxygen*0.3||(w.surfacing&&w.oxygen<w.stats.maxOxygen*0.95);w.surfacing=needAir;
  if(!needAir){for(const pr of game.prey){if(!w.canEat(pr.sp)||pr.sp.hunter)continue;const pri=pr.sp===top?0.35:(w.nutrition(pr.sp)<0.3?4:1.5);const d=Math.hypot(pr.x-w.x,pr.y-w.y)*pri;if(d<bd){bd=d;tgt=pr;}}}
  let tx=w.x+(Math.sin(f/3000)>0?400:-400),ty=needAir?-50:Math.min(game.world.floorAt(w.x)-200,1200*w.size);
  if(tgt){tx=tgt.x;ty=tgt.y;}
  I.right=tx>w.x+15;I.left=tx<w.x-15;I.down=ty>w.y+15;I.up=ty<w.y-15;
  if(tgt&&Math.hypot(tgt.x-w.x,tgt.y-w.y)<500*w.size&&w.energy>w.stats.maxEnergy*0.5)I.sprint=true;
  game.update(dt);
  const nt=w.topSpecies().id;if(nt!==lastTop){const tt=game.time;log.push({species:w.topSpecies().name,atMin:+(tt/60).toFixed(1),stepMin:+((tt-lastT)/60).toFixed(1),size:+w.size.toFixed(2)});lastTop=nt;lastT=tt;}
  if(f%(60*30*5)===0)sizeAt[Math.round(game.time/60)+'min']=+w.size.toFixed(2);
 }
 return {log,end:{min:MIN,top:w.topSpecies().name,eatenOfTop:w.eatenBy[w.topSpecies().id]||0,size:+w.size.toFixed(2),deaths,why},sizeAt};},MIN);
console.log(JSON.stringify(res,null,1));console.log('errors:',errs.length?errs.slice(0,3):'none');await b.close();})()
