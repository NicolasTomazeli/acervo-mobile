const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function start(){
 const catalogPath=process.env.ACERVO_CATALOG&&path.resolve(process.env.ACERVO_CATALOG);
 if(!catalogPath||!fs.existsSync(catalogPath))throw new Error('Defina ACERVO_CATALOG com o caminho do JSON de importação original.');
 const resultDir=process.env.ACERVO_TEST_OUTPUT?path.resolve(process.env.ACERVO_TEST_OUTPUT):path.join(root,'.test-results');fs.mkdirSync(resultDir,{recursive:true});
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'};
 const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  let file=pathname==='/tests/catalog.json'?catalogPath:path.resolve(root,'.'+pathname);
  if(file!==catalogPath&&file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){response.writeHead(404).end();return;}
  response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.setHeader('Cache-Control','no-cache');fs.createReadStream(file).pipe(response);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${server.address().port}`,catalogPath,resultDir,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={start,root};
