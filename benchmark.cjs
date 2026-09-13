const {start}=require('./helpers.cjs');const path=require('node:path');
const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
 const server=await start();

 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 page.on('console',m=>console.log(m.text()));
 await page.goto(server.url+'/tests/benchmark.html');
 const result=await page.evaluate(async()=>{
   const catalog=await(await fetch('catalog.json')).json(), works=[], legacyWorks=[];
   const byPat=new Map(),consolidated=[];
   for(const row of catalog.obras){
     const key=String(row.patrimonio||'').trim().toLowerCase();let work=key?byPat.get(key):null;
     if(!work){work={...row,fotos:[],descriptors:[]};consolidated.push(work);if(key)byPat.set(key,work);}
     row.fotos.forEach((f,i)=>{if(!work.fotos.some(x=>x.data===f.data)){work.fotos.push(f);work.descriptors.push(row.descriptors[i]);}});
   }
   catalog.obras=consolidated;
   const blobs=[];let t=performance.now();
   for(let i=0;i<catalog.obras.length;i++){
     const o=catalog.obras[i],photos=await Promise.all(o.fotos.map(async f=>(await fetch(f.data)).blob()));blobs.push(photos);
     works.push({id:i,nome:o.nome,patrimonio:o.patrimonio,descriptors:await Promise.all(photos.map(f=>AcervoMatcher.extract(f)))});
     legacyWorks.push({id:i,descriptors:o.descriptors});
   }
   console.log('References extracted in',Math.round(performance.now()-t),'ms');
   const results=[], issues=[];
   async function transform(blob,kind){
     const im=await createImageBitmap(blob), c=document.createElement('canvas');c.width=320;c.height=Math.max(32,Math.round(320*im.height/im.width));
     const x=c.getContext('2d');x.fillStyle='#bdb9af';x.fillRect(0,0,c.width,c.height);
     if(kind==='light')x.filter='brightness(1.2) contrast(.85)';
     if(kind==='dark')x.filter='brightness(.65)';
     if(kind==='blur')x.filter='blur(2px)';
     if(kind==='margin'){const p=.12;x.drawImage(im,p*c.width,p*c.height,c.width*(1-2*p),c.height*(1-2*p));}
     else if(kind==='rotate'){x.translate(c.width/2,c.height/2);x.rotate(6*Math.PI/180);x.drawImage(im,-c.width/2,-c.height/2,c.width,c.height);}
     else if(kind==='crop')x.drawImage(im,im.width*.07,im.height*.07,im.width*.86,im.height*.86,0,0,c.width,c.height);
     else x.drawImage(im,0,0,c.width,c.height);
     im.close();return new Promise(r=>c.toBlob(r,'image/jpeg',.85));
   }
   for(const kind of ['original','light','dark','margin','rotate','crop','blur']){
     let count=0,oldTop=0,newTop=0,oldAuto=0,newAuto=0,oldWrong=0,newWrong=0,oldMs=0,newMs=0;
     for(let i=0;i<works.length;i++){if(!blobs[i].length)continue; const blob=kind==='original'?blobs[i][0]:await transform(blobs[i][0],kind);
       let s=performance.now();const old=await Legacy.extractSet(blob), rank=legacyWorks.map(o=>({id:o.id,score:Math.max(0,...o.descriptors.map(d=>Legacy.setSim(old,d)))})).sort((a,b)=>b.score-a.score);
       const oa=rank[0].score>=.82&&rank[0].score-rank[1].score>=.035;oldMs+=performance.now()-s;
       s=performance.now();const q=await AcervoMatcher.extract(blob,true), nr=AcervoMatcher.rank(q,works);newMs+=performance.now()-s;
       count++;oldTop+=+(rank[0].id===i);newTop+=+(nr.candidates[0].obraId===i);oldAuto+=+oa;newAuto+=+nr.automatic;oldWrong+=+(oa&&rank[0].id!==i);newWrong+=+(nr.automatic&&nr.candidates[0].obraId!==i);
       if(nr.candidates[0].obraId!==i)issues.push({kind,id:i,name:works[i].nome,top:nr.candidates[0],expected:nr.candidates.find(c=>c.obraId===i)});
     }
     const row={kind,count,oldTop,newTop,oldAuto,newAuto,oldWrong,newWrong,oldMs:Math.round(oldMs/count),newMs:Math.round(newMs/count)};results.push(row);console.log(JSON.stringify(row));
   }
   const negatives={withheld:0,oldFalse:0,newFalse:0,blank:0,blankFalse:0};
   for(let i=0;i<works.length;i++){
     if(!blobs[i].length)continue;
     const q=await AcervoMatcher.extract(blobs[i][0],true),nr=AcervoMatcher.rank(q,works.filter(o=>o.id!==i));
     const old=await Legacy.extractSet(blobs[i][0]),rank=legacyWorks.filter(o=>o.id!==i).map(o=>({id:o.id,score:Math.max(0,...o.descriptors.map(d=>Legacy.setSim(old,d)))})).sort((a,b)=>b.score-a.score);
     negatives.withheld++;negatives.newFalse+=+nr.automatic;negatives.oldFalse+=+(rank[0].score>=.82&&rank[0].score-rank[1].score>=.035);
   }
   for(const color of ['#ffffff','#000000','#808080','#ff0000','#1133aa']){
     const c=document.createElement('canvas');c.width=c.height=80;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,80,80);const blob=await new Promise(r=>c.toBlob(r));
     negatives.blank++;negatives.blankFalse+=+AcervoMatcher.rank(await AcervoMatcher.extract(blob,true),works).automatic;
   }
   console.log('Negatives',JSON.stringify(negatives));
   return {results,issues,negatives,catalog:{works:works.length,photos:blobs.flat().length}};
 });
 fs.writeFileSync(path.join(server.resultDir,'benchmark-results.json'),JSON.stringify(result,null,2));
 await browser.close();
await server.close();
})().catch(e=>{console.error(e);process.exit(1)});
