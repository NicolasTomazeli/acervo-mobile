/* Reconhecimento restaurado do ZIP original; cálculo e critérios preservados. */
(function(root){

async function bmp(f){return createImageBitmap(f)}function canv(b,s,mode){const c=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(s,s):Object.assign(document.createElement("canvas"),{width:s,height:s});const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,s,s);if(mode==="crop"){const q=Math.min(b.width,b.height),sx=(b.width-q)/2,sy=(b.height-q)/2;x.drawImage(b,sx,sy,q,q,0,0,s,s)}else{const k=Math.min(s/b.width,s/b.height),w=b.width*k,h=b.height*k;x.drawImage(b,(s-w)/2,(s-h)/2,w,h)}return c}
function gray(d){const a=[];for(let i=0;i<d.length;i+=4)a.push((.299*d[i]+.587*d[i+1]+.114*d[i+2])/255);return a}function avg(a){return a.reduce((s,x)=>s+x,0)/a.length}function sd(a,m){return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length)}function ah(g){const m=avg(g);return g.map(x=>x>=m?1:0).join("")}function norm(a){const m=avg(a),s=sd(a,m)||1;return a.map(x=>(x-m)/s)}
function hist(d,n=8){const h=new Array(n*3).fill(0);for(let i=0;i<d.length;i+=4){h[Math.min(n-1,Math.floor(d[i]/256*n))]++;h[n+Math.min(n-1,Math.floor(d[i+1]/256*n))]++;h[2*n+Math.min(n-1,Math.floor(d[i+2]/256*n))]++}const q=Math.sqrt(h.reduce((s,x)=>s+x*x,0))||1;return h.map(x=>x/q)}
function edge(g,s){const v=[];for(let y=1;y<s-1;y+=2)for(let x=1;x<s-1;x+=2)v.push(Math.hypot(g[y*s+x+1]-g[y*s+x-1],g[(y+1)*s+x]-g[(y-1)*s+x]));const n=Math.sqrt(v.reduce((a,x)=>a+x*x,0))||1;return v.map(x=>x/n)}
function one(b,m){const c=canv(b,32,m),d=c.getContext("2d",{willReadFrequently:true}).getImageData(0,0,32,32).data,g=gray(d),c8=canv(b,8,m),g8=gray(c8.getContext("2d",{willReadFrequently:true}).getImageData(0,0,8,8).data);return{hash:ah(g8),gray:norm(g),hist:hist(d),edge:edge(g,32)}}
async function extractSet(f){const b=await bmp(f),r={version:VERSION,aspect:b.width/b.height,full:one(b,"fit"),crop:one(b,"crop")};b.close?.();return r}
function ham(a,b){let s=0;for(let i=0;i<a.length;i++)if(a[i]===b[i])s++;return s/a.length}function cos(a,b){let d=0,x=0,y=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];x+=a[i]*a[i];y+=b[i]*b[i]}return d/Math.sqrt(x*y)}
function sim(a,b){return .22*ham(a.hash,b.hash)+.25*Math.max(0,cos(a.hist,b.hist))+.31*((cos(a.gray,b.gray)+1)/2)+.22*Math.max(0,cos(a.edge,b.edge))}
function setSim(a,b){return Math.max(sim(a.full,b.full),sim(a.full,b.crop),sim(a.crop,b.full),sim(a.crop,b.crop))}


const VERSION='original-1', POLICY_VERSION='0.7.2-original';
const POLICY=Object.freeze({score:.82,review:.62,margin:.035});
function valid(d){
 const vector=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
 const view=v=>v&&typeof v.hash==='string'&&/^[01]{64}$/.test(v.hash)&&vector(v.gray,1024)&&vector(v.hist,24)&&vector(v.edge,225);
 return !!d&&d.version===VERSION&&view(d.full)&&view(d.crop);
}
function decide(candidates){
 const top=candidates[0],second=candidates[1],margin=top?top.score-(second?.score||0):0;
 const automatic=!!top&&top.score>=POLICY.score&&(!second||margin>=POLICY.margin);
 const decisionCode=!top?'empty':automatic?'accepted':top.score>=POLICY.score?'ambiguous':'weak';
 const reason=!top?'Não há referências disponíveis para comparar.':
  automatic?`Correspondência automática com ${top.nome}.`:
  decisionCode==='ambiguous'?'Duas obras tiveram resultados próximos. Compare as referências antes de confirmar.':
  top.score>=POLICY.review?`Possível correspondência com ${top.nome}.`:'Nenhuma correspondência segura.';
 return {automatic,margin,reason,decisionCode,policyVersion:POLICY_VERSION};
}
function rank(query,works){
 if(!valid(query))throw new Error('A foto precisa ser analisada novamente.');
 const candidates=works.map(o=>{
  let score=0;
  for(const d of o.descriptors||[]){
   if(!valid(d))throw new Error('As referências precisam ser preparadas novamente.');
   const similarity=setSim(query,d);
   // A uniform image has a zero-length normalized vector in the original engine.
   // Keep it unconfirmed rather than allowing NaN to corrupt the sort order.
   if(Number.isFinite(similarity))score=Math.max(score,similarity);
  }
  return {obraId:o.id,nome:o.nome,patrimonio:o.patrimonio,score};
 }).sort((a,b)=>b.score-a.score);
 return {candidates:candidates.slice(0,5),...decide(candidates)};
}
root.AcervoMatcher={VERSION,POLICY_VERSION,POLICY,valid,extract:extractSet,setSim,decide,rank};
if(typeof module!=='undefined')module.exports=root.AcervoMatcher;

})(globalThis);
