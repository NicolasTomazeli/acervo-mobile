const {start:startServer}=require('./helpers.cjs');const path=require('node:path');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const server=await startServer();

 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const report=[];const pass=message=>{report.push(message);console.log('PASS',message);};
 page.on('dialog',d=>d.accept());
 await page.goto(server.url+'/');await page.waitForFunction(()=>!!db);
 await page.click('[data-view="ajustes"]');
 const start=Date.now();await page.setInputFiles('#importCatalogFile',server.catalogPath);
 await page.waitForFunction(()=>!busy&&importCatalogStatus.textContent.startsWith('Concluído'),{},{timeout:60000});
 const count=Number(await page.locator('#statArtworks').textContent());assert.equal(count,348);pass(`Importação de 348 obras pela interface: ${Date.now()-start} ms`);
 await page.setInputFiles('#importCatalogFile',server.catalogPath);await page.waitForFunction(()=>!busy&&importCatalogStatus.textContent.includes('370 linha(s) já importada(s)'));
 assert.equal(Number(await page.locator('#statArtworks').textContent()),348);pass('Reimportação ignora 370 linhas já importadas');
 await page.click('[data-view="acervo"]');assert.equal(await page.locator('.art-card').count(),60);assert.equal(await page.locator('.edit-art:disabled').count(),0);
 await page.fill('#searchInput','anforas');await page.waitForFunction(()=>artworkList.textContent.includes('Ânforas')&&document.querySelectorAll('.art-card').length<60);pass('Busca sem acento e lista limitada a 60 itens');
 await page.fill('#searchInput','');await page.waitForFunction(()=>document.querySelectorAll('.art-card').length===60);
 await page.screenshot({path:path.join(server.resultDir,'acervo-mobile.png'),fullPage:false});
 const stats=await page.evaluate(async()=>{
  const refs=await all('obras'),valid=refs.every(o=>o.descriptors.every(AcervoMatcher.valid));
  const usable=refs.find(o=>o.nome==='Ânforas')||refs.find(o=>o.fotos.length);
  conferenceFiles=[usable.fotos[0]];await task(runConference);
  const c=(await all('conferencias')).at(-1);
  return {valid,expected:usable.id,item:{...c.items[0],foto:null},id:c.id};
 });assert(stats.valid);assert.equal(stats.item.candidatos[0].obraId,stats.expected);pass('Descritores atuais e reconhecimento via Worker');
 await page.screenshot({path:path.join(server.resultDir,'resultado-mobile.png'),fullPage:false});
 const correction=await page.evaluate(async({id,expected})=>{
  await undoMatch(id,0);const c=await requestP(store('conferencias').get(id));const candidate=c.items[0].candidatos.find(x=>x.obraId!==expected);
  await confirmCandidate(id,0,candidate.obraId);const updated=await requestP(store('conferencias').get(id));
  return {score:updated.items[0].score,expectedScore:candidate.score,metodo:updated.items[0].metodo};
 },stats);assert.equal(correction.score,correction.expectedScore);assert.equal(correction.metodo,'manual');pass('Desfazer e confirmar outro candidato atualiza o índice visual');
 const downloadPromise=page.waitForEvent('download');await page.click('#exportCurrentCsvBtn');const download=await downloadPromise;await download.saveAs(path.join(server.resultDir,'test-export.csv'));
 const csv=fs.readFileSync(path.join(server.resultDir,'test-export.csv'),'utf8');assert.equal((csv.match(/^"1";/gm)||[]).length,348);pass('CSV com 348 obras e cabeçalho');
 await page.click('[data-close="resultDialog"]');
 const bad=await page.evaluate(async()=>{
   const before=(await all('obras')).length;let rejected=false;
   try{await importBackup(new File(['{}'],'bad.json',{type:'application/json'}));}catch{rejected=true;}
   let failed=false;try{await importCatalog(new File([JSON.stringify({tipo:'acervo-importacao',obras:[{nome:'Não deve persistir',patrimonio:'TEST',fotos:[]},{nome:'Inválida',fotos:[{data:'data:image/jpeg;base64,AAAA'}]}]})],'bad-catalog.json'));}catch{failed=true;}
   return {rejected,failed,before,after:(await all('obras')).length};
 });assert(bad.rejected&&bad.failed);assert.equal(bad.before,bad.after);pass('Backup inválido e catálogo com imagem inválida preservam todos os dados');
 const backupP=page.waitForEvent('download');await page.click('[data-view="ajustes"]');await page.click('#exportBtn');const backup=await backupP;await backup.saveAs(path.join(server.resultDir,'test-backup.json'));
 await page.setInputFiles('#importFile',path.join(server.resultDir,'test-backup.json'));
 await page.waitForFunction(()=>!busy,{},{timeout:60000});assert.equal(Number(await page.locator('#statArtworks').textContent()),348);pass('Backup exportado e restaurado com imagens e conferências');
 const failure=await page.evaluate(async()=>{
  conferenceFiles=[new Blob(['invalid'],{type:'image/jpeg'})];await task(runConference);
  return {busy,enabled:!runConferenceBtn.disabled,progressHidden:progressWrap.classList.contains('hidden'),label:runConferenceBtn.textContent};
 });assert(!failure.busy&&failure.enabled&&failure.progressHidden);assert.equal(failure.label,'Iniciar conferência');pass('Falha de imagem libera a interface e preserva a seleção para nova tentativa');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!db&&Number(statArtworks.textContent)===348);
 const offline=await page.evaluate(async()=>{conferenceFiles=[(await all('obras')).find(o=>o.fotos.length).fotos[0]];await task(runConference);return (await all('conferencias')).length;});assert.equal(offline,2);pass('Reabertura e reconhecimento inteiramente offline');
 assert.deepEqual(errors,[]);pass('Nenhum erro JavaScript não tratado');
 fs.writeFileSync(path.join(server.resultDir,'smoke-results.json'),JSON.stringify({report,errors},null,2));await browser.close();
await server.close();
})().catch(e=>{console.error(e);process.exit(1)});
