importScripts('./matcher.js');
let catalog=[];
self.onmessage=async({data:{id,type,payload}})=>{
  try {
    let result;
    if(type==='extract')result=await AcervoMatcher.extract(payload.blob,!!payload.query);
    else if(type==='catalog'){catalog=payload;result=true;}
    else if(type==='rank')result=AcervoMatcher.rank(await AcervoMatcher.extract(payload,true),catalog);
    else throw new Error('Operação visual desconhecida.');
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message||String(error)});}
};
