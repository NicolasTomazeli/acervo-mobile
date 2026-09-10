
const DB_NAME="acervo-mobile-db", DB_VERSION=1;
const AUTO_THRESHOLD=.82, REVIEW_THRESHOLD=.62, MIN_MARGIN=.035;
let db, deferredPrompt=null, referenceFiles=[], conferenceFiles=[];

function requestP(req){return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
async function all(name){return requestP(store(name).getAll())}
async function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains("obras")){const s=d.createObjectStore("obras",{keyPath:"id",autoIncrement:true});try{s.createIndex("patrimonio","patrimonio",{unique:true})}catch(_){}}if(!d.objectStoreNames.contains("conferencias"))d.createObjectStore("conferencias",{keyPath:"id",autoIncrement:true});};r.onsuccess=e=>res(e.target.result);r.onerror=e=>rej(e.target.error)})}
function toast(msg){const el=document.getElementById("toast");el.textContent=msg;el.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove("show"),2400)}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function blobUrl(b){return b?URL.createObjectURL(b):""}
function isStandalone(){return window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true}

function setupNavigation(){
 document.querySelectorAll(".nav").forEach(btn=>btn.onclick=()=>{const v=btn.dataset.view;document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b===btn));document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById("view-"+v).classList.add("active");window.scrollTo({top:0,behavior:"smooth"});if(v==="resultados")renderHistory();});
}
function setupDialogs(){
 document.getElementById("newArtworkBtn").onclick=()=>document.getElementById("artworkDialog").showModal();
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
}
function setupInstall(){
 const btn=document.getElementById("installBtn");
 if(isStandalone()){btn.classList.add("installed");return}
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;btn.textContent="Instalar app";btn.classList.remove("installed")});
 window.addEventListener("appinstalled",()=>{deferredPrompt=null;btn.classList.add("installed");toast("Acervo instalado.");});
 btn.onclick=async()=>{
   if(deferredPrompt){
     deferredPrompt.prompt();const choice=await deferredPrompt.userChoice;
     if(choice.outcome==="accepted"){deferredPrompt=null;btn.classList.add("installed")}
     return;
   }
   const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
   document.getElementById("installHelpText").textContent=ios
    ?"No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”."
    :"No Chrome, abra o menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”. Se a opção não aparecer, atualize esta página uma vez.";
   document.getElementById("installHelpDialog").showModal();
 };
}

function preview(files,targetId){
 const el=document.getElementById(targetId);el.innerHTML="";
 files.forEach((f,i)=>{const d=document.createElement("div");d.className="preview";const im=document.createElement("img");im.src=blobUrl(f);const n=document.createElement("span");n.textContent=i+1;d.append(im,n);el.appendChild(d)});
}

async function compressImage(file,maxSide=1400,quality=.84){
 const b=await createImageBitmap(file);
 const scale=Math.min(1,maxSide/Math.max(b.width,b.height));
 const w=Math.max(1,Math.round(b.width*scale)),h=Math.max(1,Math.round(b.height*scale));
 const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(b,0,0,w,h);b.close?.();
 return new Promise(resolve=>c.toBlob(blob=>resolve(blob||file),"image/jpeg",quality));
}

function setupInputs(){
 const ref=document.getElementById("referenceInput"),conf=document.getElementById("conferenceInput");
 ref.onchange=async()=>{const raw=[...ref.files].filter(f=>f.type.startsWith("image/")).slice(0,8);referenceFiles=[];toast("Preparando fotos…");for(const f of raw)referenceFiles.push(await compressImage(f));preview(referenceFiles,"referencePreview")};
 conf.onchange=async()=>{const raw=[...conf.files].filter(f=>f.type.startsWith("image/")).slice(0,7);if(conf.files.length>7)toast("Foram consideradas apenas as 7 primeiras imagens.");conferenceFiles=[];for(const f of raw)conferenceFiles.push(await compressImage(f));preview(conferenceFiles,"conferencePreview");document.getElementById("runConferenceBtn").disabled=!conferenceFiles.length;document.getElementById("clearConferenceBtn").classList.toggle("hidden",!conferenceFiles.length)};
 document.getElementById("clearConferenceBtn").onclick=clearConference;
 document.getElementById("runConferenceBtn").onclick=runConference;
}
function clearConference(){conferenceFiles=[];document.getElementById("conferenceInput").value="";document.getElementById("conferencePreview").innerHTML="";document.getElementById("runConferenceBtn").disabled=true;document.getElementById("clearConferenceBtn").classList.add("hidden")}

async function renderArtworks(){
 let items=(await all("obras")).sort((a,b)=>b.id-a.id);
 const q=document.getElementById("searchInput").value.toLowerCase().trim();
 document.getElementById("statArtworks").textContent=items.length;
 document.getElementById("statRefs").textContent=items.reduce((s,o)=>s+(o.fotos?.length||0),0);
 if(q)items=items.filter(o=>[o.nome,o.patrimonio,o.artista,o.localizacao].join(" ").toLowerCase().includes(q));
 const list=document.getElementById("artworkList");list.innerHTML="";
 document.getElementById("emptyArtworks").classList.toggle("hidden",items.length>0);
 items.forEach(o=>{const card=document.createElement("div");card.className="art-card";const im=document.createElement("img");if(o.fotos?.[0])im.src=blobUrl(o.fotos[0]);const m=document.createElement("div");m.className="art-main";m.innerHTML=`<b>${esc(o.nome)}</b><div class="meta">${esc(o.patrimonio)} · ${esc(o.artista||"Artista não informado")}</div><div class="meta">${esc(o.localizacao||"Localização não informada")} · ${o.fotos?.length||0} foto(s)</div>`;card.append(im,m);list.appendChild(card)});
}
async function saveArtwork(e){
 e.preventDefault();const fd=new FormData(e.target),pat=(fd.get("patrimonio")||"").trim(),nome=(fd.get("nome")||"").trim();
 if(!pat||!nome)return toast("Patrimônio e nome são obrigatórios.");
 const existing=await all("obras");if(existing.some(o=>String(o.patrimonio).toLowerCase()===pat.toLowerCase()))return toast("Esse patrimônio já está cadastrado.");
 const descriptors=[];toast("Analisando referências…");
 for(const f of referenceFiles)descriptors.push(await extractDescriptorSet(f));
 await requestP(store("obras","readwrite").add({patrimonio:pat,nome,artista:(fd.get("artista")||"").trim(),localizacao:(fd.get("localizacao")||"").trim(),descricao:(fd.get("descricao")||"").trim(),fotos:[...referenceFiles],descriptors,criadoEm:new Date().toISOString()}));
 e.target.reset();referenceFiles=[];document.getElementById("referencePreview").innerHTML="";document.getElementById("artworkDialog").close();await renderArtworks();toast("Obra cadastrada.");
}
async function ensureDescriptors(works){
 for(const o of works){
   if(!Array.isArray(o.descriptors)||o.descriptors.length!==(o.fotos?.length||0)||o.descriptors.some(x=>!x?.full)){
     o.descriptors=[];for(const f of (o.fotos||[]))o.descriptors.push(await extractDescriptorSet(f));await requestP(store("obras","readwrite").put(o));
   }
 }
}

function progress(done,total,text){
 const wrap=document.getElementById("progressWrap"),bar=document.getElementById("progressBar"),label=document.getElementById("progressText");
 wrap.classList.remove("hidden");bar.style.width=`${Math.round(done/Math.max(1,total)*100)}%`;label.textContent=text;
}

async function runConference(){
 if(!conferenceFiles.length)return;
 const works=await all("obras"),refs=works.filter(o=>(o.fotos?.length||0)>0);
 if(!refs.length)return toast("Cadastre ao menos uma obra com foto de referência.");
 const btn=document.getElementById("runConferenceBtn");btn.disabled=true;btn.textContent="Analisando…";
 progress(0,conferenceFiles.length,"Preparando referências…");await ensureDescriptors(refs);
 const items=[];
 for(let i=0;i<conferenceFiles.length;i++){
   progress(i,conferenceFiles.length,`Analisando imagem ${i+1} de ${conferenceFiles.length}…`);
   const q=await extractDescriptorSet(conferenceFiles[i]),candidates=[];
   for(const o of refs){
     let best=0;
     for(const r of (o.descriptors||[])){if(!r)continue;best=Math.max(best,setSimilarity(q,r))}
     candidates.push({obraId:o.id,nome:o.nome,patrimonio:o.patrimonio,artista:o.artista||"",localizacao:o.localizacao||"",score:best});
   }
   candidates.sort((a,b)=>b.score-a.score);
   const top=candidates[0],second=candidates[1],margin=second?top.score-second.score:top.score;
   const located=top&&top.score>=AUTO_THRESHOLD&&(candidates.length===1||margin>=MIN_MARGIN);
   items.push({ordem:i+1,foto:conferenceFiles[i],status:located?"localizado":"pendente",obraId:located?top.obraId:null,score:top?.score??null,candidatos:candidates.slice(0,3),observacao:located?`Correspondência automática com ${top.nome}.`:(top?.score>=REVIEW_THRESHOLD?`Possível correspondência com ${top.nome}. Revise os candidatos.`:"Nenhuma correspondência visual segura.")});
   await new Promise(r=>setTimeout(r,0));
 }
 progress(conferenceFiles.length,conferenceFiles.length,"Concluído.");
 const id=await requestP(store("conferencias","readwrite").add({criadoEm:new Date().toISOString(),items}));
 clearConference();btn.textContent="Iniciar conferência";document.getElementById("progressWrap").classList.add("hidden");await renderHistory();await openResult(id);toast("Conferência concluída.");
}

async function renderHistory(){
 const items=(await all("conferencias")).sort((a,b)=>b.id-a.id),list=document.getElementById("historyList");list.innerHTML="";
 document.getElementById("emptyHistory").classList.toggle("hidden",items.length>0);
 items.forEach(c=>{const loc=c.items.filter(i=>i.status==="localizado").length,pend=c.items.length-loc,b=document.createElement("button");b.className="history-card";b.innerHTML=`<div class="history-main"><div class="history-top"><b>Conferência #${c.id}</b><span class="status ${pend?"pending":"ok"}">${pend} pendente(s)</span></div><div class="meta">${new Date(c.criadoEm).toLocaleString("pt-BR")} · ${c.items.length} imagem(ns) · ${loc} localizada(s)</div></div><span>›</span>`;b.onclick=()=>openResult(c.id);list.appendChild(b)});
}
async function confirmCandidate(confId,itemIndex,obraId){
 const c=await requestP(store("conferencias").get(confId));if(!c)return;c.items[itemIndex].status="localizado";c.items[itemIndex].obraId=obraId;c.items[itemIndex].observacao="Confirmado manualmente.";await requestP(store("conferencias","readwrite").put(c));await renderHistory();await openResult(confId);toast("Correspondência confirmada.");
}
async function openResult(id){
 const c=await requestP(store("conferencias").get(id));if(!c)return;const works=await all("obras"),map=new Map(works.map(o=>[o.id,o]));const loc=c.items.filter(i=>i.status==="localizado").length;
 document.getElementById("resultTitle").textContent=`Conferência #${id}`;document.getElementById("resultSummary").innerHTML=`<div class="stat"><b>${loc}</b><span>localizadas</span></div><div class="stat"><b>${c.items.length-loc}</b><span>pendentes</span></div>`;
 const wrap=document.getElementById("resultItems");wrap.innerHTML="";
 c.items.forEach((it,index)=>{const d=document.createElement("div");d.className="result-item";const im=document.createElement("img");im.src=blobUrl(it.foto);const t=document.createElement("div"),o=it.obraId?map.get(it.obraId):null;
   let html=`<span class="status ${it.status==="localizado"?"ok":"pending"}">${it.status==="localizado"?"LOCALIZADA":"PENDENTE"}</span>`;
   html+=o?`<h4>${esc(o.nome)}</h4><p><b>Patrimônio:</b> ${esc(o.patrimonio)}</p><p>${esc(o.artista||"-")} · ${esc(o.localizacao||"-")}</p>`:`<h4>Imagem ${it.ordem||index+1}</h4>`;
   if(it.score!=null)html+=`<p><b>Similaridade visual:</b> ${(it.score*100).toFixed(1)}%</p>`;
   html+=`<p>${esc(it.observacao||"")}</p>`;
   if(it.status!=="localizado"&&Array.isArray(it.candidatos)&&it.candidatos.length){html+=`<div class="candidate-box"><b>Melhores candidatos</b>`+it.candidatos.map((x,j)=>`<div class="candidate"><span>${j+1}. ${esc(x.nome)} · ${esc(x.patrimonio)}<br><small>${(x.score*100).toFixed(1)}%</small></span><button class="confirm" data-confirm="${id}|${index}|${x.obraId}">Confirmar</button></div>`).join("")+`</div>`}
   t.innerHTML=html;d.append(im,t);wrap.appendChild(d);
 });
 wrap.querySelectorAll("[data-confirm]").forEach(b=>b.onclick=()=>{const [cid,idx,oid]=b.dataset.confirm.split("|").map(Number);confirmCandidate(cid,idx,oid)});
 const dlg=document.getElementById("resultDialog");if(!dlg.open)dlg.showModal();
}

/* Motor visual local leve: duas leituras (imagem completa + recorte central) */
async function bitmap(file){return createImageBitmap(file)}
function canvasVariant(b,size,mode){
 const c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,size,size);
 if(mode==="crop"){const s=Math.min(b.width,b.height),sx=(b.width-s)/2,sy=(b.height-s)/2;x.drawImage(b,sx,sy,s,s,0,0,size,size)}
 else{const k=Math.min(size/b.width,size/b.height),w=b.width*k,h=b.height*k;x.drawImage(b,(size-w)/2,(size-h)/2,w,h)}
 return c;
}
function gray(data){const a=[];for(let i=0;i<data.length;i+=4)a.push((.299*data[i]+.587*data[i+1]+.114*data[i+2])/255);return a}
function avg(a){return a.reduce((s,x)=>s+x,0)/Math.max(1,a.length)}
function sd(a,m){return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/Math.max(1,a.length))}
function ahash(g){const m=avg(g);return g.map(x=>x>=m?1:0).join("")}
function hist(data,bins=8){const h=new Array(bins*3).fill(0);for(let i=0;i<data.length;i+=4){h[Math.min(bins-1,Math.floor(data[i]/256*bins))]++;h[bins+Math.min(bins-1,Math.floor(data[i+1]/256*bins))]++;h[2*bins+Math.min(bins-1,Math.floor(data[i+2]/256*bins))]++}const n=Math.sqrt(h.reduce((s,x)=>s+x*x,0))||1;return h.map(x=>x/n)}
function norm(a){const m=avg(a),s=sd(a,m)||1;return a.map(x=>(x-m)/s)}
function edge(g,size){const v=[];for(let y=1;y<size-1;y+=2)for(let x=1;x<size-1;x+=2){const gx=g[y*size+x+1]-g[y*size+x-1],gy=g[(y+1)*size+x]-g[(y-1)*size+x];v.push(Math.hypot(gx,gy))}const n=Math.sqrt(v.reduce((s,x)=>s+x*x,0))||1;return v.map(x=>x/n)}
function singleDescriptor(b,mode){
 const c=canvasVariant(b,32,mode),data=c.getContext("2d",{willReadFrequently:true}).getImageData(0,0,32,32).data,g=gray(data);
 const c8=canvasVariant(b,8,mode),g8=gray(c8.getContext("2d",{willReadFrequently:true}).getImageData(0,0,8,8).data);
 return {hash:ahash(g8),gray:norm(g),hist:hist(data),edge:edge(g,32)};
}
async function extractDescriptorSet(file){const b=await bitmap(file);const r={full:singleDescriptor(b,"fit"),crop:singleDescriptor(b,"crop")};b.close?.();return r}
function ham(a,b){if(!a||!b||a.length!==b.length)return 0;let s=0;for(let i=0;i<a.length;i++)if(a[i]===b[i])s++;return s/a.length}
function cos(a,b){if(!a||!b||a.length!==b.length)return 0;let d=0,x=0,y=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];x+=a[i]*a[i];y+=b[i]*b[i]}return (!x||!y)?0:Math.max(-1,Math.min(1,d/Math.sqrt(x*y)))}
function descriptorSimilarity(a,b){const h=ham(a.hash,b.hash),c=Math.max(0,cos(a.hist,b.hist)),g=(cos(a.gray,b.gray)+1)/2,e=Math.max(0,cos(a.edge,b.edge));return .22*h+.25*c+.31*g+.22*e}
function setSimilarity(a,b){return Math.max(descriptorSimilarity(a.full,b.full),descriptorSimilarity(a.full,b.crop),descriptorSimilarity(a.crop,b.full),descriptorSimilarity(a.crop,b.crop))}

/* Backup */
function blobToDataURL(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
function dataURLToBlob(url){const [head,data]=url.split(","),mime=(head.match(/:(.*?);/)||[])[1]||"image/jpeg",bin=atob(data),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}
async function serializeArtwork(o){const x={...o};x.fotos=[];for(const f of (o.fotos||[]))x.fotos.push(await blobToDataURL(f));return x}
async function serializeConference(c){const x={...c,items:[]};for(const it of c.items){const y={...it,foto:it.foto?await blobToDataURL(it.foto):null};x.items.push(y)}return x}
async function exportBackup(){
 toast("Preparando backup…");const obras=[],confs=[];for(const o of await all("obras"))obras.push(await serializeArtwork(o));for(const c of await all("conferencias"))confs.push(await serializeConference(c));
 const blob=new Blob([JSON.stringify({version:"0.3.1",createdAt:new Date().toISOString(),obras,conferencias:confs})],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`acervo-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Backup exportado.");
}
async function importBackup(file){
 const data=JSON.parse(await file.text());if(!Array.isArray(data.obras)||!Array.isArray(data.conferencias))throw new Error("Backup inválido");
 const t1=db.transaction("obras","readwrite"),s1=t1.objectStore("obras");s1.clear();for(const o of data.obras){o.fotos=(o.fotos||[]).map(dataURLToBlob);s1.put(o)}await new Promise((res,rej)=>{t1.oncomplete=res;t1.onerror=()=>rej(t1.error)});
 const t2=db.transaction("conferencias","readwrite"),s2=t2.objectStore("conferencias");s2.clear();for(const c of data.conferencias){for(const it of c.items)if(typeof it.foto==="string")it.foto=dataURLToBlob(it.foto);s2.put(c)}await new Promise((res,rej)=>{t2.oncomplete=res;t2.onerror=()=>rej(t2.error)});
 await renderArtworks();await renderHistory();toast("Backup restaurado.");
}
function setupBackup(){
 document.getElementById("exportBtn").onclick=exportBackup;
 document.getElementById("importBtn").onclick=()=>document.getElementById("importFile").click();
 document.getElementById("importFile").onchange=async e=>{if(!e.target.files[0])return;try{await importBackup(e.target.files[0])}catch(err){console.error(err);toast("Não foi possível importar esse backup.")}e.target.value=""};
}

async function boot(){
 db=await openDB();setupNavigation();setupDialogs();setupInstall();setupInputs();setupBackup();
 document.getElementById("artworkForm").addEventListener("submit",saveArtwork);
 document.getElementById("searchInput").addEventListener("input",renderArtworks);
 await renderArtworks();await renderHistory();
 if("serviceWorker" in navigator){
   navigator.serviceWorker.register("./sw.js").then(reg=>reg.update()).catch(console.warn);
   let refreshing=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing)return;refreshing=true;location.reload()});
 }
}
boot().catch(e=>{console.error(e);toast("Erro ao iniciar o aplicativo.")});
