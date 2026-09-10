
const DB_NAME = "acervo-mobile-db";
const DB_VERSION = 1;
let db;
let deferredPrompt = null;
let conferenceFiles = [];
let referenceFiles = [];

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains("obras")){
        const s=d.createObjectStore("obras",{keyPath:"id",autoIncrement:true});
        s.createIndex("patrimonio","patrimonio",{unique:true});
      }
      if(!d.objectStoreNames.contains("conferencias")){
        d.createObjectStore("conferencias",{keyPath:"id",autoIncrement:true});
      }
    };
    req.onsuccess=e=>resolve(e.target.result);
    req.onerror=e=>reject(e.target.error);
  });
}
function tx(store,mode="readonly"){ return db.transaction(store,mode).objectStore(store); }
function reqP(req){ return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);}); }
async function all(store){ return reqP(tx(store).getAll()); }
function blobURL(blob){ return blob ? URL.createObjectURL(blob) : ""; }
function toast(msg){
  const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.remove("show"),2200);
}

function setupTabs(){
  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const name=btn.dataset.tab;
      document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===btn));
      document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
      document.getElementById("tab-"+name).classList.add("active");
      window.scrollTo({top:0,behavior:"smooth"});
      if(name==="resultados") renderHistory();
    });
  });
}
function setupDialogs(){
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.open).showModal());
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
}

function makePreview(files,target){
  target.innerHTML="";
  files.forEach((f,i)=>{
    const d=document.createElement("div"); d.className="preview";
    const img=document.createElement("img"); img.src=blobURL(f);
    const n=document.createElement("span"); n.className="num"; n.textContent=i+1;
    d.append(img,n); target.appendChild(d);
  });
}

async function renderObras(){
  const list=document.getElementById("obraList");
  const q=(document.getElementById("searchInput").value||"").toLowerCase().trim();
  let obras=(await all("obras")).sort((a,b)=>b.id-a.id);
  const totalFotos=obras.reduce((s,o)=>s+(o.fotos?.length||0),0);
  document.getElementById("statObras").textContent=obras.length;
  document.getElementById("statFotos").textContent=totalFotos;
  if(q) obras=obras.filter(o=>[o.nome,o.patrimonio,o.artista,o.localizacao].join(" ").toLowerCase().includes(q));
  list.innerHTML="";
  document.getElementById("emptyAcervo").classList.toggle("hidden",obras.length>0);
  obras.forEach(o=>{
    const card=document.createElement("div"); card.className="art-card";
    const img=document.createElement("img"); img.className="thumb";
    if(o.fotos?.[0]) img.src=blobURL(o.fotos[0]); else img.alt="Sem foto";
    const m=document.createElement("div"); m.className="art-main";
    m.innerHTML=`<b>${escapeHtml(o.nome)}</b>
      <div class="meta">${escapeHtml(o.patrimonio)} · ${escapeHtml(o.artista||"Artista não informado")}</div>
      <div class="meta">${escapeHtml(o.localizacao||"Localização não informada")} · ${o.fotos?.length||0} foto(s)</div>`;
    card.append(img,m); list.appendChild(card);
  });
}
function escapeHtml(x=""){return x.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

async function saveArtwork(ev){
  ev.preventDefault();
  const f=new FormData(ev.target);
  const patrimonio=(f.get("patrimonio")||"").trim();
  const nome=(f.get("nome")||"").trim();
  if(!patrimonio||!nome){toast("Informe patrimônio e nome.");return;}
  const obras=await all("obras");
  if(obras.some(o=>o.patrimonio.toLowerCase()===patrimonio.toLowerCase())){
    toast("Esse patrimônio já está cadastrado."); return;
  }
  const item={
    patrimonio,nome,
    artista:(f.get("artista")||"").trim(),
    localizacao:(f.get("localizacao")||"").trim(),
    descricao:(f.get("descricao")||"").trim(),
    fotos:[...referenceFiles],
    criadoEm:new Date().toISOString()
  };
  await reqP(tx("obras","readwrite").add(item));
  ev.target.reset(); referenceFiles=[]; document.getElementById("referencePreview").innerHTML="";
  document.getElementById("cadastroModal").close();
  toast("Obra cadastrada.");
  renderObras();
}

function setupConference(){
  const input=document.getElementById("conferenceInput");
  document.getElementById("cameraBtn").onclick=()=>input.click();
  input.onchange=()=>{
    const files=[...input.files].filter(f=>f.type.startsWith("image/")).slice(0,7);
    if(input.files.length>7) toast("Foram consideradas apenas as 7 primeiras imagens.");
    conferenceFiles=files;
    makePreview(files,document.getElementById("conferencePreview"));
    document.getElementById("startConferenceBtn").disabled=!files.length;
    document.getElementById("clearConferenceBtn").classList.toggle("hidden",!files.length);
  };
  document.getElementById("clearConferenceBtn").onclick=()=>{
    conferenceFiles=[];input.value="";document.getElementById("conferencePreview").innerHTML="";
    document.getElementById("startConferenceBtn").disabled=true;
    document.getElementById("clearConferenceBtn").classList.add("hidden");
  };
  document.getElementById("startConferenceBtn").onclick=startConference;
}

async function startConference(){
  if(!conferenceFiles.length)return;
  const items=conferenceFiles.map((foto,i)=>({
    ordem:i+1,foto,status:"pendente",score:null,obraId:null,
    observacao:"Reconhecimento automático será conectado na próxima versão."
  }));
  const conf={criadoEm:new Date().toISOString(),items};
  const id=await reqP(tx("conferencias","readwrite").add(conf));
  conferenceFiles=[];document.getElementById("conferenceInput").value="";
  document.getElementById("conferencePreview").innerHTML="";
  document.getElementById("startConferenceBtn").disabled=true;
  document.getElementById("clearConferenceBtn").classList.add("hidden");
  await renderHistory();
  await openResult(id);
  toast("Conferência registrada.");
}

async function renderHistory(){
  const el=document.getElementById("conferenceHistory");
  const confs=(await all("conferencias")).sort((a,b)=>b.id-a.id);
  el.innerHTML="";
  document.getElementById("emptyResults").classList.toggle("hidden",confs.length>0);
  confs.forEach(c=>{
    const located=c.items.filter(i=>i.status==="localizado").length;
    const pending=c.items.length-located;
    const card=document.createElement("button");
    card.className="history-card"; card.style.width="100%"; card.style.textAlign="left";
    card.innerHTML=`<div class="history-main">
      <div class="history-head"><b>Conferência #${c.id}</b><span class="status pending">${pending} pendente(s)</span></div>
      <div class="meta">${new Date(c.criadoEm).toLocaleString("pt-BR")} · ${c.items.length} imagem(ns) · ${located} localizada(s)</div>
    </div><span>›</span>`;
    card.onclick=()=>openResult(c.id); el.appendChild(card);
  });
}

async function openResult(id){
  const c=await reqP(tx("conferencias").get(id));
  if(!c)return;
  const located=c.items.filter(i=>i.status==="localizado").length;
  const pending=c.items.length-located;
  document.getElementById("resultTitle").textContent=`Conferência #${id}`;
  document.getElementById("resultSummary").innerHTML=`
    <div class="stat"><b>${located}</b><span>localizadas</span></div>
    <div class="stat"><b>${pending}</b><span>pendentes</span></div>`;
  const wrap=document.getElementById("resultItems"); wrap.innerHTML="";
  c.items.forEach(it=>{
    const d=document.createElement("div"); d.className="result-item";
    const img=document.createElement("img"); img.src=blobURL(it.foto);
    const text=document.createElement("div");
    text.innerHTML=`<span class="status ${it.status==="localizado"?"ok":"pending"}">${it.status==="localizado"?"LOCALIZADA":"PENDENTE"}</span>
      <h4>Imagem ${it.ordem}</h4>
      <p>${escapeHtml(it.observacao||"")}</p>`;
    d.append(img,text); wrap.appendChild(d);
  });
  document.getElementById("resultModal").showModal();
}

function setupInstall(){
  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault(); deferredPrompt=e;
    document.getElementById("installWrap").classList.remove("hidden");
  });
  document.getElementById("installBtn").onclick=async()=>{
    if(!deferredPrompt)return;
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null;
    document.getElementById("installWrap").classList.add("hidden");
  };
}

async function boot(){
  db=await openDB();
  setupTabs(); setupDialogs(); setupConference(); setupInstall();
  document.getElementById("artworkForm").addEventListener("submit",saveArtwork);
  document.getElementById("searchInput").addEventListener("input",renderObras);
  document.getElementById("referenceInput").addEventListener("change",e=>{
    referenceFiles=[...e.target.files].filter(f=>f.type.startsWith("image/")).slice(0,8);
    makePreview(referenceFiles,document.getElementById("referencePreview"));
  });
  renderObras();renderHistory();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}
boot().catch(e=>{console.error(e);toast("Erro ao iniciar o aplicativo.");});
