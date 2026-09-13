/* Uma cópia do catálogo por conferência; fotos e comparação fora da interface. */
const Visual = (() => {
  let worker=null, sequence=0, catalog=[], disabled=false;
  const pending=new Map();
  function stop(error) {
    worker?.terminate();worker=null;disabled=true;
    for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(error);}
    pending.clear();
  }
  async function fallback(type,payload) {
    await new Promise(r=>setTimeout(r,0));
    if(type==='extract')return AcervoMatcher.extract(payload.blob,!!payload.query);
    if(type==='catalog')return true;
    if(type==='rank')return AcervoMatcher.rank(await AcervoMatcher.extract(payload,true),catalog);
  }
  async function call(type,payload) {
    if(type==='catalog')catalog=payload;
    if(disabled||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return fallback(type,payload);
    if(!worker){
      try {
        worker=new Worker('./matcher-worker.js');
        worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data.result);};
        worker.onerror=()=>stop(new Error('Falha no processamento em segundo plano.'));
      }catch(error){stop(error);return fallback(type,payload);}
    }
    try {
      return await new Promise((resolve,reject)=>{
        const id=++sequence;
        const timer=setTimeout(()=>stop(new Error('O processamento da imagem excedeu o tempo limite.')),60000);
        pending.set(id,{resolve,reject,timer});
        try{worker.postMessage({id,type,payload});}catch(error){stop(error);}
      });
    }catch(error){if(disabled)return fallback(type,payload);throw error;}
  }
  return {extract:blob=>call('extract',{blob}),setCatalog:items=>call('catalog',items),rank:blob=>call('rank',blob)};
})();
