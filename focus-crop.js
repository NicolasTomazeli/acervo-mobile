/* Seleção não destrutiva: guarda o retângulo normalizado, preservando a foto original. */
const FocusCrop=(()=>{
 let active=false;
 function valid(r){return r==null||(Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[0]>=0&&r[1]>=0&&r[2]>=.02&&r[3]>=.02&&r[0]+r[2]<=1.000001&&r[1]+r[3]<=1.000001);}
 async function apply(blob,rect){
  if(!valid(rect))throw new Error('Área selecionada inválida.');if(!rect)return blob;
  const b=await createImageBitmap(blob);
  try{
   const [x,y,w,h]=rect,c=document.createElement('canvas');c.width=Math.max(1,Math.round(b.width*w));c.height=Math.max(1,Math.round(b.height*h));
   c.getContext('2d').drawImage(b,x*b.width,y*b.height,w*b.width,h*b.height,0,0,c.width,c.height);
   return await new Promise((resolve,reject)=>c.toBlob(v=>v?resolve(v):reject(new Error('Não foi possível preparar a área selecionada.')),'image/png'));
  }finally{b.close();}
 }
 async function choose(blob,initial=null){
  if(active)return undefined;active=true;
  let bitmap;
  try{bitmap=await createImageBitmap(blob);}catch(e){active=false;throw e;}
  const dialog=document.createElement('dialog');dialog.id='focusDialog';
  dialog.innerHTML=`<div class="dialog-card"><div class="dialog-head"><h2>Delimitar obra</h2><button type="button" class="x" id="focusCancel" aria-label="Cancelar seleção">✕</button></div>
   <p class="muted">Arraste um retângulo ao redor da peça inteira, deixando pouco fundo. A foto original será preservada.</p>
   <canvas id="focusCanvas" aria-label="Foto: arraste para selecionar a obra"></canvas>
   <details><summary>Ajustar pelas margens</summary><div class="focus-sliders">
   ${[['left','Esquerda'],['right','Direita'],['top','Superior'],['bottom','Inferior']].map(([id,label])=>`<label>${label}<input type="range" min="0" max="95" step="1" data-margin="${id}" aria-label="Margem ${label.toLowerCase()}"></label>`).join('')}</div></details>
   <p id="focusStatus" class="muted" role="status"></p><div class="actions"><button type="button" class="secondary" id="focusReset">Foto inteira</button><button type="button" class="primary grow" id="focusApply">Usar esta área</button></div></div>`;
  document.body.append(dialog);
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');
  const scale=Math.min(1,650/bitmap.width,440/bitmap.height);canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  let rect=initial&&valid(initial)?[...initial]:[0,0,1,1],origin=null,result=undefined;
  const inputs=[...dialog.querySelectorAll('[data-margin]')];
  function paint(){
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const [x,y,w,h]=rect,px=x*canvas.width,py=y*canvas.height,pw=w*canvas.width,ph=h*canvas.height;
   ctx.fillStyle='#082f6390';ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.rect(px,py,pw,ph);ctx.fill('evenodd');
   ctx.lineWidth=2;ctx.strokeStyle='#f2b705';ctx.strokeRect(px,py,pw,ph);
   const values={left:x,right:1-x-w,top:y,bottom:1-y-h};for(const input of inputs)input.value=Math.round(values[input.dataset.margin]*100);
   dialog.querySelector('#focusApply').disabled=!valid(rect);
   dialog.querySelector('#focusStatus').textContent=`Área de análise: ${Math.round(w*100)}% da largura e ${Math.round(h*100)}% da altura.`;
  }
  function point(e){const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))];}
  canvas.onpointerdown=e=>{e.preventDefault();origin=point(e);canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!origin)return;const p=point(e);rect=[Math.min(origin[0],p[0]),Math.min(origin[1],p[1]),Math.abs(p[0]-origin[0]),Math.abs(p[1]-origin[1])];paint();};
  canvas.onpointerup=canvas.onpointercancel=()=>{origin=null;};
  for(const input of inputs)input.oninput=()=>{
   let [x,y,w,h]=rect;const value=Number(input.value)/100;
   if(input.dataset.margin==='left'){const right=x+w;x=Math.min(value,right-.02);w=right-x;}
   if(input.dataset.margin==='right')w=Math.max(.02,1-x-value);
   if(input.dataset.margin==='top'){const bottom=y+h;y=Math.min(value,bottom-.02);h=bottom-y;}
   if(input.dataset.margin==='bottom')h=Math.max(.02,1-y-value);
   rect=[x,y,w,h];paint();
  };
  dialog.querySelector('#focusReset').onclick=()=>{rect=[0,0,1,1];paint();};
  dialog.querySelector('#focusCancel').onclick=()=>dialog.close();
  dialog.querySelector('#focusApply').onclick=()=>{if(!valid(rect))return;result=rect.every((x,i)=>Math.abs(x-[0,0,1,1][i])<.000001)?null:rect;dialog.close();};
  paint();dialog.showModal();
  return await new Promise(resolve=>dialog.addEventListener('close',()=>{bitmap.close();dialog.remove();active=false;resolve(result);},{once:true}));
 }
 return {apply,choose,valid};
})();
