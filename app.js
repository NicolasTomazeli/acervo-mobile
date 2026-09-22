
const DB_NAME="acervo-mobile-db", DB_VERSION=3;
const AUTO_THRESHOLD=.82, REVIEW_THRESHOLD=.62, MIN_MARGIN=.035;
const DEFAULT_ESTILOS=["Pintura","Escultura","Cerâmica"];
const DEFAULT_CRITERIOS_STATUS={nivel1Max:50000,nivel2Max:200000};

/* ---- Status de segurança: sempre calculado ao vivo a partir do Valor da Última Avaliação + critérios atuais (nunca gravado na obra, assim mudar os critérios já reflete em tudo na hora) ---- */
async function getCriteriosStatus(){const r=await requestP(store("config").get("criteriosStatusSeguranca"));return r?{nivel1Max:r.nivel1Max,nivel2Max:r.nivel2Max}:{...DEFAULT_CRITERIOS_STATUS}}
async function saveCriteriosStatus(nivel1Max,nivel2Max){await requestP(store("config","readwrite").put({chave:"criteriosStatusSeguranca",nivel1Max,nivel2Max}))}
function calcularStatusSeguranca(valor,criterios){
 if(valor===null||valor===undefined||valor==="")return null;
 const v=Number(valor);if(isNaN(v))return null;
 if(v<=criterios.nivel1Max)return 1;
 if(v<=criterios.nivel2Max)return 2;
 return 3;
}
function statusBadgeHtml(nivel){
 if(!nivel)return"";
 const label=nivel===1?"Nível 1 — Seguro":nivel===2?"Nível 2":"Nível 3 — Crítico";
 return `<span class="status-badge status-${nivel}">${label}</span>`;
}
async function updateStatusBadgePreview(){
 const criterios=await getCriteriosStatus(),nivel=calcularStatusSeguranca(valorAvaliacaoInput.value,criterios);
 statusSegurancaBadgeWrap.innerHTML=nivel?`Status de segurança: ${statusBadgeHtml(nivel)}`:"";
}
function setupCriterios(){
 manageCriteriosBtn.onclick=async()=>{const c=await getCriteriosStatus();criterioNivel1Input.value=c.nivel1Max;criterioNivel2Input.value=c.nivel2Max;criteriosDialog.showModal()};
 salvarCriteriosBtn.onclick=async()=>{
  const n1=Number(criterioNivel1Input.value),n2=Number(criterioNivel2Input.value);
  if(criterioNivel1Input.value===""||criterioNivel2Input.value===""||isNaN(n1)||isNaN(n2)||n1<0||n2<0)return toast("Preencha os dois valores.");
  if(n1>=n2)return toast("O valor do Nível 1 precisa ser menor que o do Nível 2.");
  await saveCriteriosStatus(n1,n2);criteriosDialog.close();await renderArtworks();await updateStatusBadgePreview();toast("Critérios salvos.");
 };
}
let db,deferredPrompt=null,referenceFiles=[],conferenceFiles=[],currentConferenceId=null,editingArtworkId=null,removedPhotoIndexes=new Set(),cropStateData=null,editedFotos=[],editedDescs=[],editedDocumentos=[],conferenciaAtivaFilial=null,conferenciaAtivaLocal=null;
let dashboardStage="filiais",dashboardFilial=null,dashboardLocal=null;

function requestP(r){return new Promise((a,b)=>{r.onsuccess=()=>a(r.result);r.onerror=()=>b(r.error)})}
function store(n,m="readonly"){return db.transaction(n,m).objectStore(n)}
async function all(n){return requestP(store(n).getAll())}
async function openDB(){return new Promise((a,b)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains("obras")){d.createObjectStore("obras",{keyPath:"id",autoIncrement:true})}else{const s=r.transaction.objectStore("obras");if(s.indexNames.contains("patrimonio"))s.deleteIndex("patrimonio")}if(!d.objectStoreNames.contains("conferencias"))d.createObjectStore("conferencias",{keyPath:"id",autoIncrement:true});if(!d.objectStoreNames.contains("config"))d.createObjectStore("config",{keyPath:"chave"})};r.onsuccess=e=>a(e.target.result);r.onerror=e=>b(e.target.error)})}

/* ---- Estilos (antes "técnicas") ---- */
async function getEstilos(){const r=await requestP(store("config").get("estilos"));return (r&&Array.isArray(r.valores)&&r.valores.length)?r.valores:DEFAULT_ESTILOS.slice()}
async function saveEstilos(arr){await requestP(store("config","readwrite").put({chave:"estilos",valores:arr}))}
async function populateEstiloSelect(currentValue){const sel=artworkForm.elements.estilo,list=(await getEstilos()).slice().sort((a,b)=>a.localeCompare(b,"pt-BR")),extra=(currentValue&&!list.includes(currentValue))?[currentValue]:[];sel.innerHTML=`<option value="">Selecione</option>`+[...list,...extra].map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");sel.value=currentValue||""}

/* ---- Filiais e locais ---- */
async function getFiliais(){const r=await requestP(store("config").get("filiais"));return (r&&Array.isArray(r.valores))?r.valores:[]}
async function saveFiliais(arr){await requestP(store("config","readwrite").put({chave:"filiais",valores:arr}))}
function nomeFilial(filiais,codigo){const f=filiais.find(x=>x.codigo===codigo);return f?f.nome:(codigo||"-")}
async function populateFilialSelect(sel,currentValue){const filiais=(await getFiliais()).slice().sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));sel.innerHTML=`<option value="">Selecione</option>`+filiais.map(fl=>`<option value="${esc(fl.codigo)}">${esc(fl.nome)}</option>`).join("");sel.value=currentValue||(filiais.length===1?filiais[0].codigo:"")}
async function populateLocalSelect(sel,filialCodigo,currentValue){const filiais=await getFiliais(),fl=filiais.find(x=>x.codigo===filialCodigo),locais=(fl?fl.locais:[]).slice().sort((a,b)=>a.localeCompare(b,"pt-BR")),extra=(currentValue&&!locais.includes(currentValue))?[currentValue]:[];sel.innerHTML=`<option value="">Selecione</option>`+[...locais,...extra].map(l=>`<option value="${esc(l)}">${esc(l)}</option>`).join("");sel.value=currentValue||""}

/* ---- Migração única: cria filial 159 com os locais já usados, migra técnica -> estilo ---- */
async function migrarFilialEstilo(){
 const flag=await requestP(store("config").get("migracaoFilialLocal"));
 if(flag?.feita)return false;
 const obras=await all("obras");
 const locaisSet=new Set(),estilosSet=new Set(DEFAULT_ESTILOS);
 for(const o of obras){if(o.localizacao)locaisSet.add(o.localizacao);if(o.tecnica)estilosSet.add(o.tecnica);if(o.estilo)estilosSet.add(o.estilo)}
 const filiaisAtuais=await getFiliais();
 if(!filiaisAtuais.length){await saveFiliais([{codigo:"159",nome:"Filial 159",locais:[...locaisSet].sort((a,b)=>a.localeCompare(b,"pt-BR"))}])}
 const estilosAtuais=await requestP(store("config").get("estilos"));
 if(!estilosAtuais){const oldTecnicas=await requestP(store("config").get("tecnicas"));const merged=new Set([...(oldTecnicas?.valores||[]),...estilosSet]);await saveEstilos([...merged])}
 for(const o of obras){let mudou=false;if(!o.filial){o.filial="159";mudou=true}if(!o.estilo&&o.tecnica){o.estilo=o.tecnica;mudou=true}if(mudou){await requestP(store("obras","readwrite").put(o))}}
 await requestP(store("config","readwrite").put({chave:"migracaoFilialLocal",feita:true,em:new Date().toISOString()}));
 return true;
}

/* ---- Armazenamento / backup status ---- */
async function ensureStoragePersisted(){if(!navigator.storage?.persist)return;try{const already=await navigator.storage.persisted();if(!already)await navigator.storage.persist()}catch{}}
async function renderStorageStatus(){
 if(!storageStatus)return;
 try{
  const persisted=navigator.storage?.persisted?await navigator.storage.persisted():null;
  const est=navigator.storage?.estimate?await navigator.storage.estimate():null;
  const mb=n=>((n||0)/1048576).toFixed(1)+" MB";
  const ub=await requestP(store("config").get("ultimoBackup")).catch(()=>null);
  let backupMsg;
  if(!ub){backupMsg=`<p class="backup-warn">Você ainda não exportou um backup nesta versão. Recomendo fazer isso agora, em "Backup completo" abaixo.</p>`}
  else{const dias=Math.floor((Date.now()-new Date(ub.valor).getTime())/86400000);backupMsg=dias>7?`<p class="backup-warn">Último backup há ${dias} dias. Recomendo exportar um novo em "Backup completo" abaixo.</p>`:`<p class="muted">Último backup: há ${dias===0?"menos de 1 dia":dias+" dia(s)"}.</p>`}
  storageStatus.innerHTML=`<p class="muted">Armazenamento protegido contra limpeza automática: <b>${persisted===null?"não suportado neste navegador":(persisted?"sim":"não")}</b></p>`+(est?`<p class="muted">Uso local: <b>${mb(est.usage)}</b> de ${mb(est.quota)} disponíveis neste aparelho.</p>`:"")+(standalone()?"":`<p class="muted">Dica: use o app pela tela instalada (ícone adicionado à tela inicial), não pelo navegador comum.</p>`)+`<p class="backup-warn">Atenção Android/Samsung: em Ajustes do celular → Apps, tanto o Chrome quanto este app instalado têm um botão "Limpar dados" (às vezes chamado "Limpar armazenamento") — diferente de "Limpar cache". Tocar em "Limpar dados" apaga o acervo e as conferências. O "Otimizar agora" do Device Care não apaga dados, só cache — esse pode usar sem medo.</p>`+backupMsg;
 }catch{storageStatus.innerHTML=""}
}
function toast(m){const e=document.getElementById("toast");e.textContent=m;e.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>e.classList.remove("show"),2300)}
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const url=b=>b?URL.createObjectURL(b):"";
const standalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;

function setupNav(){document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{const v=b.dataset.view;document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById("view-"+v).classList.add("active");if(v==="resultados")renderHistory();if(v==="conferir"){renderConferenceBanner();if(!conferenciaAtivaFilial||!conferenciaAtivaLocal)openConferenceContextDialog()}if(v==="paineis"){dashboardStage="filiais";dashboardFilial=null;dashboardLocal=null;renderDashboard()}window.scrollTo({top:0,behavior:"smooth"})})}

function resetArtworkForm(){
 editingArtworkId=null;removedPhotoIndexes=new Set();referenceFiles=[];editedFotos=[];editedDescs=[];editedDocumentos=[];artworkForm.reset();editId.value="";
 artworkDialogTitle.textContent="Nova obra";existingPhotosWrap.classList.add("hidden");existingPhotos.innerHTML="";
 referencePreview.innerHTML="";deleteArtworkBtn.classList.add("hidden");renderDocumentosList();statusSegurancaBadgeWrap.innerHTML="";
}
function setupDialogs(){
 newArtworkBtn.onclick=async()=>{resetArtworkForm();await populateEstiloSelect();await populateFilialSelect(artworkForm.elements.filial);await populateLocalSelect(artworkForm.elements.localizacao,artworkForm.elements.filial.value,"");artworkDialog.showModal()};
 artworkForm.elements.filial.onchange=()=>populateLocalSelect(artworkForm.elements.localizacao,artworkForm.elements.filial.value,"");
 valorAvaliacaoInput.oninput=updateStatusBadgePreview;
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
 deleteArtworkBtn.onclick=()=>editingArtworkId&&deleteArtwork(editingArtworkId);
}
function setupInstall(){if(standalone())installBtn.classList.add("installed");window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e});window.addEventListener("appinstalled",()=>installBtn.classList.add("installed"));installBtn.onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;return}installHelpText.textContent=/iphone|ipad|ipod/i.test(navigator.userAgent)?"No Safari: Compartilhar → Adicionar à Tela de Início.":"No Chrome: menu ⋮ → Instalar app / Adicionar à tela inicial.";installHelpDialog.showModal()}}
function preview(fs,id){const e=document.getElementById(id);e.innerHTML="";fs.forEach((f,i)=>{const d=document.createElement("div");d.className="preview";const im=new Image;im.src=url(f);const n=document.createElement("span");n.textContent=i+1;d.append(im,n);e.append(d)})}
async function compress(f,max=1400,q=.84){const b=await createImageBitmap(f),k=Math.min(1,max/Math.max(b.width,b.height)),w=Math.round(b.width*k),h=Math.round(b.height*k),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(b,0,0,w,h);b.close?.();return new Promise(r=>c.toBlob(x=>r(x||f),"image/jpeg",q))}

/* ---- Recorte (inalterado) ---- */
function setupCropTool(){
 const stage=cropStage;let mode=null,startX=0,startY=0,start={};
 function applyRect(){cropRect.style.left=(cropStateData.rx*100)+"%";cropRect.style.top=(cropStateData.ry*100)+"%";cropRect.style.width=(cropStateData.rw*100)+"%";cropRect.style.height=(cropStateData.rh*100)+"%"}
 function clamp(){const s=cropStateData;s.rw=Math.max(.08,Math.min(1,s.rw));s.rh=Math.max(.08,Math.min(1,s.rh));s.rx=Math.max(0,Math.min(1-s.rw,s.rx));s.ry=Math.max(0,Math.min(1-s.rh,s.ry))}
 function onMove(e){if(!mode||!cropStateData)return;const b=stage.getBoundingClientRect(),dx=(e.clientX-startX)/b.width,dy=(e.clientY-startY)/b.height,s=cropStateData;if(mode==="move"){s.rx=start.rx+dx;s.ry=start.ry+dy}else{if(mode.includes("w")){s.rx=start.rx+dx;s.rw=start.rw-dx}if(mode.includes("e")){s.rw=start.rw+dx}if(mode.includes("n")){s.ry=start.ry+dy;s.rh=start.rh-dy}if(mode.includes("s")){s.rh=start.rh+dy}}clamp();applyRect()}
 function onUp(){mode=null;window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp)}
 function onDown(e,m){if(!cropStateData)return;mode=m;startX=e.clientX;startY=e.clientY;start={...cropStateData};e.preventDefault();e.stopPropagation();window.addEventListener("pointermove",onMove);window.addEventListener("pointerup",onUp)}
 cropRect.addEventListener("pointerdown",e=>{if(e.target.classList.contains("crop-handle"))return;onDown(e,"move")});
 cropRect.querySelectorAll(".crop-handle").forEach(h=>h.addEventListener("pointerdown",e=>onDown(e,h.dataset.h)));
 cropDialog.oncancel=e=>{e.preventDefault();cropSkipBtn.click()};
 window.__applyCropRect=applyRect;
}
function openCropTool(blob,label){
 return new Promise(resolve=>{
  const imgUrl=URL.createObjectURL(blob);cropTitle.textContent=label||"Demarcar a obra";
  cropImg.onload=()=>{
   cropDialog.showModal();
   requestAnimationFrame(()=>{const r=cropImg.getBoundingClientRect();cropStage.style.width=r.width+"px";cropStage.style.height=r.height+"px";cropStateData={rx:.08,ry:.08,rw:.84,rh:.84};window.__applyCropRect()});
  };
  cropImg.src=imgUrl;
  function finish(resultBlob){URL.revokeObjectURL(imgUrl);cropStateData=null;if(cropDialog.open)cropDialog.close();cropConfirmBtn.onclick=null;cropSkipBtn.onclick=null;resolve(resultBlob)}
  cropSkipBtn.onclick=()=>finish(blob);
  cropConfirmBtn.onclick=()=>{
   const iw=cropImg.naturalWidth,ih=cropImg.naturalHeight,s=cropStateData,sx=s.rx*iw,sy=s.ry*ih,sw=s.rw*iw,sh=s.rh*ih;
   const c=document.createElement("canvas");c.width=Math.max(1,Math.round(sw));c.height=Math.max(1,Math.round(sh));
   c.getContext("2d").drawImage(cropImg,sx,sy,sw,sh,0,0,c.width,c.height);
   c.toBlob(b=>finish(b||blob),"image/jpeg",.88)
  }
 })
}
async function cropQueue(blobs,labelPrefix){const out=[];for(let i=0;i<blobs.length;i++)out.push(await openCropTool(blobs[i],blobs.length>1?`${labelPrefix} — foto ${i+1} de ${blobs.length}`:labelPrefix));return out}

/* ---- Entradas de arquivos ---- */
function updateConferenceReadyState(){runConferenceBtn.disabled=!(conferenceFiles.length&&conferenciaAtivaFilial&&conferenciaAtivaLocal)}
function setupInputs(){
 referenceInput.onchange=async()=>{const raw=[];for(const f of [...referenceInput.files].slice(0,8))if(f.type.startsWith("image/"))raw.push(await compress(f));referenceFiles=raw.length?await cropQueue(raw,"Foto de referência"):[];preview(referenceFiles,"referencePreview")};
 conferenceInput.onchange=async()=>{const raw=[];for(const f of [...conferenceInput.files].slice(0,7))if(f.type.startsWith("image/"))raw.push(await compress(f));conferenceFiles=raw.length?await cropQueue(raw,"Foto da conferência"):[];preview(conferenceFiles,"conferencePreview");updateConferenceReadyState();clearConferenceBtn.classList.toggle("hidden",!conferenceFiles.length)};
 clearConferenceBtn.onclick=clearConference;runConferenceBtn.onclick=runConference;
}
function clearConference(){conferenceFiles=[];conferenceInput.value="";conferencePreview.innerHTML="";updateConferenceReadyState();clearConferenceBtn.classList.add("hidden")}

/* ---- Conferência ativa: filial/local ficam valendo até "Encerrar conferência" ---- */
async function loadConferenciaAtiva(){const r=await requestP(store("config").get("conferenciaAtiva"));conferenciaAtivaFilial=r?.filial||null;conferenciaAtivaLocal=r?.localizacao||null}
async function setConferenciaAtiva(filial,localizacao){conferenciaAtivaFilial=filial;conferenciaAtivaLocal=localizacao;await requestP(store("config","readwrite").put({chave:"conferenciaAtiva",filial,localizacao}));await requestP(store("config","readwrite").put({chave:"ultimoContextoConferencia",filial,localizacao}))}
async function encerrarConferenciaAtiva(){conferenciaAtivaFilial=null;conferenciaAtivaLocal=null;await requestP(store("config","readwrite").delete("conferenciaAtiva"));clearConference();renderConferenceBanner()}
async function openConferenceContextDialog(){
 const last=await requestP(store("config").get("ultimoContextoConferencia"));
 await populateFilialSelect(ctxFilialSelect,conferenciaAtivaFilial||last?.filial||"");
 await populateLocalSelect(ctxLocalSelect,ctxFilialSelect.value,conferenciaAtivaLocal||last?.localizacao||"");
 ctxFilialSelect.onchange=()=>populateLocalSelect(ctxLocalSelect,ctxFilialSelect.value,"");
 conferenceContextDialog.showModal();
}
async function renderConferenceBanner(){
 const banner=document.getElementById("conferenceContextBanner"),photosCard=document.getElementById("conferencePhotosCard");
 if(conferenciaAtivaFilial&&conferenciaAtivaLocal){
  const filiais=await getFiliais();
  banner.innerHTML=`<div class="ctx-active"><div><span class="pill">Conferindo</span><b>${esc(nomeFilial(filiais,conferenciaAtivaFilial))} · ${esc(conferenciaAtivaLocal)}</b></div><button type="button" id="endConferenceBtn" class="danger">Encerrar conferência</button></div>`;
  document.getElementById("endConferenceBtn").onclick=()=>{if(confirm("Encerrar a conferência ativa neste local?"))encerrarConferenciaAtiva()};
  photosCard.classList.remove("hidden");
 }else{
  banner.innerHTML=`<div class="ctx-empty"><p class="muted">Nenhuma conferência ativa.</p><button type="button" id="startConferenceBtn" class="primary full">Indicar conferência</button></div>`;
  document.getElementById("startConferenceBtn").onclick=openConferenceContextDialog;
  photosCard.classList.add("hidden");
 }
 updateConferenceReadyState();
}
function setupConferenceContext(){
 ctxConfirmBtn.onclick=async()=>{
  if(!ctxFilialSelect.value||!ctxLocalSelect.value)return toast("Selecione a filial e o local.");
  await setConferenciaAtiva(ctxFilialSelect.value,ctxLocalSelect.value);
  conferenceContextDialog.close();await renderConferenceBanner();
 };
}

/* ---- Documentos anexados à obra ---- */
function renderDocumentosList(){
 documentosList.innerHTML=editedDocumentos.length?"":`<p class="muted">Nenhum documento anexado.</p>`;
 editedDocumentos.forEach((d,i)=>{
  const row=document.createElement("div");row.className="doc-row";
  const link=document.createElement("a");link.href=url(d.blob);link.target="_blank";link.rel="noopener";link.textContent=d.nome;
  const badge=document.createElement("span");badge.className="doc-badge "+(d.tipo==="doacao"?"doc-doacao":"doc-compra");badge.textContent=d.tipo==="doacao"?"Doação":"Compra";
  const rm=document.createElement("button");rm.type="button";rm.textContent="✕";rm.title="Remover";rm.onclick=()=>{editedDocumentos.splice(i,1);renderDocumentosList()};
  row.append(link,badge,rm);documentosList.append(row);
 });
}
function setupDocumentos(){
 addDocumentoBtn.onclick=()=>{
  const f=documentoInput.files[0];if(!f)return toast("Escolha um arquivo primeiro.");
  editedDocumentos.push({tipo:documentoTipoSelect.value,nome:f.name,blob:f,adicionadoEm:new Date().toISOString()});
  documentoInput.value="";renderDocumentosList();toast("Documento adicionado — salve para confirmar.");
 };
}

async function renderArtworks(){
 let a=(await all("obras")).sort((x,y)=>y.id-x.id),q=searchInput.value.toLowerCase().trim();
 statArtworks.textContent=a.length;statRefs.textContent=a.reduce((s,o)=>s+(o.fotos?.length||0),0);
 if(q)a=a.filter(o=>[o.nome,o.patrimonio,o.artista,o.estilo,o.localizacao].join(" ").toLowerCase().includes(q));
 artworkList.innerHTML="";emptyArtworks.classList.toggle("hidden",a.length>0);
 const filiais=await getFiliais(),criterios=await getCriteriosStatus();
 a.forEach(o=>{
   const c=document.createElement("div");c.className="art-card";const im=new Image;if(o.fotos?.[0])im.src=url(o.fotos[0]);
   const m=document.createElement("div");m.className="art-main";
   const ef=efetivoLocal(o),tempTag=ef.temporaria?` <span class="temp-tag">temporário até ${new Date(ef.ate).toLocaleDateString("pt-BR")}</span>`:"";
   const nivel=calcularStatusSeguranca(o.valorUltimaAvaliacao,criterios);
   m.innerHTML=`<b>${esc(o.nome||"Sem título")}</b>${statusBadgeHtml(nivel)}<div class=meta>${esc(o.patrimonio||"Sem patrimônio")} · ${esc(o.artista||"-")}${o.estilo?" · "+esc(o.estilo):""}</div><div class=meta>${esc(nomeFilial(filiais,ef.filial))} · ${esc(ef.localizacao||"-")}${tempTag} · ${o.fotos?.length||0} foto(s)</div>`;
   const ac=document.createElement("div");ac.className="art-actions";const e=document.createElement("button");e.className="edit-art";e.textContent="Editar";e.onclick=()=>openEditArtwork(o.id);ac.append(e);c.append(im,m,ac);artworkList.append(c);
 });
}
async function openEditArtwork(id){
 const o=await requestP(store("obras").get(id));if(!o)return;
 resetArtworkForm();editingArtworkId=id;editId.value=id;artworkDialogTitle.textContent="Editar obra";deleteArtworkBtn.classList.remove("hidden");
 artworkForm.elements.patrimonio.value=o.patrimonio||"";artworkForm.elements.nome.value=o.nome||"";artworkForm.elements.artista.value=o.artista||"";
 await populateEstiloSelect(o.estilo||o.tecnica||"");
 await populateFilialSelect(artworkForm.elements.filial,o.filial||"");
 await populateLocalSelect(artworkForm.elements.localizacao,artworkForm.elements.filial.value,o.localizacao||"");
 artworkForm.elements.descricao.value=o.descricao||"";
 artworkForm.elements.valorContabil.value=o.valorContabil??"";
 artworkForm.elements.valorUltimaAvaliacao.value=o.valorUltimaAvaliacao??"";
 artworkForm.elements.registrado.value=o.registrado||"";
 await updateStatusBadgePreview();
 existingPhotos.innerHTML="";removedPhotoIndexes=new Set();editedFotos=[...(o.fotos||[])];editedDescs=[...(o.descriptors||[])];editedDocumentos=[...(o.documentos||[])];renderDocumentosList();
 if(o.fotos?.length){existingPhotosWrap.classList.remove("hidden");o.fotos.forEach((f,i)=>{const d=document.createElement("div");d.className="preview";const im=new Image;im.src=url(f);const b=document.createElement("button");b.type="button";b.className="remove-photo";b.textContent="×";b.onclick=()=>{removedPhotoIndexes.add(i);d.remove();if(existingPhotos.children.length===0)existingPhotosWrap.classList.add("hidden")};const rc=document.createElement("button");rc.type="button";rc.className="recrop-photo";rc.title="Recortar";rc.textContent="✂️";rc.onclick=async()=>{const newBlob=await openCropTool(editedFotos[i],"Recortar foto cadastrada");editedFotos[i]=newBlob;editedDescs[i]=await extractSet(newBlob);im.src=url(newBlob);toast("Foto recortada — salve para confirmar.")};d.append(im,b,rc);existingPhotos.append(d)})}
 artworkDialog.showModal();
}
async function deleteArtwork(id){
 if(!confirm("Excluir esta obra do acervo? As conferências antigas serão mantidas como histórico, mas o cadastro será removido."))return;
 await requestP(store("obras","readwrite").delete(id));artworkDialog.close();resetArtworkForm();await renderArtworks();toast("Obra excluída.");
}
artworkForm.onsubmit=async e=>{
 e.preventDefault();const f=new FormData(e.target),p=(f.get("patrimonio")||"").trim(),n=(f.get("nome")||"").trim();
 if(!n)return toast("Nome da obra é obrigatório.");
 const allWorks=await all("obras");if(p&&allWorks.some(o=>o.id!==editingArtworkId&&String(o.patrimonio||"").toLowerCase()===p.toLowerCase()))return toast("Patrimônio já cadastrado.");
 let old={fotos:[],descriptors:[],documentos:[]};if(editingArtworkId)old=await requestP(store("obras").get(editingArtworkId))||old;
 const baseFotos=editingArtworkId?editedFotos:[],baseDescs=editingArtworkId?editedDescs:[];
 const keptFotos=baseFotos.filter((_,i)=>!removedPhotoIndexes.has(i)),keptDesc=baseDescs.filter((_,i)=>!removedPhotoIndexes.has(i));
 const newDesc=[];if(referenceFiles.length)toast("Analisando novas referências…");for(const x of referenceFiles)newDesc.push(await extractSet(x));
 const wasEditing=!!editingArtworkId;
 const obj={...(editingArtworkId?old:{}),patrimonio:p,nome:n,artista:(f.get("artista")||"").trim(),estilo:(f.get("estilo")||"").trim(),filial:(f.get("filial")||"").trim(),localizacao:(f.get("localizacao")||"").trim(),descricao:(f.get("descricao")||"").trim(),valorContabil:f.get("valorContabil")!==""?Number(f.get("valorContabil")):null,valorUltimaAvaliacao:f.get("valorUltimaAvaliacao")!==""?Number(f.get("valorUltimaAvaliacao")):null,registrado:(f.get("registrado")||"").trim(),fotos:[...keptFotos,...referenceFiles],descriptors:[...keptDesc,...newDesc],documentos:editedDocumentos,atualizadoEm:new Date().toISOString()};
 if(editingArtworkId){obj.id=editingArtworkId;await requestP(store("obras","readwrite").put(obj))}else{obj.criadoEm=new Date().toISOString();await requestP(store("obras","readwrite").add(obj))}
 artworkDialog.close();resetArtworkForm();await renderArtworks();toast(wasEditing?"Obra atualizada.":"Obra salva.");
};

async function ensureDescriptors(ws){for(const o of ws)if(!Array.isArray(o.descriptors)||o.descriptors.length!==(o.fotos?.length||0)||o.descriptors.some(x=>!x?.full)){o.descriptors=[];for(const f of o.fotos||[])o.descriptors.push(await extractSet(f));await requestP(store("obras","readwrite").put(o))}}
function prog(d,t,txt){progressWrap.classList.remove("hidden");progressBar.style.width=`${Math.round(d/Math.max(1,t)*100)}%`;progressText.textContent=txt}

/* ---- Localização efetiva (considera desvio temporário de 30 dias) ---- */
function efetivoLocal(o){
 const t=o.localizacaoTemporaria;
 if(t&&t.ate&&new Date(t.ate).getTime()>=Date.now())return{filial:t.filial,localizacao:t.localizacao,temporaria:true,ate:t.ate};
 return{filial:o.filial||"",localizacao:o.localizacao||"",temporaria:false};
}

async function runConference(){
 if(!conferenciaAtivaFilial||!conferenciaAtivaLocal)return toast("Indique a filial e o local antes de conferir.");
 const ws=await all("obras"),refs=ws.filter(o=>(o.fotos?.length||0)>0);if(!refs.length)return toast("Cadastre ao menos uma obra com foto.");
 const filialConferida=conferenciaAtivaFilial,localConferido=conferenciaAtivaLocal;
 runConferenceBtn.disabled=true;runConferenceBtn.textContent="Analisando…";await ensureDescriptors(refs);
 const refsMap=new Map(refs.map(o=>[o.id,o]));
 const items=[];
 for(let i=0;i<conferenceFiles.length;i++){
  prog(i,conferenceFiles.length,`Analisando imagem ${i+1} de ${conferenceFiles.length}…`);
  const q=await extractSet(conferenceFiles[i]),cs=[];
  for(const o of refs){let best=0;for(const r of o.descriptors||[])best=Math.max(best,setSim(q,r));cs.push({obraId:o.id,nome:o.nome,patrimonio:o.patrimonio,score:best,refFoto:(o.fotos&&o.fotos[0])?o.fotos[0]:null})}
  cs.sort((a,b)=>b.score-a.score);
  const top=cs[0],second=cs[1],margin=second?top.score-second.score:top.score,ok=top&&top.score>=AUTO_THRESHOLD&&(cs.length===1||margin>=MIN_MARGIN);
  let divergente=false;
  if(ok){const refObra=refsMap.get(top.obraId);if(refObra){const ef=efetivoLocal(refObra);divergente=(ef.filial!==filialConferida)||(ef.localizacao!==localConferido)}}
  items.push({ordem:i+1,foto:conferenceFiles[i],status:ok?"localizado":"pendente",obraId:ok?top.obraId:null,score:top?.score??null,candidatos:cs.slice(0,4),localizacaoDivergente:divergente,divergenciaResolvida:!divergente,observacao:ok?`Correspondência automática com ${top.nome}.`:(top?.score>=REVIEW_THRESHOLD?`Possível correspondência com ${top.nome}.`:"Nenhuma correspondência segura.")});
  await new Promise(r=>setTimeout(r,0));
 }
 prog(conferenceFiles.length,conferenceFiles.length,"Concluído.");
 const id=await requestP(store("conferencias","readwrite").add({criadoEm:new Date().toISOString(),filialConferida,localConferido,items}));
 clearConference();runConferenceBtn.textContent="Iniciar conferência";progressWrap.classList.add("hidden");renderHistory();openResult(id);
}

async function renderHistory(){const filiais=await getFiliais();const cs=(await all("conferencias")).sort((a,b)=>b.id-a.id);historyList.innerHTML="";emptyHistory.classList.toggle("hidden",cs.length>0);cs.forEach(c=>{const l=c.items.filter(i=>i.status==="localizado").length,p=c.items.length-l,card=document.createElement("div");card.className="history-card";const ctxTxt=c.filialConferida?` · ${esc(nomeFilial(filiais,c.filialConferida))} · ${esc(c.localConferido||"")}`:"";card.innerHTML=`<div class=history-main><div class=history-top><b>Conferência #${c.id}</b><span class="status ${p?"pending":"ok"}">${p} pendente(s)</span></div><div class=meta>${new Date(c.criadoEm).toLocaleString("pt-BR")} · ${l} localizada(s)${ctxTxt}</div></div><div class=mini-actions><button class=mini-delete data-del="${c.id}">Excluir</button></div>`;card.querySelector(".history-main").onclick=()=>openResult(c.id);card.querySelector("[data-del]").onclick=e=>{e.stopPropagation();deleteConference(c.id)};historyList.append(card)})}
async function deleteConference(id){if(!confirm("Excluir esta conferência?"))return;await requestP(store("conferencias","readwrite").delete(id));if(resultDialog.open)resultDialog.close();renderHistory();toast("Conferência excluída.")}
async function resetAll(){if(!confirm("Excluir TODAS as conferências? O acervo cadastrado será mantido."))return;await requestP(store("conferencias","readwrite").clear());renderHistory();toast("Conferências zeradas.")}
async function confirmCandidate(cid,idx,oid){
 const c=await requestP(store("conferencias").get(cid)),it=c.items[idx];
 it.status="localizado";it.obraId=oid;it.observacao="Confirmado manualmente.";
 let divergente=false;
 if(c.filialConferida){const refObra=await requestP(store("obras").get(oid));if(refObra){const ef=efetivoLocal(refObra);divergente=(ef.filial!==c.filialConferida)||(ef.localizacao!==c.localConferido)}}
 it.localizacaoDivergente=divergente;it.divergenciaResolvida=!divergente;
 await requestP(store("conferencias","readwrite").put(c));renderHistory();openResult(cid);
}
async function resolveDivergencia(cid,idx,acao){
 const c=await requestP(store("conferencias").get(cid)),it=c.items[idx];
 if(it.obraId&&(acao==="mudar"||acao==="30dias")){
  const o=await requestP(store("obras").get(it.obraId));
  if(o){
   if(acao==="mudar"){o.filial=c.filialConferida;o.localizacao=c.localConferido;o.localizacaoTemporaria=null}
   else{o.localizacaoTemporaria={filial:c.filialConferida,localizacao:c.localConferido,ate:new Date(Date.now()+30*86400000).toISOString()}}
   o.atualizadoEm=new Date().toISOString();await requestP(store("obras","readwrite").put(o));
  }
 }
 it.divergenciaResolvida=true;await requestP(store("conferencias","readwrite").put(c));
 toast(acao==="mudar"?"Localização atualizada.":acao==="30dias"?"Localização temporária definida (30 dias).":"Cadastro mantido.");
 await renderArtworks();openResult(cid);
}

let resultUrls=[];
function trackedUrl(b){if(!b)return"";const u=URL.createObjectURL(b);resultUrls.push(u);return u}
async function openResult(id){
 currentConferenceId=id;resultUrls.forEach(u=>URL.revokeObjectURL(u));resultUrls=[];
 const c=await requestP(store("conferencias").get(id)),ws=await all("obras"),mp=new Map(ws.map(o=>[o.id,o])),filiais=await getFiliais(),l=c.items.filter(i=>i.status==="localizado").length;
 resultTitle.textContent=`Conferência #${id}`;
 resultSummary.innerHTML=`<div class=stat><b>${l}</b><span>localizadas</span></div><div class=stat><b>${c.items.length-l}</b><span>pendentes</span></div>`;
 resultItems.innerHTML="";
 c.items.forEach((it,idx)=>{
  const d=document.createElement("div");d.className="result-item";const im=new Image;im.src=trackedUrl(it.foto);
  const t=document.createElement("div"),o=it.obraId?mp.get(it.obraId):null;
  let h=`<span class="status ${it.status==="localizado"?"ok":"pending"}">${it.status==="localizado"?"LOCALIZADA":"PENDENTE"}</span>`+ (o?`<h4>${esc(o.nome)}</h4><p><b>Patrimônio:</b> ${esc(o.patrimonio)}</p><p>${esc(o.artista||"-")}${o.estilo?" · "+esc(o.estilo):""} · ${esc(o.localizacao||"-")}</p>`:`<h4>Imagem ${it.ordem||idx+1}</h4>`);
  if(it.score!=null)h+=`<p><b>Similaridade:</b> ${(it.score*100).toFixed(1)}%</p>`;
  if(it.status==="localizado"&&it.localizacaoDivergente&&!it.divergenciaResolvida&&o){
   h+=`<div class="diverg-box"><p>⚠️ <b>Local diferente do cadastro.</b> Cadastrado em: <b>${esc(nomeFilial(filiais,o.filial))} · ${esc(o.localizacao||"-")}</b>. Nesta conferência: <b>${esc(nomeFilial(filiais,c.filialConferida))} · ${esc(c.localConferido||"-")}</b>.</p><div class="diverg-actions"><button class="secondary" data-div="mudar|${id}|${idx}">Atualizar cadastro</button><button class="secondary" data-div="30dias|${id}|${idx}">Por 30 dias</button><button class="secondary" data-div="ignorar|${id}|${idx}">Manter</button></div></div>`;
  }
  if(it.status!=="localizado"&&it.candidatos?.length)h+=`<div class=candidate-box><b>Melhores candidatos</b> <small class="muted">(toque na foto para comparar)</small>`+it.candidatos.map((x,j)=>`<div class="candidate candidate-rich">${x.refFoto?`<img class="candidate-thumb" data-cmp="${idx}|${j}" src="${trackedUrl(x.refFoto)}" alt="Referência">`:""}<span>${j+1}. ${esc(x.nome)} · ${esc(x.patrimonio)}<br><small>Score: ${(x.score*100).toFixed(1)}%</small></span><button class=confirm data-c="${id}|${idx}|${x.obraId}">Confirmar</button></div>`).join("")+`</div>`;
  t.innerHTML=h;d.append(im,t);resultItems.append(d);
 });
 resultItems.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{const [c,i,o]=b.dataset.c.split("|").map(Number);confirmCandidate(c,i,o)});
 resultItems.querySelectorAll("[data-cmp]").forEach(im=>im.onclick=()=>{const [itIdx,candIdx]=im.dataset.cmp.split("|").map(Number),it=c.items[itIdx],x=it.candidatos[candIdx];compareQueryImg.src=trackedUrl(it.foto);compareRefImg.src=trackedUrl(x.refFoto);compareTitle.textContent=`Foto tirada × ${x.nome}`;compareDialog.showModal()});
 resultItems.querySelectorAll("[data-div]").forEach(b=>b.onclick=()=>{const [acao,cid,idx]=b.dataset.div.split("|");resolveDivergencia(Number(cid),Number(idx),acao)});
 exportCurrentCsvBtn.onclick=()=>exportCsv(id);deleteCurrentBtn.onclick=()=>deleteConference(id);
 if(!resultDialog.open)resultDialog.showModal();
}

/* CSV: 1 linha por obra no período. As "fotos na mesma linha" são listadas como nomes Foto 1, Foto 2... + quantidade.
   CSV não incorpora binários de imagem. O backup JSON mantém as imagens. */
function csvCell(v){const s=String(v??"").replaceAll('"','""');return `"${s}"`}
async function exportCsv(confId=null){
 const filiais=await getFiliais(),criterios=await getCriteriosStatus();
 const works=(await all("obras")).sort((a,b)=>String(a.patrimonio).localeCompare(String(b.patrimonio))),confs=(await all("conferencias")).sort((a,b)=>b.id-a.id),c=confId?confs.find(x=>x.id===confId):confs[0];
 if(!c)return toast("Nenhuma conferência para exportar.");
 const foundBy=new Map();c.items.forEach((it,idx)=>{if(it.obraId){const prev=foundBy.get(it.obraId);if(!prev||((it.score||0)>(prev.score||0)))foundBy.set(it.obraId,{...it,leitura:idx+1})}});
 const header=["Conferencia","Data da conferencia","Filial conferida","Local conferido","Patrimonio","Nome da obra","Artista","Estilo","Filial","Localizacao","Descricao","Valor Contabil","Valor Ultima Avaliacao","Registrado","Status de Seguranca","Qtd fotos referencia","Fotos referencia","Encontrada no periodo","Leitura","Similaridade"];
 const rows=[header.map(csvCell).join(";")];
 for(const o of works){const f=foundBy.get(o.id),fotoTxt=(o.fotos||[]).map((_,i)=>`Foto ${i+1}`).join(" | "),nivel=calcularStatusSeguranca(o.valorUltimaAvaliacao,criterios);rows.push([c.id,new Date(c.criadoEm).toLocaleString("pt-BR"),nomeFilial(filiais,c.filialConferida),c.localConferido||"",o.patrimonio,o.nome,o.artista||"",o.estilo||"",nomeFilial(filiais,o.filial),o.localizacao||"",o.descricao||"",o.valorContabil??"",o.valorUltimaAvaliacao??"",o.registrado||"",nivel?`Nível ${nivel}`:"",o.fotos?.length||0,fotoTxt,f?"SIM":"NÃO",f?.leitura||"",f?.score!=null?(f.score*100).toFixed(1)+"%":""].map(csvCell).join(";"))}
 const blob=new Blob(["\ufeff"+rows.join("\r\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`acervo-conferencia-${c.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("CSV exportado.");
}

async function imgToEmbed(blob,maxSize=400,quality=.85){
 const bmp=await createImageBitmap(blob);
 const k=Math.min(1,maxSize/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*k)),h=Math.max(1,Math.round(bmp.height*k));
 const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(bmp,0,0,w,h);bmp.close?.();
 const outBlob=await new Promise(r=>c.toBlob(x=>r(x),"image/jpeg",quality));
 return {buffer:await outBlob.arrayBuffer(),width:w,height:h};
}
function fitBox(w,h,max){const k=Math.min(1,max/Math.max(w,h));return {width:Math.max(1,Math.round(w*k)),height:Math.max(1,Math.round(h*k))}}
async function exportAcervoXlsx(){
 if(!isDesktopLike())return toast("Essa exportação só está disponível pelo computador.");
 if(typeof ExcelJS==="undefined")return toast("Não foi possível carregar o gerador de Excel.");
 const filiais=await getFiliais(),criterios=await getCriteriosStatus();
 const works=(await all("obras")).sort((a,b)=>String(a.patrimonio).localeCompare(String(b.patrimonio)));
 if(!works.length)return toast("Nenhuma obra cadastrada ainda.");
 exportXlsxBtn.disabled=true;const originalTxt=exportXlsxBtn.textContent;
 try{
  const wb=new ExcelJS.Workbook();wb.creator="Acervo Mobile";wb.created=new Date();
  const ws=wb.addWorksheet("Acervo",{views:[{state:"frozen",ySplit:1}]});
  ws.columns=[
   {header:"Patrimônio",key:"patrimonio",width:16},
   {header:"Nome",key:"nome",width:28},
   {header:"Artista",key:"artista",width:20},
   {header:"Estilo",key:"estilo",width:14},
   {header:"Filial",key:"filial",width:16},
   {header:"Localização",key:"localizacao",width:20},
   {header:"Descrição",key:"descricao",width:32},
   {header:"Valor Contábil",key:"valorContabil",width:18,style:{numFmt:'"R$" #,##0.00'}},
   {header:"Valor da Última Avaliação",key:"valorUltimaAvaliacao",width:22,style:{numFmt:'"R$" #,##0.00'}},
   {header:"Registrado",key:"registrado",width:16},
   {header:"Status de Segurança",key:"statusSeguranca",width:18},
   {header:"Foto 1",key:"foto1",width:24},
   {header:"Foto 2",key:"foto2",width:24},
  ];
  ws.getRow(1).font={bold:true};
  const ROWPX=170,EMBEDSIZE=400,DISPLAYSIZE=155;
  for(let i=0;i<works.length;i++){
   const o=works[i],rowNumber=i+2,nivel=calcularStatusSeguranca(o.valorUltimaAvaliacao,criterios);
   exportXlsxBtn.textContent=`Gerando… ${i+1}/${works.length}`;
   ws.addRow({patrimonio:o.patrimonio||"",nome:o.nome||"",artista:o.artista||"",estilo:o.estilo||"",filial:nomeFilial(filiais,o.filial),localizacao:o.localizacao||"",descricao:o.descricao||"",valorContabil:o.valorContabil??null,valorUltimaAvaliacao:o.valorUltimaAvaliacao??null,registrado:o.registrado||"",statusSeguranca:nivel?`Nível ${nivel}`:""});
   ws.getRow(rowNumber).height=ROWPX*.75;
   for(let f=0;f<2;f++){
    const foto=o.fotos?.[f];if(!foto)continue;
    try{
     const {buffer,width,height}=await imgToEmbed(foto,EMBEDSIZE,.85);
     const imgId=wb.addImage({buffer,extension:"jpeg"});
     ws.addImage(imgId,{tl:{col:11+f,row:rowNumber-1},ext:fitBox(width,height,DISPLAYSIZE)});
    }catch{}
   }
  }
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`acervo-completo-${new Date().toISOString().slice(0,10)}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast("Excel do acervo exportado.");
 }catch(e){console.error(e);toast("Não foi possível gerar o Excel.")}
 finally{exportXlsxBtn.disabled=false;exportXlsxBtn.textContent=originalTxt}
}

/* ---- Base informativa: exportação/edição em massa sem fotos ---- */
const BASE_HEADERS=["Patrimonio","Nome","Artista","Estilo","Filial","Localizacao","Descricao","ValorContabil","ValorUltimaAvaliacao","Registrado"];
async function exportBaseInformativa(){
 if(typeof ExcelJS==="undefined")return toast("Não foi possível carregar o gerador de Excel.");
 const works=(await all("obras")).sort((a,b)=>String(a.patrimonio).localeCompare(String(b.patrimonio)));
 if(!works.length)return toast("Nenhuma obra cadastrada ainda.");
 const criterios=await getCriteriosStatus();
 const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet("Base");
 ws.columns=[...BASE_HEADERS.map(h=>({header:h,key:h,width:h==="Descricao"?36:h==="Nome"?28:h.startsWith("Valor")?20:18})),{header:"StatusSeguranca (calculado, não editável)",key:"StatusSeguranca",width:30}];
 ws.getRow(1).font={bold:true};
 for(const o of works){const nivel=calcularStatusSeguranca(o.valorUltimaAvaliacao,criterios);ws.addRow({Patrimonio:o.patrimonio||"",Nome:o.nome||"",Artista:o.artista||"",Estilo:o.estilo||"",Filial:o.filial||"",Localizacao:o.localizacao||"",Descricao:o.descricao||"",ValorContabil:o.valorContabil??"",ValorUltimaAvaliacao:o.valorUltimaAvaliacao??"",Registrado:o.registrado||"",StatusSeguranca:nivel?`Nível ${nivel}`:""})}
 const buf=await wb.xlsx.writeBuffer();
 const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),a=document.createElement("a");
 a.href=URL.createObjectURL(blob);a.download=`acervo-base-informativa-${new Date().toISOString().slice(0,10)}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast("Base informativa exportada.");
}
async function importBaseInformativa(file){
 if(typeof ExcelJS==="undefined"){importBaseStatus.textContent="Não foi possível carregar o leitor de Excel.";return}
 importBaseStatus.textContent="Lendo planilha…";
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const ws=wb.worksheets[0];if(!ws){importBaseStatus.textContent="Planilha vazia ou inválida.";return}
 const headerRow=ws.getRow(1).values;const colIdx={};
 headerRow.forEach((v,i)=>{if(v)colIdx[String(v).trim().toLowerCase()]=i});
 const idxPat=colIdx["patrimonio"];
 if(!idxPat){importBaseStatus.textContent='Coluna "Patrimonio" não encontrada na planilha.';return}
 const obras=await all("obras"),byPat=new Map(obras.map(o=>[String(o.patrimonio||"").trim().toLowerCase(),o]));
 const filiais=await getFiliais(),estilos=await getEstilos();let filiaisMudou=false,estilosMudou=false;
 let atualizados=0,naoEncontrados=0;
 for(let r=2;r<=ws.rowCount;r++){
  const row=ws.getRow(r).values;const pat=row[idxPat]?String(row[idxPat]).trim():"";if(!pat)continue;
  const o=byPat.get(pat.toLowerCase());if(!o){naoEncontrados++;continue}
  const get=k=>colIdx[k]?(row[colIdx[k]]!=null?String(row[colIdx[k]]).trim():""):undefined;
  const nome=get("nome"),artista=get("artista"),estilo=get("estilo"),filial=get("filial"),localizacao=get("localizacao"),descricao=get("descricao"),valorContabil=get("valorcontabil"),valorUltimaAvaliacao=get("valorultimaavaliacao"),registrado=get("registrado");
  if(nome!==undefined)o.nome=nome||o.nome;
  if(artista!==undefined)o.artista=artista;
  if(estilo!==undefined){o.estilo=estilo;if(estilo&&!estilos.includes(estilo)){estilos.push(estilo);estilosMudou=true}}
  if(filial!==undefined&&filial)o.filial=filial;
  if(localizacao!==undefined)o.localizacao=localizacao;
  if(descricao!==undefined)o.descricao=descricao;
  if(valorContabil!==undefined)o.valorContabil=valorContabil===""?null:Number(valorContabil.replace(",","."))||null;
  if(valorUltimaAvaliacao!==undefined)o.valorUltimaAvaliacao=valorUltimaAvaliacao===""?null:Number(valorUltimaAvaliacao.replace(",","."))||null;
  if(registrado!==undefined)o.registrado=registrado;
  if(o.filial&&localizacao){const fl=filiais.find(x=>x.codigo===o.filial);if(fl&&localizacao&&!fl.locais.includes(localizacao)){fl.locais.push(localizacao);filiaisMudou=true}}
  o.atualizadoEm=new Date().toISOString();
  await requestP(store("obras","readwrite").put(o));atualizados++;
 }
 if(estilosMudou)await saveEstilos(estilos);
 if(filiaisMudou)await saveFiliais(filiais);
 await renderArtworks();
 importBaseStatus.innerHTML=`Concluído: <strong>${atualizados}</strong> obra(s) atualizada(s)${naoEncontrados?`, ${naoEncontrados} patrimônio(s) não encontrado(s)`:""}.`;
 toast("Base informativa importada.");
}
function setupBaseInformativa(){
 exportBaseBtn.onclick=exportBaseInformativa;
 importBaseBtn.onclick=()=>importBaseFile.click();
 importBaseFile.onchange=async()=>{const f=importBaseFile.files[0];if(!f)return;try{await importBaseInformativa(f)}catch(e){console.error(e);importBaseStatus.textContent="Falha ao importar: "+(e.message||"arquivo incompatível")}finally{importBaseFile.value=""}};
}

async function exportRelatorioSeguranca(){
 if(typeof ExcelJS==="undefined")return toast("Não foi possível carregar o gerador de Excel.");
 const works=await all("obras");
 if(!works.length)return toast("Nenhuma obra cadastrada ainda.");
 const filiais=await getFiliais(),criterios=await getCriteriosStatus();
 const rows=works.map(o=>({o,nivel:calcularStatusSeguranca(o.valorUltimaAvaliacao,criterios)}));
 rows.sort((a,b)=>(b.nivel||0)-(a.nivel||0)||String(a.o.nome||"").localeCompare(String(b.o.nome||""),"pt-BR"));
 const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet("Valores e Segurança",{views:[{state:"frozen",ySplit:1}]});
 ws.columns=[
  {header:"Patrimônio",key:"patrimonio",width:16},
  {header:"Nome",key:"nome",width:28},
  {header:"Filial",key:"filial",width:16},
  {header:"Localização",key:"localizacao",width:20},
  {header:"Valor Contábil",key:"valorContabil",width:18,style:{numFmt:'"R$" #,##0.00'}},
  {header:"Valor da Última Avaliação",key:"valorUltimaAvaliacao",width:22,style:{numFmt:'"R$" #,##0.00'}},
  {header:"Registrado",key:"registrado",width:16},
  {header:"Nível de Status",key:"nivelTexto",width:20},
 ];
 ws.getRow(1).font={bold:true};
 for(const {o,nivel} of rows)ws.addRow({patrimonio:o.patrimonio||"",nome:o.nome||"",filial:nomeFilial(filiais,o.filial),localizacao:o.localizacao||"",valorContabil:o.valorContabil??null,valorUltimaAvaliacao:o.valorUltimaAvaliacao??null,registrado:o.registrado||"",nivelTexto:nivel?`Nível ${nivel}`:"—"});
 const buf=await wb.xlsx.writeBuffer();
 const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),a=document.createElement("a");
 a.href=URL.createObjectURL(blob);a.download=`acervo-valores-seguranca-${new Date().toISOString().slice(0,10)}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast("Relatório exportado.");
}

/* ---- Importação de acervo preparada a partir do Excel (formato próprio, com fotos) ---- */
function dataUrlBlob(u){const [h,d]=u.split(","),mime=(h.match(/:(.*?);/)||[])[1]||"image/jpeg",bin=atob(d),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:mime})}
async function importCatalog(file){
 const status=document.getElementById("importCatalogStatus");status.innerHTML="Lendo arquivo…";
 const data=JSON.parse(await file.text());
 if(data.tipo!=="acervo-importacao"||!Array.isArray(data.obras))throw new Error("Formato de importação inválido");
 const existing=await all("obras");const patrSet=new Set(existing.map(o=>String(o.patrimonio||"").trim().toLowerCase()).filter(Boolean)),sourceSet=new Set(existing.map(o=>o.sourceKey).filter(Boolean));
 let added=0,skipped=0,photos=0;
 for(let i=0;i<data.obras.length;i++){
   const x=data.obras[i],pat=String(x.patrimonio||"").trim(),sourceKey=`${data.origem||"importacao"}#${x.linha_excel||i+1}`;
   if((pat&&patrSet.has(pat.toLowerCase()))||sourceSet.has(sourceKey)){skipped++;continue}
   const fotos=(x.fotos||[]).map(f=>dataUrlBlob(f.data));
   let descriptors=Array.isArray(x.descriptors)&&x.descriptors.length===fotos.length?x.descriptors:[];
   status.innerHTML=`Importando <strong>${i+1}/${data.obras.length}</strong> · ${added} obra(s) adicionada(s)…`;
   if(!descriptors.length&&fotos.length){for(const f of fotos){descriptors.push(await extractSet(f));await new Promise(r=>setTimeout(r,0))}}
   photos+=fotos.length;
   await requestP(store("obras","readwrite").add({patrimonio:pat,nome:x.nome||"Sem título",artista:x.artista||"",estilo:x.estilo||x.tecnica||"",filial:x.filial||"159",localizacao:x.localizacao||"",descricao:x.descricao||"",fotos,descriptors,documentos:[],sourceKey,linhaExcel:x.linha_excel||null,criadoEm:new Date().toISOString()}));
   if(pat)patrSet.add(pat.toLowerCase());sourceSet.add(sourceKey);added++;await new Promise(r=>setTimeout(r,0));
 }
 status.innerHTML=`Concluído: <strong>${added}</strong> obra(s), <strong>${photos}</strong> foto(s), ${skipped} duplicidade(s) ignorada(s).`;
 await renderArtworks();toast("Importação concluída.");
}
function setupCatalogImport(){
 importCatalogBtn.onclick=()=>importCatalogFile.click();
 importCatalogFile.onchange=async()=>{const f=importCatalogFile.files[0];if(!f)return;try{await importCatalog(f)}catch(e){console.error(e);importCatalogStatus.textContent=`Erro na importação: ${e.name||"Erro"}${e.message?": "+e.message:""}`;toast("Falha na importação.")}importCatalogFile.value=""};
}

/* Motor visual (inalterado) */
async function bmp(f){return createImageBitmap(f)}function canv(b,s,mode){const c=document.createElement("canvas");c.width=c.height=s;const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,s,s);if(mode==="crop"){const q=Math.min(b.width,b.height),sx=(b.width-q)/2,sy=(b.height-q)/2;x.drawImage(b,sx,sy,q,q,0,0,s,s)}else{const k=Math.min(s/b.width,s/b.height),w=b.width*k,h=b.height*k;x.drawImage(b,(s-w)/2,(s-h)/2,w,h)}return c}
function gray(d){const a=[];for(let i=0;i<d.length;i+=4)a.push((.299*d[i]+.587*d[i+1]+.114*d[i+2])/255);return a}function avg(a){return a.reduce((s,x)=>s+x,0)/a.length}function sd(a,m){return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length)}function ah(g){const m=avg(g);return g.map(x=>x>=m?1:0).join("")}function norm(a){const m=avg(a),s=sd(a,m)||1;return a.map(x=>(x-m)/s)}
function hist(d,n=8){const h=new Array(n*3).fill(0);for(let i=0;i<d.length;i+=4){h[Math.min(n-1,Math.floor(d[i]/256*n))]++;h[n+Math.min(n-1,Math.floor(d[i+1]/256*n))]++;h[2*n+Math.min(n-1,Math.floor(d[i+2]/256*n))]++}const q=Math.sqrt(h.reduce((s,x)=>s+x*x,0))||1;return h.map(x=>x/q)}
function edge(g,s){const v=[];for(let y=1;y<s-1;y+=2)for(let x=1;x<s-1;x+=2)v.push(Math.hypot(g[y*s+x+1]-g[y*s+x-1],g[(y+1)*s+x]-g[(y-1)*s+x]));const n=Math.sqrt(v.reduce((a,x)=>a+x*x,0))||1;return v.map(x=>x/n)}
function one(b,m){const c=canv(b,32,m),d=c.getContext("2d",{willReadFrequently:true}).getImageData(0,0,32,32).data,g=gray(d),c8=canv(b,8,m),g8=gray(c8.getContext("2d",{willReadFrequently:true}).getImageData(0,0,8,8).data);return{hash:ah(g8),gray:norm(g),hist:hist(d),edge:edge(g,32)}}
async function extractSet(f){const b=await bmp(f),r={full:one(b,"fit"),crop:one(b,"crop")};b.close?.();return r}
function ham(a,b){let s=0;for(let i=0;i<a.length;i++)if(a[i]===b[i])s++;return s/a.length}function cos(a,b){let d=0,x=0,y=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];x+=a[i]*a[i];y+=b[i]*b[i]}return d/Math.sqrt(x*y)}
function sim(a,b){
 const hs=ham(a.hash,b.hash), hc=Math.max(0,cos(a.hist,b.hist)), gs=(cos(a.gray,b.gray)+1)/2, es=Math.max(0,cos(a.edge,b.edge));
 let s=.18*hs+.38*hc+.26*gs+.18*es;
 if(hc<.72)s*=.78; else if(hc<.82)s*=.90;
 return s
}
function setSim(a,b){return Math.max(sim(a.full,b.full),sim(a.full,b.crop),sim(a.crop,b.full),sim(a.crop,b.crop))}

/* Backup completo */
function toData(b){return new Promise((a,z)=>{const r=new FileReader;r.onload=()=>a(r.result);r.onerror=()=>z(r.error);r.readAsDataURL(b)})}function fromData(u){const [h,d]=u.split(","),m=(h.match(/:(.*?);/)||[])[1]||"image/jpeg",bin=atob(d),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:m})}
async function exportBackup(){
 const obras=[],cs=[];
 for(const o of await all("obras")){
  const x={...o,fotos:[],documentos:[]};
  for(const f of o.fotos||[])x.fotos.push(await toData(f));
  for(const doc of o.documentos||[])x.documentos.push({tipo:doc.tipo,nome:doc.nome,adicionadoEm:doc.adicionadoEm,data:await toData(doc.blob)});
  obras.push(x);
 }
 for(const c of await all("conferencias")){const x={...c,items:[]};for(const i of c.items)x.items.push({...i,foto:i.foto?await toData(i.foto):null});cs.push(x)}
 const config={estilos:await getEstilos(),filiais:await getFiliais()};
 const b=new Blob([JSON.stringify({version:"0.5",createdAt:new Date().toISOString(),config,obras,conferencias:cs})],{type:"application/json"}),a=document.createElement("a");
 a.href=URL.createObjectURL(b);a.download=`acervo-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
 await requestP(store("config","readwrite").put({chave:"ultimoBackup",valor:new Date().toISOString()}));renderStorageStatus();toast("Backup exportado.");
}
async function importBackup(f){
 const d=JSON.parse(await f.text());
 if(d.tipo==="acervo-importacao"&&Array.isArray(d.obras)){await importCatalog(f);return}
 const t1=db.transaction("obras","readwrite"),s1=t1.objectStore("obras");s1.clear();
 for(const o of d.obras||[]){o.fotos=(o.fotos||[]).map(fromData);o.documentos=(o.documentos||[]).map(doc=>({tipo:doc.tipo,nome:doc.nome,adicionadoEm:doc.adicionadoEm,blob:fromData(doc.data)}));s1.put(o)}
 await new Promise((a,b)=>{t1.oncomplete=a;t1.onerror=b});
 const t2=db.transaction("conferencias","readwrite"),s2=t2.objectStore("conferencias");s2.clear();
 for(const c of d.conferencias||[]){for(const i of c.items||[])if(typeof i.foto==="string")i.foto=fromData(i.foto);s2.put(c)}
 await new Promise((a,b)=>{t2.oncomplete=a;t2.onerror=b});
 if(d.config){if(Array.isArray(d.config.estilos))await saveEstilos(d.config.estilos);if(Array.isArray(d.config.filiais))await saveFiliais(d.config.filiais)}
 renderArtworks();renderHistory();toast("Backup restaurado.");
}

/* ---- Gerenciar Estilos ---- */
async function renderEstilosDialog(){
 const list=(await getEstilos()).slice().sort((a,b)=>a.localeCompare(b,"pt-BR"));
 estilosList.innerHTML=list.length?"":`<p class="muted">Nenhum estilo cadastrado ainda.</p>`;
 list.forEach(t=>{
  const chip=document.createElement("div");chip.className="tag-chip";
  const span=document.createElement("span");span.textContent=t;
  const rm=document.createElement("button");rm.type="button";rm.textContent="✕";rm.title="Remover";
  rm.onclick=async()=>{const cur=await getEstilos();const i=cur.indexOf(t);if(i>-1)cur.splice(i,1);await saveEstilos(cur);renderEstilosDialog()};
  chip.append(span,rm);estilosList.append(chip);
 });
}
function setupEstilos(){
 manageEstilosBtn.onclick=()=>{renderEstilosDialog();novoEstiloInput.value="";estilosDialog.showModal()};
 async function addNow(){
  const v=novoEstiloInput.value.trim();if(!v)return;
  const cur=await getEstilos();
  if(cur.some(x=>x.toLowerCase()===v.toLowerCase()))return toast("Esse estilo já existe.");
  cur.push(v);await saveEstilos(cur);novoEstiloInput.value="";renderEstilosDialog();toast("Estilo adicionado.");
 }
 addEstiloBtn.onclick=addNow;
 novoEstiloInput.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addNow()}};
}

/* ---- Gerenciar Filiais e locais ---- */
let filialManagerAtual=null;
async function renderFiliaisManagerSelect(){
 const filiais=(await getFiliais()).slice().sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
 filialManagerSelect.innerHTML=filiais.map(fl=>`<option value="${esc(fl.codigo)}">${esc(fl.nome)} (${esc(fl.codigo)})</option>`).join("");
 if(!filiais.some(fl=>fl.codigo===filialManagerAtual))filialManagerAtual=filiais[0]?.codigo||null;
 if(filialManagerAtual)filialManagerSelect.value=filialManagerAtual;
 removeFilialBtn.disabled=!filialManagerAtual;
}
async function renderLocaisList(){
 const filiais=await getFiliais(),fl=filiais.find(x=>x.codigo===filialManagerAtual);
 locaisList.innerHTML="";
 if(!fl){locaisList.innerHTML=`<p class="muted">Cadastre uma filial primeiro.</p>`;return}
 const locaisOrdenados=fl.locais.slice().sort((a,b)=>a.localeCompare(b,"pt-BR"));
 if(!locaisOrdenados.length)locaisList.innerHTML=`<p class="muted">Nenhum local cadastrado nesta filial.</p>`;
 locaisOrdenados.forEach(l=>{
  const chip=document.createElement("div");chip.className="tag-chip";
  const span=document.createElement("span");span.textContent=l;
  const rm=document.createElement("button");rm.type="button";rm.textContent="✕";rm.title="Remover";
  rm.onclick=async()=>{const filiais2=await getFiliais();const fl2=filiais2.find(x=>x.codigo===filialManagerAtual);const i=fl2.locais.indexOf(l);if(i>-1)fl2.locais.splice(i,1);await saveFiliais(filiais2);renderLocaisList()};
  chip.append(span,rm);locaisList.append(chip);
 });
}
function setupFiliais(){
 manageFiliaisBtn.onclick=async()=>{await renderFiliaisManagerSelect();await renderLocaisList();novaFilialCodigo.value="";novaFilialNome.value="";novoLocalInput.value="";filiaisDialog.showModal()};
 filialManagerSelect.onchange=()=>{filialManagerAtual=filialManagerSelect.value;removeFilialBtn.disabled=!filialManagerAtual;renderLocaisList()};
 addFilialBtn.onclick=async()=>{
  const codigo=novaFilialCodigo.value.trim(),nome=novaFilialNome.value.trim();
  if(!codigo||!nome)return toast("Preencha o código e o nome da filial.");
  const filiais=await getFiliais();
  if(filiais.some(fl=>fl.codigo.toLowerCase()===codigo.toLowerCase()))return toast("Já existe uma filial com esse código.");
  filiais.push({codigo,nome,locais:[]});await saveFiliais(filiais);
  filialManagerAtual=codigo;novaFilialCodigo.value="";novaFilialNome.value="";
  await renderFiliaisManagerSelect();await renderLocaisList();toast("Filial adicionada.");
 };
 removeFilialBtn.onclick=async()=>{
  if(!filialManagerAtual)return;
  const obras=await all("obras");
  if(obras.some(o=>o.filial===filialManagerAtual))return toast("Essa filial tem obras cadastradas — mude a filial delas antes de excluir.");
  if(!confirm("Excluir esta filial e seus locais?"))return;
  const filiais=(await getFiliais()).filter(fl=>fl.codigo!==filialManagerAtual);
  await saveFiliais(filiais);filialManagerAtual=null;
  await renderFiliaisManagerSelect();await renderLocaisList();toast("Filial excluída.");
 };
 addLocalBtn.onclick=async()=>{
  const v=novoLocalInput.value.trim();if(!v)return;
  if(!filialManagerAtual)return toast("Cadastre uma filial primeiro.");
  const filiais=await getFiliais(),fl=filiais.find(x=>x.codigo===filialManagerAtual);
  if(fl.locais.some(x=>x.toLowerCase()===v.toLowerCase()))return toast("Esse local já existe nesta filial.");
  fl.locais.push(v);await saveFiliais(filiais);novoLocalInput.value="";renderLocaisList();toast("Local adicionado.");
 };
 novoLocalInput.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addLocalBtn.click()}};
 novaFilialNome.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addFilialBtn.click()}};
}

/* ---- Painéis (dashboards) ---- */
async function renderDashboard(){
 window.scrollTo(0,0);
 const obras=await all("obras"),filiais=await getFiliais();
 if(dashboardStage==="filiais"){
  const porFilial=new Map();
  for(const o of obras){const ef=efetivoLocal(o);porFilial.set(ef.filial,(porFilial.get(ef.filial)||0)+1)}
  dashboardRoot.innerHTML=`<div class="dash-total"><b>${obras.length}</b><span>obras cadastradas no total</span></div><div class="dash-grid" id="dashFiliaisGrid"></div>`;
  const grid=document.getElementById("dashFiliaisGrid");
  if(!filiais.length){grid.innerHTML=`<p class="muted">Nenhuma filial cadastrada ainda. Cadastre em Ajustes → Filiais e locais.</p>`}
  filiais.slice().sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).forEach(fl=>{
   const card=document.createElement("button");card.type="button";card.className="dash-card";
   card.innerHTML=`<b>${esc(fl.nome)}</b><span class="dash-count">${porFilial.get(fl.codigo)||0} obra(s)</span>`;
   card.onclick=()=>{dashboardStage="locais";dashboardFilial=fl.codigo;renderDashboard()};
   grid.append(card);
  });
 } else if(dashboardStage==="locais"){
  const fl=filiais.find(x=>x.codigo===dashboardFilial);
  const porLocal=new Map();
  for(const o of obras){const ef=efetivoLocal(o);if(ef.filial===dashboardFilial)porLocal.set(ef.localizacao,(porLocal.get(ef.localizacao)||0)+1)}
  const totalFilial=[...porLocal.values()].reduce((s,x)=>s+x,0);
  dashboardRoot.innerHTML=`<button type="button" class="dash-back" id="dashBackBtn">← Filiais</button><div class="dash-total"><b>${totalFilial}</b><span>obra(s) em ${esc(fl?.nome||dashboardFilial)}</span></div><div class="dash-grid" id="dashLocaisGrid"></div>`;
  document.getElementById("dashBackBtn").onclick=()=>{dashboardStage="filiais";renderDashboard()};
  const grid=document.getElementById("dashLocaisGrid");
  const locais=[...porLocal.keys()].sort((a,b)=>(a||"").localeCompare(b||"","pt-BR"));
  if(!locais.length)grid.innerHTML=`<p class="muted">Nenhuma obra registrada nesta filial ainda.</p>`;
  locais.forEach(loc=>{
   const card=document.createElement("div");card.className="dash-card dash-card-local";
   card.innerHTML=`<div><b>${esc(loc||"(sem local)")}</b><span class="dash-count">${porLocal.get(loc)} obra(s)</span></div><button type="button" class="secondary">Abrir catálogo</button>`;
   card.querySelector("button").onclick=()=>{dashboardStage="catalogo";dashboardLocal=loc;renderDashboard()};
   grid.append(card);
  });
 } else if(dashboardStage==="catalogo"){
  const fl=filiais.find(x=>x.codigo===dashboardFilial);
  const lista=obras.filter(o=>{const ef=efetivoLocal(o);return ef.filial===dashboardFilial&&ef.localizacao===dashboardLocal}).sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"));
  dashboardRoot.innerHTML=`<button type="button" class="dash-back" id="dashBackBtn2">← ${esc(fl?.nome||dashboardFilial)}</button><div class="dash-total"><b>${lista.length}</b><span>obra(s) em ${esc(dashboardLocal||"-")}</span></div><div class="dash-catalog" id="dashCatalogList"></div>`;
  document.getElementById("dashBackBtn2").onclick=()=>{dashboardStage="locais";renderDashboard()};
  const listEl=document.getElementById("dashCatalogList");
  lista.forEach(o=>{
   const row=document.createElement("div");row.className="dash-item";
   const im=new Image();if(o.fotos?.[0])im.src=url(o.fotos[0]);
   const info=document.createElement("div");info.className="dash-item-info";
   info.innerHTML=`<b>${esc(o.nome||"Sem título")}</b><span class="meta">${esc(o.patrimonio||"Sem patrimônio")}</span><span class="meta">${esc(o.artista||"-")}</span>`;
   row.append(im,info);listEl.append(row);
  });
 }
}

function isDesktopLike(){const uaMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);return !uaMobile&&window.innerWidth>=820}
function applyXlsxVisibility(){const ok=isDesktopLike();exportXlsxBtn.classList.toggle("hidden",!ok);xlsxMobileNotice.classList.toggle("hidden",ok)}
function setupActions(){exportBtn.onclick=exportBackup;importBtn.onclick=()=>importFile.click();importFile.onchange=async()=>{if(importFile.files[0])await importBackup(importFile.files[0]);importFile.value=""};exportCsvBtn.onclick=()=>exportCsv();exportLatestBtn.onclick=()=>exportCsv();exportXlsxBtn.onclick=exportAcervoXlsx;exportSegurancaBtn.onclick=exportRelatorioSeguranca;resetAllBtn.onclick=resetAll;searchInput.oninput=renderArtworks;applyXlsxVisibility();window.addEventListener("resize",applyXlsxVisibility)}

(async()=>{
 db=await openDB();
 const migrou=await migrarFilialEstilo();
 setupNav();setupDialogs();setupInstall();setupInputs();setupActions();setupCatalogImport();setupCropTool();setupEstilos();setupFiliais();setupDocumentos();setupBaseInformativa();setupConferenceContext();setupCriterios();
 await loadConferenciaAtiva();
 renderArtworks();renderHistory();
 ensureStoragePersisted().then(renderStorageStatus);
 if(migrou)toast("Acervo atualizado: filial e estilo preenchidos automaticamente.");
 if("serviceWorker"in navigator){navigator.serviceWorker.register("./sw.js").then(r=>r.update()).catch(console.warn)}
})();
