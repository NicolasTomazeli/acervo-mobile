const {start}=require('./helpers.cjs');const path=require('node:path');
const {chromium}=require('playwright');const assert=require('node:assert/strict'),fs=require('fs');
(async()=>{
 const server=await start();

 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(server.url+'/');await page.waitForFunction(()=>!!db);
 await page.click('#newArtworkBtn');await page.fill('[name="nome"]','Obra de teste');await page.fill('[name="patrimonio"]','TEST-001');await page.fill('[name="artista"]','Artista teste');await page.fill('[name="localizacao"]','Sala 1');
 await page.setInputFiles('#referenceInput',path.join(__dirname,'../lbv-referencia.jpg'));await page.waitForFunction(()=>!busy&&referenceFiles.length===1);
 await page.click('[type="submit"]');await page.waitForFunction(()=>!busy&&!artworkDialog.open);
 let works=await page.evaluate(()=>all('obras'));assert.equal(works.length,1);assert.equal(works[0].nome,'Obra de teste');assert.equal(works[0].patrimonio,'TEST-001');assert.equal(works[0].artista,'Artista teste');
 await page.click('.edit-art');await page.fill('[name="nome"]','Obra editada');await page.click('[type="submit"]');await page.waitForFunction(()=>!busy&&!artworkDialog.open);
 works=await page.evaluate(()=>all('obras'));assert.equal(works[0].nome,'Obra editada');assert.equal(works[0].fotos.length,1);
 await page.click('.edit-art');await page.click('.remove-photo');await page.click('[type="submit"]');await page.waitForFunction(()=>!busy&&!artworkDialog.open);
 works=await page.evaluate(()=>all('obras'));assert.equal(works[0].fotos.length,0);assert.equal(works[0].descriptors.length,0);console.log('PASS Cadastro, edição e remoção de foto pela interface');
 await page.click('.edit-art');await page.click('#deleteArtworkBtn');await page.waitForFunction(()=>!busy&&!artworkDialog.open);assert.equal(await page.evaluate(async()=>(await all('obras')).length),0);console.log('PASS Exclusão de cadastro');
 const atomic=await page.evaluate(async()=>{
  const tx=db.transaction(['obras','conferencias'],'readwrite'),done=transactionDone(tx);tx.objectStore('obras').put({id:1,nome:'Original',fotos:[]});tx.objectStore('conferencias').put({id:1,items:[]});await done;
  const change=db.transaction(['obras','conferencias'],'readwrite'),failed=transactionDone(change).catch(()=>true);change.objectStore('obras').clear();change.objectStore('conferencias').clear();change.abort();await failed;artworkCache=null;
  return {works:(await all('obras')).length,conferences:(await all('conferencias')).length};
 });assert.deepEqual(atomic,{works:1,conferences:1});console.log('PASS Abort de transação mantém as duas coleções');
 // Simula o banco v0.5.2, sem apagar/recriar a origem, e atualiza os descritores.
 const migration=await page.evaluate(async()=>{
  const catalog=await(await fetch('/tests/catalog.json')).json();const row=catalog.obras[0],foto=dataUrlBlob(row.fotos[0].data);
  await requestP(store('obras','readwrite').put({id:12,nome:row.nome,patrimonio:row.patrimonio,fotos:[foto],descriptors:row.descriptors}));
  const refs=(await all('obras')).filter(o=>o.fotos.length);await ensureDescriptors(refs);
  const updated=await requestP(store('obras').get(12));return {valid:updated.descriptors.every(AcervoMatcher.valid),id:updated.id,history:(await all('conferencias')).length};
 });assert(migration.valid);assert.equal(migration.id,12);assert.equal(migration.history,1);console.log('PASS Migração de descritores antigos preserva IDs e histórico');
 await browser.close();
 const fallbackBrowser=await chromium.launch({channel:'chrome',headless:true});const fallback=await fallbackBrowser.newPage();
 await fallback.addInitScript(()=>{window.Worker=undefined;});await fallback.goto(server.url+'/');await fallback.waitForFunction(()=>!!db);
 const ok=await fallback.evaluate(async()=>{const photo=await(await fetch('./lbv-referencia.jpg')).blob();const descriptor=await Visual.extract(photo);await Visual.setCatalog([{id:1,nome:'Teste',descriptors:[descriptor]}]);return (await Visual.rank(photo)).candidates[0].obraId===1;});assert(ok);console.log('PASS Fallback sem Worker');
 assert.deepEqual(errors,[]);await fallbackBrowser.close();
 fs.writeFileSync(path.join(server.resultDir,'extra-results.json'),JSON.stringify({passed:6,errors},null,2));
await server.close();
})().catch(e=>{console.error(e);process.exit(1)});
