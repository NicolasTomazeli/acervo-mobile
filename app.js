
const DB_NAME="acervo-mobile-db", DB_VERSION=2;
let artworkCache=null, artworkLimit=60, busy=false;
let referenceCrops=[],conferenceCrops=[],existingCropEdits=new Map();
function showError(e){console.error(e);toast(e.name==='QuotaExceededError'?'Sem espaço no aparelho. Exporte um backup antes de liberar armazenamento.':`Não foi possível concluir: ${e.message||e}`);}
async function task(fn){
 if(busy)return;
 busy=true;
 const states=[...document.querySelectorAll('button:not(.nav),input:not(#searchInput),textarea')].map(e=>[e,e.disabled]);
 states.forEach(([e])=>e.disabled=true);
 try{return await fn();}catch(e){showError(e);}finally{busy=false;states.forEach(([e,disabled])=>e.disabled=disabled);runConferenceBtn.disabled=!conferenceFiles.length;}
}
function setPhoto(im,blob,alt='Foto da obra'){
 if(im.dataset.photoUrl)URL.revokeObjectURL(im.dataset.photoUrl);
 im.alt=alt;if(!blob){im.removeAttribute('src');return;}const src=URL.createObjectURL(blob);im.dataset.photoUrl=src;
 im.onload=im.onerror=()=>{URL.revokeObjectURL(src);delete im.dataset.photoUrl;};im.src=src;
}
const photoJobs=new WeakMap();
function setFocusedPhoto(im,blob,rect,alt='Foto da obra'){
 const job={};photoJobs.set(im,job);
 if(!rect){setPhoto(im,blob,alt);return;}
 FocusCrop.apply(blob,rect).then(cropped=>{if(photoJobs.get(im)===job&&im.isConnected)setPhoto(im,cropped,alt+' — área selecionada');}).catch(showError);
}
function addFocusButton(parent,im,blob,getRect,onChange){
 parent.classList.add('has-focus');const button=document.createElement('button');button.type='button';button.className='focus-button';button.textContent=getRect()?'Ajustar área':'Delimitar obra';
 button.onclick=async()=>{if(busy)return;try{const rect=await FocusCrop.choose(blob,getRect());if(rect===undefined)return;onChange(rect);setFocusedPhoto(im,blob,rect);button.textContent=rect?'Ajustar área':'Delimitar obra';}catch(e){showError(e);}};
 parent.append(button);
}
function clearImages(container){container.querySelectorAll('[data-photo-url]').forEach(im=>URL.revokeObjectURL(im.dataset.photoUrl));container.replaceChildren();}
const searchKey=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
let db,deferredPrompt=null,referenceFiles=[],conferenceFiles=[],currentConferenceId=null,editingArtworkId=null,removedPhotoIndexes=new Set();

function requestP(r){
 const tx=r.transaction||r.source?.transaction, write=tx?.mode==='readwrite';
 if(write&&r.source?.name==='obras')artworkCache=null;
 return new Promise((resolve,reject)=>{
  r.onerror=()=>reject(r.error);
  if(write){tx.addEventListener('complete',()=>resolve(r.result),{once:true});tx.addEventListener('abort',()=>reject(tx.error||new Error('Gravação cancelada.')),{once:true});}
  else r.onsuccess=()=>resolve(r.result);
 });
}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Gravação cancelada.'));tx.onerror=()=>{};});}
function store(n,m="readonly"){return db.transaction(n,m).objectStore(n)}
async function all(n){if(n!=='obras')return requestP(store(n).getAll());if(!artworkCache)artworkCache=requestP(store(n).getAll()).catch(e=>{artworkCache=null;throw e;});return artworkCache;}
async function openDB(){return new Promise((a,b)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains("obras")){d.createObjectStore("obras",{keyPath:"id",autoIncrement:true})}else{const s=r.transaction.objectStore("obras");if(s.indexNames.contains("patrimonio"))s.deleteIndex("patrimonio")}if(!d.objectStoreNames.contains("conferencias"))d.createObjectStore("conferencias",{keyPath:"id",autoIncrement:true})};r.onsuccess=e=>a(e.target.result);r.onerror=e=>b(e.target.error)})}
function toast(m){const e=document.getElementById("toast");e.textContent=m;e.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>e.classList.remove("show"),2300)}
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;

function setupNav(){document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{const v=b.dataset.view;document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById("view-"+v).classList.add("active");if(v==="resultados")renderHistory();window.scrollTo({top:0,behavior:"smooth"})})}
function resetArtworkForm(){
 editingArtworkId=null;removedPhotoIndexes=new Set();referenceFiles=[];referenceCrops=[];existingCropEdits=new Map();artworkForm.reset();editId.value="";
 artworkDialogTitle.textContent="Nova obra";existingPhotosWrap.classList.add("hidden");clearImages(existingPhotos);
 clearImages(referencePreview);deleteArtworkBtn.classList.add("hidden");
}
function setupDialogs(){
 newArtworkBtn.onclick=()=>{resetArtworkForm();artworkDialog.showModal()};
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
 deleteArtworkBtn.onclick=()=>editingArtworkId&&task(()=>deleteArtwork(editingArtworkId));
}
function setupInstall(){if(standalone())installBtn.classList.add("installed");window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e});window.addEventListener("appinstalled",()=>installBtn.classList.add("installed"));installBtn.onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;return}installHelpText.textContent=/iphone|ipad|ipod/i.test(navigator.userAgent)?"No Safari: Compartilhar → Adicionar à Tela de Início.":"No Chrome: menu ⋮ → Instalar app / Adicionar à tela inicial.";installHelpDialog.showModal()}}
function preview(files,id){
 const container=document.getElementById(id),crops=id==='conferencePreview'?conferenceCrops:referenceCrops;clearImages(container);
 files.forEach((blob,i)=>{
  const d=document.createElement('div');d.className='preview';const im=new Image;setFocusedPhoto(im,blob,crops[i]);const n=document.createElement('span');n.textContent=i+1;d.append(im,n);
  addFocusButton(d,im,blob,()=>crops[i]||null,rect=>crops[i]=rect);container.append(d);
 });
}
async function compress(f,max=1400,q=.84){const b=await createImageBitmap(f),k=Math.min(1,max/Math.max(b.width,b.height)),w=Math.round(b.width*k),h=Math.round(b.height*k),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(b,0,0,w,h);b.close?.();return new Promise(r=>c.toBlob(x=>r(x||f),"image/jpeg",q))}
function setupInputs(){
 referenceInput.onchange=()=>task(async()=>{const selected=[...referenceInput.files].slice(0,8),next=[];for(const f of selected)if(f.type.startsWith('image/'))next.push(await compress(f));referenceFiles=next;referenceCrops=next.map(()=>null);preview(next,'referencePreview');});
 conferenceInput.onchange=()=>task(async()=>{const selected=[...conferenceInput.files].slice(0,7),next=[];for(const f of selected)if(f.type.startsWith('image/'))next.push(await compress(f));conferenceFiles=next;conferenceCrops=next.map(()=>null);preview(next,'conferencePreview');clearConferenceBtn.classList.toggle('hidden',!next.length);});
 clearConferenceBtn.onclick=()=>{if(!busy)clearConference();};runConferenceBtn.onclick=()=>task(runConference);
}
function clearConference(){conferenceFiles=[];conferenceCrops=[];conferenceInput.value="";clearImages(conferencePreview);runConferenceBtn.disabled=true;clearConferenceBtn.classList.add("hidden")}

async function renderArtworks(){
 let a=[...await all("obras")].sort((x,y)=>y.id-x.id),q=searchKey(searchInput.value);
 statArtworks.textContent=a.length;statRefs.textContent=a.reduce((s,o)=>s+(o.fotos?.length||0),0);
 if(q)a=a.filter(o=>searchKey([o.nome,o.patrimonio,o.artista,o.localizacao].join(" ")).includes(q));
 clearImages(artworkList);emptyArtworks.classList.toggle("hidden",a.length>0);
 a.slice(0,artworkLimit).forEach(o=>{
   const c=document.createElement("div");c.className="art-card";const im=new Image;if(o.fotos?.[0])setPhoto(im,o.fotos[0],o.nome);
   const m=document.createElement("div");m.className="art-main";m.innerHTML=`<b>${esc(o.nome||"Sem título")}</b><div class=meta>${esc(o.patrimonio||"Sem patrimônio")} · ${esc(o.artista||"-")}</div><div class=meta>${esc(o.localizacao||"-")} · ${o.fotos?.length||0} foto(s)</div>`;
   const a=document.createElement("div");a.className="art-actions";const e=document.createElement("button");e.className="edit-art";e.textContent="Editar";e.onclick=()=>{if(!busy)openEditArtwork(o.id).catch(showError);};a.append(e);c.append(im,m,a);artworkList.append(c);
 });
 if(a.length>artworkLimit){const more=document.createElement('button');more.className='secondary';more.textContent=`Mostrar mais (${a.length-artworkLimit} restantes)`;more.onclick=()=>{artworkLimit+=60;renderArtworks().catch(showError);};artworkList.append(more);}
}
async function openEditArtwork(id){
 const o=await requestP(store("obras").get(id));if(!o)return;
 resetArtworkForm();editingArtworkId=id;editId.value=id;artworkDialogTitle.textContent="Editar obra";deleteArtworkBtn.classList.remove("hidden");
 artworkForm.elements.patrimonio.value=o.patrimonio||"";artworkForm.elements.nome.value=o.nome||"";artworkForm.elements.artista.value=o.artista||"";artworkForm.elements.localizacao.value=o.localizacao||"";artworkForm.elements.descricao.value=o.descricao||"";
 clearImages(existingPhotos);removedPhotoIndexes=new Set();
 if(o.fotos?.length){existingPhotosWrap.classList.remove("hidden");o.fotos.forEach((f,i)=>{const d=document.createElement("div");d.className="preview";const im=new Image;setFocusedPhoto(im,f,o.recortes?.[i]);const b=document.createElement("button");b.type="button";b.className="remove-photo";b.textContent="×";b.onclick=()=>{removedPhotoIndexes.add(i);clearImages(d);d.remove();if(existingPhotos.children.length===0)existingPhotosWrap.classList.add("hidden")};d.append(im,b);addFocusButton(d,im,f,()=>existingCropEdits.has(i)?existingCropEdits.get(i):(o.recortes?.[i]||null),rect=>existingCropEdits.set(i,rect));existingPhotos.append(d)})}
 artworkDialog.showModal();
}
async function deleteArtwork(id){
 if(!confirm("Excluir esta obra do acervo? As conferências antigas serão mantidas como histórico, mas o cadastro será removido."))return;
 await requestP(store("obras","readwrite").delete(id));artworkDialog.close();resetArtworkForm();await renderArtworks();toast("Obra excluída.");
}
artworkForm.onsubmit=e=>{
 e.preventDefault();const f=new FormData(e.target);return task(async()=>{const p=(f.get("patrimonio")||"").trim(),n=(f.get("nome")||"").trim();
 if(!n)return toast("Nome da obra é obrigatório.");
 const allWorks=await all("obras");if(p&&allWorks.some(o=>o.id!==editingArtworkId&&String(o.patrimonio||"").toLowerCase()===p.toLowerCase()))return toast("Patrimônio já cadastrado.");
 let old={fotos:[],descriptors:[]};if(editingArtworkId)old=await requestP(store("obras").get(editingArtworkId))||old;
 const keptFotos=[],keptDesc=[],keptCrops=[];
 for(let i=0;i<(old.fotos||[]).length;i++)if(!removedPhotoIndexes.has(i)){
  const crop=existingCropEdits.has(i)?existingCropEdits.get(i):(old.recortes?.[i]||null);
  keptFotos.push(old.fotos[i]);keptCrops.push(crop);
  const unchanged=JSON.stringify(crop)===JSON.stringify(old.recortes?.[i]||null);
  keptDesc.push(unchanged&&AcervoMatcher.valid(old.descriptors?.[i])?old.descriptors[i]:await extractSet(await FocusCrop.apply(old.fotos[i],crop)));
 }
 const newDesc=[];if(referenceFiles.length)toast('Analisando novas referências…');
 for(let i=0;i<referenceFiles.length;i++)newDesc.push(await extractSet(await FocusCrop.apply(referenceFiles[i],referenceCrops[i])));
 const wasEditing=!!editingArtworkId;const obj={...(editingArtworkId?old:{}),patrimonio:p,nome:n,artista:(f.get('artista')||'').trim(),localizacao:(f.get('localizacao')||'').trim(),descricao:(f.get('descricao')||'').trim(),fotos:[...keptFotos,...referenceFiles],recortes:[...keptCrops,...referenceFiles.map((_,i)=>referenceCrops[i]||null)],descriptors:[...keptDesc,...newDesc],atualizadoEm:new Date().toISOString()};
 if(editingArtworkId){obj.id=editingArtworkId;await requestP(store("obras","readwrite").put(obj))}else{obj.criadoEm=new Date().toISOString();await requestP(store("obras","readwrite").add(obj))}
 artworkDialog.close();resetArtworkForm();await renderArtworks();toast(wasEditing?"Obra atualizada.":"Obra salva.");
 });
};

async function ensureDescriptors(works){
 let done=0;const total=works.reduce((n,o)=>n+o.fotos.length,0);
 for(const o of works){
  let changed=false;const next=[];
  for(let i=0;i<o.fotos.length;i++){
   prog(done,total,`Preparando referências ${done+1}/${total}…`);
   if(AcervoMatcher.valid(o.descriptors?.[i]))next.push(o.descriptors[i]);
   else{next.push(await extractSet(await FocusCrop.apply(o.fotos[i],o.recortes?.[i])));changed=true;}
   done++;
  }
  if(changed){o.descriptors=next;await requestP(store('obras','readwrite').put(o));}
 }
}
function prog(d,t,txt){progressWrap.classList.remove('hidden');progressBar.style.width=`${Math.round(d/Math.max(1,t)*100)}%`;progressText.textContent=txt;}
async function runConference(){
 const files=[...conferenceFiles],crops=files.map((_,i)=>conferenceCrops[i]||null);if(!files.length)return;
 const refs=(await all('obras')).filter(o=>o.fotos?.length);
 if(!refs.length)return toast('Cadastre ao menos uma obra com foto.');
 runConferenceBtn.textContent='Analisando…';
 try{
  await ensureDescriptors(refs);
  await Visual.setCatalog(refs.map(({id,nome,patrimonio,descriptors})=>({id,nome,patrimonio,descriptors})));
  const items=[];
  for(let i=0;i<files.length;i++){
   prog(i,files.length,`Analisando imagem ${i+1} de ${files.length}…`);
   const result=await Visual.rank(await FocusCrop.apply(files[i],crops[i])),top=result.candidates[0];
   items.push({ordem:i+1,foto:files[i],recorte:crops[i],status:result.automatic?'localizado':'pendente',obraId:result.automatic?top.obraId:null,score:top?.score??null,candidatos:result.candidates,observacao:result.reason,metodo:result.automatic?'automatico':null,versaoMotor:AcervoMatcher.VERSION,margem:result.margin});
  }
  const id=await requestP(store('conferencias','readwrite').add({criadoEm:new Date().toISOString(),items}));
  clearConference();await renderHistory();await openResult(id);
 }finally{runConferenceBtn.textContent='Iniciar conferência';progressWrap.classList.add('hidden');}
}

async function renderHistory(){const cs=(await all("conferencias")).sort((a,b)=>b.id-a.id);historyList.innerHTML="";emptyHistory.classList.toggle("hidden",cs.length>0);cs.forEach(c=>{const l=c.items.filter(i=>i.status==="localizado").length,p=c.items.length-l,card=document.createElement("div");card.className="history-card";card.innerHTML=`<div class=history-main><div class=history-top><b>Conferência #${c.id}</b><span class="status ${p?"pending":"ok"}">${p} pendente(s)</span></div><div class=meta>${new Date(c.criadoEm).toLocaleString("pt-BR")} · ${l} localizada(s)</div></div><div class=mini-actions><button class=mini-delete data-del="${c.id}">Excluir</button></div>`;card.querySelector(".history-main").onclick=()=>openResult(c.id);card.querySelector("[data-del]").onclick=e=>{e.stopPropagation();task(()=>deleteConference(c.id))};historyList.append(card)})}
async function deleteConference(id){if(!confirm("Excluir esta conferência?"))return;await requestP(store("conferencias","readwrite").delete(id));if(resultDialog.open)resultDialog.close();renderHistory();toast("Conferência excluída.")}
async function resetAll(){if(!confirm("Excluir TODAS as conferências? O acervo cadastrado será mantido."))return;await requestP(store("conferencias","readwrite").clear());renderHistory();toast("Conferências zeradas.")}
async function confirmCandidate(cid,idx,oid){
 const c=await requestP(store('conferencias').get(cid)),o=await requestP(store('obras').get(oid));
 if(!c?.items[idx]||!o)throw new Error('Obra ou conferência não encontrada.');
 const item=c.items[idx];item.status='localizado';item.obraId=oid;item.metodo='manual';item.score=item.candidatos?.find(x=>x.obraId===oid)?.score??null;item.observacao='Confirmado manualmente.';
 await requestP(store('conferencias','readwrite').put(c));await renderHistory();await openResult(cid);
}
async function undoMatch(cid,idx){
 const c=await requestP(store('conferencias').get(cid));if(!c?.items[idx])return;
 Object.assign(c.items[idx],{status:'pendente',obraId:null,metodo:null,score:c.items[idx].candidatos?.[0]?.score??null,observacao:'Correspondência desfeita. Selecione a obra correta ou mantenha pendente.'});
 await requestP(store('conferencias','readwrite').put(c));await renderHistory();await openResult(cid);
}
async function openResult(id){
 currentConferenceId=id;const c=await requestP(store('conferencias').get(id));if(!c)return;
 const ws=await all('obras'),mp=new Map(ws.map(o=>[o.id,o])),located=c.items.filter(i=>i.status==='localizado').length;
 resultTitle.textContent=`Conferência #${id}`;
 resultSummary.innerHTML=`<div class=stat><b>${located}</b><span>localizadas</span></div><div class=stat><b>${c.items.length-located}</b><span>pendentes</span></div>`;
 clearImages(resultItems);
 c.items.forEach((it,idx)=>{
  const d=document.createElement('div');d.className='result-item';const im=new Image;setFocusedPhoto(im,it.foto,it.recorte,'Foto da conferência');
  const t=document.createElement('div'),o=mp.get(it.obraId);
  let h=`<span class="status ${it.status==='localizado'?'ok':'pending'}">${it.status==='localizado'?'LOCALIZADA':'PENDENTE'}</span>`;
  h+=o?`<h4>${esc(o.nome)}</h4><p><b>Patrimônio:</b> ${esc(o.patrimonio||'Não informado')}</p><p>${esc(o.artista||'-')} · ${esc(o.localizacao||'-')}</p>`:`<h4>Imagem ${it.ordem||idx+1}</h4>`;
  if(it.status==='localizado'&&!o)h+='<p>Cadastro da obra removido. A confirmação foi preservada no histórico.</p>';
  if(it.score!=null)h+=`<p><b>Índice visual:</b> ${(it.score*100).toFixed(1)}/100 — não é probabilidade de acerto.</p>`;
  h+=`<p>${esc(it.observacao||'')}</p>`;if(it.recorte)h+='<p>Mostrando a área analisada. Foto original preservada no backup.</p>';
  if(it.status==='localizado')h+=`<button class="secondary undo-match" data-undo="${idx}">Revisar / desfazer</button>`;
  t.innerHTML=h;
  if(o?.fotos?.[0]){const ref=new Image;ref.className='matched-reference';setFocusedPhoto(ref,o.fotos[0],o.recortes?.[0],'Referência cadastrada');t.append(ref);}
  if(it.status!=='localizado'){
   const box=document.createElement('div');box.className='candidate-box';box.innerHTML='<b>Compare com as referências</b>';
   for(const x of it.candidatos||[]){
    const work=mp.get(x.obraId);if(!work)continue;
    const row=document.createElement('div');row.className='candidate';const photo=new Image;setFocusedPhoto(photo,work.fotos?.[0],work.recortes?.[0],`Referência: ${work.nome}`);
    const label=document.createElement('span');label.innerHTML=`${esc(work.nome)} · ${esc(work.patrimonio||'Sem patrimônio')}<br><small>${esc(work.localizacao||'')} · ${(x.score*100).toFixed(1)}/100</small>`;
    const button=document.createElement('button');button.className='confirm';button.textContent='Confirmar';button.onclick=()=>task(()=>confirmCandidate(id,idx,x.obraId));row.append(photo,label,button);box.append(row);
   }
   const select=document.createElement('select');select.setAttribute('aria-label','Selecionar outra obra do acervo');select.innerHTML='<option value="">Outra obra do acervo…</option>';
   for(const work of [...ws].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))){const option=document.createElement('option');option.value=work.id;option.textContent=`${work.patrimonio||'Sem patrimônio'} · ${work.nome}`;select.append(option);}
   const manualPreview=new Image;manualPreview.className='matched-reference hidden';
   const confirm=document.createElement('button');confirm.className='secondary';confirm.textContent='Confirmar obra selecionada';confirm.disabled=true;
   select.onchange=()=>{const work=mp.get(Number(select.value));confirm.disabled=!work;manualPreview.classList.toggle('hidden',!work?.fotos?.[0]);if(work?.fotos?.[0])setFocusedPhoto(manualPreview,work.fotos[0],work.recortes?.[0]);};
   confirm.onclick=()=>task(()=>confirmCandidate(id,idx,Number(select.value)));box.append(select,manualPreview,confirm);t.append(box);
  }
  d.append(im,t);resultItems.append(d);
 });
 resultItems.querySelectorAll('[data-undo]').forEach(b=>b.onclick=()=>task(()=>undoMatch(id,Number(b.dataset.undo))));
 exportCurrentCsvBtn.onclick=()=>task(()=>exportCsv(id));deleteCurrentBtn.onclick=()=>task(()=>deleteConference(id));if(!resultDialog.open)resultDialog.showModal();
}

/* CSV: 1 linha por obra no período. As "fotos na mesma linha" são listadas como nomes Foto 1, Foto 2... + quantidade.
   CSV não incorpora binários de imagem. O backup JSON mantém as imagens. */
function csvCell(v){const s=String(v??"").replaceAll('"','""');return `"${s}"`}
async function exportCsv(confId=null){
 const works=(await all("obras")).sort((a,b)=>String(a.patrimonio).localeCompare(String(b.patrimonio))),confs=(await all("conferencias")).sort((a,b)=>b.id-a.id),c=confId?confs.find(x=>x.id===confId):confs[0];
 if(!c)return toast("Nenhuma conferência para exportar.");
 const foundBy=new Map();c.items.forEach((it,idx)=>{if(it.obraId){const prev=foundBy.get(it.obraId);if(!prev||((it.score||0)>(prev.score||0)))foundBy.set(it.obraId,{...it,leitura:idx+1})}});
 const header=["Conferencia","Data da conferencia","Patrimonio","Nome da obra","Artista","Localizacao","Descricao","Qtd fotos referencia","Fotos referencia","Encontrada no periodo","Leitura","Indice visual (0 a 100)","Metodo de confirmacao"];
 const rows=[header.map(csvCell).join(";")];
 for(const o of works){const f=foundBy.get(o.id),fotoTxt=(o.fotos||[]).map((_,i)=>`Foto ${i+1}`).join(" | ");rows.push([c.id,new Date(c.criadoEm).toLocaleString("pt-BR"),o.patrimonio,o.nome,o.artista||"",o.localizacao||"",o.descricao||"",o.fotos?.length||0,fotoTxt,f?"SIM":"NÃO",f?.leitura||"",f?.score!=null?(f.score*100).toFixed(1):"",f?(f.metodo||(f.observacao==="Confirmado manualmente."?"manual":"automatico")):""].map(csvCell).join(";"))}
 const blob=new Blob(["\ufeff"+rows.join("\r\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`acervo-conferencia-${c.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("CSV exportado.");
}


/* Importação de acervo preparada a partir do Excel */
function dataUrlBlob(u){
 if(typeof u!=='string'||!/^data:image\/(jpeg|jpg|png|webp|gif|bmp);base64,/i.test(u))throw new Error('Foto inválida no arquivo.');
 const [header,data]=u.split(','),bin=atob(data),bytes=new Uint8Array(bin.length);if(!bin.length)throw new Error('Foto vazia no arquivo.');
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type:header.slice(5,header.indexOf(';'))});
}
async function photoHash(blob){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function importCatalog(file){
 const status=importCatalogStatus;status.textContent='Lendo arquivo…';
 const data=JSON.parse(await file.text());
 if(data.tipo!=='acervo-importacao'||!Array.isArray(data.obras))throw new Error('Formato de importação inválido.');
 const existing=await all('obras'),byPat=new Map(existing.filter(o=>searchKey(o.patrimonio)).map(o=>[searchKey(o.patrimonio),o]));
 const sourceSet=new Set(existing.flatMap(o=>[o.sourceKey,...o.sourceKeys||[]]).filter(Boolean));
 const changed=new Set(),copies=new Map();let added=0,skipped=0,photos=0,merged=0;
 for(let i=0;i<data.obras.length;i++){
  const x=data.obras[i];if(!x||typeof x!=='object'||!Array.isArray(x.fotos))throw new Error(`Obra inválida na posição ${i+1}.`);
  const pat=String(x.patrimonio||'').trim(),sourceKey=`${data.origem||'importacao'}#${x.linha_excel||i+1}`;
  if(sourceSet.has(sourceKey)){skipped++;continue;}
  let target=pat?byPat.get(searchKey(pat)):null;
  if(target){
   if(!changed.has(target)){
    if(!copies.has(target))copies.set(target,{...target,fotos:[...target.fotos||[]],descriptors:(target.fotos||[]).map((_,idx)=>target.descriptors?.[idx]||null),recortes:target.recortes?[...target.recortes]:undefined,sourceKeys:[...new Set([target.sourceKey,...target.sourceKeys||[]].filter(Boolean))]});
    target=copies.get(target);byPat.set(searchKey(pat),target);
   }
   merged++;
  }else{
   target={patrimonio:pat,nome:String(x.nome||'Sem título'),artista:String(x.artista||''),localizacao:String(x.localizacao||''),descricao:String(x.descricao||''),fotos:[],descriptors:[],sourceKey,sourceKeys:[],linhaExcel:x.linha_excel||null,criadoEm:new Date().toISOString()};added++;
   if(pat)byPat.set(searchKey(pat),target);
  }
  if(!changed.has(target))target.photoHashes=await Promise.all(target.fotos.map(photoHash));
  status.textContent=`Preparando ${i+1}/${data.obras.length}…`;
  for(const photo of x.fotos){
   const blob=dataUrlBlob(photo.data),hash=await photoHash(blob);if(target.photoHashes.includes(hash))continue;
   const descriptor=await extractSet(blob);if(target.recortes){while(target.recortes.length<target.fotos.length)target.recortes.push(null);target.recortes.push(null);}target.fotos.push(blob);target.descriptors.push(descriptor);target.photoHashes.push(hash);photos++;
  }
  target.sourceKeys.push(sourceKey);target.atualizadoEm=new Date().toISOString();changed.add(target);sourceSet.add(sourceKey);
 }
 if(changed.size){const tx=db.transaction('obras','readwrite'),done=transactionDone(tx);for(const o of changed)tx.objectStore('obras').put(o);await done;artworkCache=null;}
 status.textContent=`Concluído: ${added} obra(s) nova(s), ${photos} foto(s) adicionada(s), ${merged} linha(s) reunida(s) por patrimônio, ${skipped} linha(s) já importada(s).`;
 await renderArtworks();toast('Importação concluída.');
}
function setupCatalogImport(){
 importCatalogBtn.onclick=()=>importCatalogFile.click();
 importCatalogFile.onchange=()=>task(async()=>{const f=importCatalogFile.files[0];if(!f)return;try{await importCatalog(f);}catch(e){importCatalogStatus.textContent=`Importação cancelada: ${e.message}. Nenhuma obra foi adicionada.`;throw e;}finally{importCatalogFile.value='';}});
}
const extractSet=f=>Visual.extract(f);

/* Backup */
function toData(b){return new Promise((a,z)=>{const r=new FileReader;r.onload=()=>a(r.result);r.onerror=()=>z(r.error);r.readAsDataURL(b)})}const fromData=dataUrlBlob;
async function exportBackup(){const obras=[],cs=[];for(const o of await all("obras")){const x={...o,fotos:[]};for(const f of o.fotos||[])x.fotos.push(await toData(f));obras.push(x)}for(const c of await all("conferencias")){const x={...c,items:[]};for(const i of c.items)x.items.push({...i,foto:i.foto?await toData(i.foto):null});cs.push(x)}const b=new Blob([JSON.stringify({version:"0.7.0",createdAt:new Date().toISOString(),obras,conferencias:cs})],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`acervo-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Backup exportado.")}
async function importBackup(f){
 const data=JSON.parse(await f.text());
 if(data.tipo==='acervo-importacao'){await importCatalog(f);return;}
 if(!data||!Array.isArray(data.obras)||!Array.isArray(data.conferencias)||!data.version)throw new Error('Backup inválido. Seu acervo foi preservado.');
 for(const name of ['obras','conferencias']){const ids=new Set();for(const o of data[name]){if(!o||!Number.isSafeInteger(o.id)||o.id<=0||ids.has(o.id))throw new Error('Backup com identificadores inválidos ou repetidos.');ids.add(o.id);}}
 for(const o of data.obras){
  if(typeof o.nome!=='string'||!Array.isArray(o.fotos))throw new Error('Cadastro inválido no backup.');
  o.fotos=o.fotos.map(fromData);o.descriptors=[];
  if(o.recortes!=null&&(!Array.isArray(o.recortes)||o.recortes.length!==o.fotos.length||!o.recortes.every(FocusCrop.valid)))throw new Error('Área de referência inválida no backup.');
  for(let i=0;i<o.fotos.length;i++)o.descriptors.push(await extractSet(await FocusCrop.apply(o.fotos[i],o.recortes?.[i])));
 }
 for(const c of data.conferencias){
  if(!Array.isArray(c.items))throw new Error('Conferência inválida no backup.');
  for(const item of c.items){if(!item||!['localizado','pendente'].includes(item.status))throw new Error('Resultado inválido no backup.');if(!FocusCrop.valid(item.recorte))throw new Error('Área de conferência inválida no backup.');if(item.foto){item.foto=fromData(item.foto);const bitmap=await createImageBitmap(item.foto);bitmap.close();}}
 }
 if(!confirm(`Restaurar ${data.obras.length} obras e ${data.conferencias.length} conferências? Esta ação substitui os dados atuais neste aparelho. Exporte um backup antes, se precisar mantê-los.`))return;
 const tx=db.transaction(['obras','conferencias'],'readwrite'),done=transactionDone(tx);
 for(const name of ['obras','conferencias']){const st=tx.objectStore(name);st.clear();for(const o of data[name])st.put(o);}
 await done;artworkCache=null;await renderArtworks();await renderHistory();toast('Backup restaurado.');
}
function setupActions(){
 exportBtn.onclick=()=>task(exportBackup);importBtn.onclick=()=>importFile.click();
 importFile.onchange=()=>task(async()=>{try{if(importFile.files[0])await importBackup(importFile.files[0]);}finally{importFile.value='';}});
 exportCsvBtn.onclick=()=>task(()=>exportCsv());exportLatestBtn.onclick=()=>task(()=>exportCsv());resetAllBtn.onclick=()=>task(resetAll);
 let searchTimer;searchInput.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{artworkLimit=60;renderArtworks().catch(showError);},160);};
}

(async()=>{db=await openDB();setupNav();setupDialogs();setupInstall();setupInputs();setupActions();setupCatalogImport();await renderArtworks();await renderHistory();if("serviceWorker"in navigator){navigator.serviceWorker.register("./sw.js").then(r=>r.update()).catch(console.warn)}})().catch(showError);
