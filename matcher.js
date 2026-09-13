/* Motor local, sem dependências. Usado no Worker e no fallback do navegador. */
(function (root) {
  'use strict';
  const VERSION = 4, SIZE = 32;
  // A versão do descritor permanece 4: esta atualização corrige a decisão, não a extração.
  const POLICY_VERSION='0.7.1-balanced';
  const POLICY=Object.freeze({score:.90,margin:.065,gray:.88,hash:.84,gradient:.70});
  const foreground=root.AcervoForeground||(typeof require==='function'?require('./foreground.js'):null);
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const unit = a => { const n = Math.hypot(...a); return a.map(x => n > 1e-9 ? x / n : 0); };
  const dot = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i] * b[i]; return n; };
  const cosine = Array.from({length: 8}, (_, u) => Array.from({length: SIZE}, (_, x) => Math.cos((2*x+1)*u*Math.PI/(2*SIZE))));
  function describe(pixels) {
    const g = new Array(SIZE*SIZE), color = new Array(48).fill(0);
    for (let i=0;i<g.length;i++) {
      const r=pixels[i*4]/255, b=pixels[i*4+2]/255, v=pixels[i*4+1]/255;
      g[i]=.299*r+.587*v+.114*b;
      const cell=(Math.floor((i%SIZE)/8)+4*Math.floor(Math.floor(i/SIZE)/8))*3;
      color[cell]+=r/64; color[cell+1]+=v/64; color[cell+2]+=b/64;
    }
    const mean=g.reduce((a,b)=>a+b,0)/g.length;
    const contrast=Math.sqrt(g.reduce((a,b)=>a+(b-mean)**2,0)/g.length);
    // A imagem ocupa todo o descritor: barras brancas não viram evidência de identidade.
    const small=[];
    for(let y=0;y<32;y+=2) for(let x=0;x<32;x+=2) small.push((g[y*32+x]+g[y*32+x+1]+g[(y+1)*32+x]+g[(y+1)*32+x+1])/4-mean);
    const grad=[], hog=new Array(128).fill(0); let energy=0;
    for(let y=1;y<31;y+=2) for(let x=1;x<31;x+=2) {
      const dx=g[y*32+x+1]-g[y*32+x-1], dy=g[(y+1)*32+x]-g[(y-1)*32+x];
      grad.push(dx,dy); const mag=Math.hypot(dx,dy); energy+=mag;
      const bin=Math.floor((Math.atan2(dy,dx)+Math.PI)/(2*Math.PI)*8)%8;
      hog[(Math.floor(y/8)*4+Math.floor(x/8))*8+bin]+=mag;
    }
    const temp=Array.from({length:8},()=>new Array(32).fill(0));
    for(let u=0;u<8;u++) for(let y=0;y<32;y++) for(let x=0;x<32;x++) temp[u][y]+=g[y*32+x]*cosine[u][x];
    const freq=[];
    for(let v=0;v<8;v++) for(let u=0;u<8;u++) { if(!u&&!v) continue; let d=0;for(let y=0;y<32;y++)d+=temp[u][y]*cosine[v][y];freq.push(d); }
    const median=[...freq].sort((a,b)=>a-b)[31];
    return {gray:unit(small), gradient:unit(grad), hog:unit(hog), color, hash:freq.map(x=>x>median?1:0).join(''), contrast, energy:energy/225, mean};
  }
  function validView(v){return (
      /^[01]{63}$/.test(v?.hash) && [['gray',256],['gradient',450],['hog',128],['color',48]].every(([k,n])=>Array.isArray(v[k])&&v[k].length===n&&v[k].every(Number.isFinite)) && ['contrast','energy','mean'].every(k=>Number.isFinite(v[k])));
  }
  function valid(d) {
    return d?.version===VERSION && Number.isFinite(d.aspect) && d.aspect>0 && Array.isArray(d.views) && d.views.length>0 && d.views.length<=20 && d.views.every(validView) && (!d.foreground||(validView(d.foreground.view)&&Number.isFinite(d.foreground.aspect)&&d.foreground.aspect>0));
  }
  function objectView(bitmap){
    if(!foreground)return null;
    const k=Math.min(1,160/Math.max(bitmap.width,bitmap.height));
    const w=Math.max(1,Math.round(bitmap.width*k)),h=Math.max(1,Math.round(bitmap.height*k));
    const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,w,h);
    const pixels=ctx.getImageData(0,0,w,h),result=foreground.segment(pixels.data,w,h);if(!result)return null;
    for(let i=0;i<result.mask.length;i++)if(!result.mask[i]){pixels.data[i*4]=128;pixels.data[i*4+1]=128;pixels.data[i*4+2]=128;pixels.data[i*4+3]=255;}
    ctx.putImageData(pixels,0,0);
    const target=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(32,32):Object.assign(document.createElement('canvas'),{width:32,height:32});
    const targetCtx=target.getContext('2d',{willReadFrequently:true}),[x,y,ow,oh]=result.box;
    targetCtx.fillStyle='#808080';targetCtx.fillRect(0,0,32,32);targetCtx.drawImage(c,x,y,ow,oh,1,1,30,30);
    return {view:describe(targetCtx.getImageData(0,0,32,32).data),aspect:ow/oh};
  }
  async function extract(blob, query=false) {
    const bitmap=await createImageBitmap(blob);
    try {
      const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(32,32):Object.assign(document.createElement('canvas'),{width:32,height:32});
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const views=[];
      // Referências são cadastradas de frente; consultas aceitam margem e pequenas inclinações.
      const settings=query?[[1,0],[.9,0],[.8,0],[.7,0],[.6,0],[.9,-6],[.9,6]]:[[1,0],[.9,0]];
      for(const [scale,angle] of settings) {
        ctx.save();ctx.fillStyle='#fff';ctx.fillRect(0,0,32,32);ctx.translate(16,16);ctx.rotate(angle*Math.PI/180);
        const w=bitmap.width*scale,h=bitmap.height*scale;
        ctx.drawImage(bitmap,(bitmap.width-w)/2,(bitmap.height-h)/2,w,h,-16,-16,32,32);ctx.restore();
        views.push(describe(ctx.getImageData(0,0,32,32).data));
      }
      return {version:VERSION,aspect:bitmap.width/bitmap.height,views,foreground:objectView(bitmap)};
    } finally { bitmap.close(); }
  }
  function compare(a,b) {
    let same=0;for(let i=0;i<63;i++)if(a.hash[i]===b.hash[i])same++;
    const hash=same/63, gray=clamp(dot(a.gray,b.gray)), gradient=clamp(dot(a.gradient,b.gradient)), hog=clamp(dot(a.hog,b.hog));
    // Cores são auxiliares; isoladamente não bastam para confirmar uma obra.
    let delta=0; const am=a.color.reduce((s,x)=>s+x,0)/48,bm=b.color.reduce((s,x)=>s+x,0)/48;
    for(let i=0;i<48;i++)delta+=Math.abs((a.color[i]-am)-(b.color[i]-bm));
    const color=clamp(1-delta/16);
    return {score:clamp(.35*gray+.25*hash+.22*gradient+.1*hog+.08*color),gray,hash,gradient};
  }
  function pair(q,r) {
    let best={score:0,gray:0,hash:0,gradient:0};
    for(const a of q.views) for(const b of r.views) {
      if(a.contrast<.018||b.contrast<.018||a.energy<.008||b.energy<.008)continue;
      const c=compare(a,b);if(c.score>best.score) best=c;
    }
    if(q.foreground&&r.foreground&&Math.abs(Math.log(q.foreground.aspect/r.foreground.aspect))<.2){
      const c=compare(q.foreground.view,r.foreground.view);
      // Desconto pela informação removida. Também pode confirmar quando os detalhes
      // e a separação entre candidatos atendem ao critério normal de reconhecimento.
      const score=c.score*.97;
      if(c.gray>.65&&c.gradient>.45&&score>best.score)best={...c,score,evidence:'foreground'};
    }
    return best;
  }
  function decide(candidates,quality){
    const top=candidates[0],margin=top?top.score-(candidates[1]?.score||0):0;
    const lowQuality=!quality||quality.contrast<.025||quality.energy<.012;
    let code;
    if(!top)code='empty';
    else if(lowQuality)code='quality';
    else if(top.score>=.7&&margin<POLICY.margin)code='ambiguous';
    else if(['score','gray','hash','gradient'].every(k=>Number.isFinite(top[k])&&top[k]>=POLICY[k])&&margin>=POLICY.margin)code='accepted';
    else code='weak';
    const automatic=code==='accepted';
    const reason=code==='empty'?'Não há referências disponíveis para comparar.':
      code==='quality'?'Foto com poucos detalhes. Aproxime-se da obra e evite desfoque ou reflexos.':
      code==='ambiguous'?'Duas obras tiveram resultados próximos. Compare as referências antes de confirmar.':
      automatic?(top.evidence==='foreground'?'Correspondência automática com redução de fundo. Confira os detalhes da peça.':'Correspondência visual automática. Use “Revisar / desfazer” se a peça estiver incorreta.'):
      top.score>=.65?'A candidata mais próxima ainda não reúne detalhes suficientes para confirmação automática. Compare a referência ou ajuste a área nas duas fotos.':
      'Nenhuma correspondência suficiente. Use “Delimitar obra” para reduzir o fundo ou tente uma foto de frente.';
    return {automatic,margin,lowQuality,reason,decisionCode:code,policyVersion:POLICY_VERSION};
  }
  function rank(query,works) {
    const candidates=works.map(o=>{
      let best={score:0,gray:0,hash:0,gradient:0};
      for(const d of o.descriptors||[])if(valid(d)){const c=pair(query,d);if(c.score>best.score)best=c;}
      return {obraId:o.id,nome:o.nome,patrimonio:o.patrimonio,...best};
    }).sort((a,b)=>b.score-a.score||a.obraId-b.obraId);
    return {candidates:candidates.slice(0,5),...decide(candidates,query.views[0])};
  }
  root.AcervoMatcher={VERSION,POLICY_VERSION,POLICY,describe,valid,extract,compare,pair,decide,rank};
  if(typeof module!=='undefined')module.exports=root.AcervoMatcher;
})(globalThis);
