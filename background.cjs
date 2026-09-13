const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {start}=require('./helpers.cjs');
(async()=>{
 const server=await start(),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
 await page.goto(server.url+'/');await page.waitForFunction(()=>!!db);
 await page.addScriptTag({url:server.url+'/tests/matcher-v3.js'});await page.evaluate(()=>window.MatcherV3=window.AcervoMatcher);await page.addScriptTag({url:server.url+'/matcher.js'});
 const result=await page.evaluate(async()=>{
  function fixture(id,bg,shift=0,scale=1){
   const c=document.createElement('canvas');c.width=240;c.height=320;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,240,320);
   x.save();x.translate(120+shift,170);x.scale(scale,scale);
   x.fillStyle=['#257055','#935623','#265694','#7c385b'][id%4];x.beginPath();x.moveTo(-14,-110);x.lineTo(14,-110);x.lineTo(14,-70);x.quadraticCurveTo(45,-58,45,-25);x.lineTo(45,100);x.lineTo(-45,100);x.lineTo(-45,-25);x.quadraticCurveTo(-45,-58,-14,-70);x.closePath();x.fill();
   x.fillStyle='#d8bd51';x.fillRect(-16,-116,32,12);x.fillStyle='#e9e2ca';x.fillRect(-36,-10,72,76);
   let seed=id+1;for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){seed=(seed*1664525+1013904223)>>>0;x.fillStyle=['#102742','#973526','#ab9323','#347846'][(seed>>>24)%4];x.fillRect(-32+xx*8,-5+yy*8,6,6);}
   x.restore();return new Promise(resolve=>c.toBlob(resolve,'image/png'));
  }
  const works=[],oldWorks=[],photos=[];
  for(let i=0;i<32;i++){const blob=await fixture(i,['#ebdcc1','#326392','#9b6451','#232c3d'][i%4]);photos.push(blob);works.push({id:i,nome:'Garrafa '+i,descriptors:[await AcervoMatcher.extract(blob)]});oldWorks.push({id:i,descriptors:[await MatcherV3.extract(blob)]});}
  const rows=[];let oldFalse=0,newFalse=0;
  for(const [kind,bg,shift,scale] of [['cinza','#a0a0a0',0,1],['fundo escuro','#172635',0,1],['posição e tamanho','#d5d5d5',35,.8]]){
   let before=0,after=0,segmented=0,ms=0;
   for(let i=0;i<32;i++){
    const blob=await fixture(i,bg,shift,scale),a=MatcherV3.rank(await MatcherV3.extract(blob,true),oldWorks);const t=performance.now(),q=await AcervoMatcher.extract(blob,true),b=AcervoMatcher.rank(q,works);ms+=performance.now()-t;
    before+=+(a.candidates[0].obraId===i);after+=+(b.candidates[0].obraId===i);segmented+=+!!q.foreground;
    oldFalse+=+(a.automatic&&a.candidates[0].obraId!==i);newFalse+=+(b.automatic&&b.candidates[0].obraId!==i);
   }
   rows.push({kind,count:32,before,after,segmented,milliseconds:Math.round(ms/32)});
  }
  let absentAuto=0;for(let i=100;i<132;i++){const q=await AcervoMatcher.extract(await fixture(i,'#a0a0a0'),true);absentAuto+=+AcervoMatcher.rank(q,works).automatic;}
  return {rows,oldFalse,newFalse,absentAuto};
 });
 console.log(JSON.stringify(result,null,2));assert(result.rows.every(x=>x.after>=x.before));assert.equal(result.newFalse,0);assert.equal(result.absentAuto,0);
 fs.writeFileSync(path.join(server.resultDir,'background-results.json'),JSON.stringify(result,null,2));
 await browser.close();await server.close();
})().catch(e=>{console.error(e);process.exit(1)});
