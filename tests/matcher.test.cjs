const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../matcher.js');
function pixels(fn){const a=new Uint8ClampedArray(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const rgb=fn(x,y),i=(y*32+x)*4;a.set([...rgb,255],i);}return a;}
const texture=(x,y)=>[(x*7+y*13)%220+15,(x*17+y*3)%220+15,(x*11+y*19)%220+15];
const descriptor=fn=>({version:M.VERSION,aspect:1,views:[M.describe(pixels(fn))]});
test('fotos sem detalhes não produzem NaN nem confirmação automática',()=>{
 for(const color of [0,128,255]){const d=descriptor(()=>[color,color,color]);assert(M.valid(d));const r=M.rank(d,[{id:1,descriptors:[d]}]);assert(!r.automatic);assert(r.lowQuality);assert(Number.isFinite(r.candidates[0].score));}
});
test('mesma referência é recuperada; referência duplicada em outra obra exige revisão',()=>{
 const d=descriptor(texture);assert(M.rank(d,[{id:1,descriptors:[d]}]).automatic);
 const r=M.rank(d,[{id:1,descriptors:[d]},{id:2,descriptors:[d]}]);assert(!r.automatic);assert.equal(r.margin,0);
});
test('normalização preserva semelhança de estrutura após escurecimento',()=>{
 const d=descriptor(texture),dark=descriptor((x,y)=>texture(x,y).map(v=>v*.65));
 assert(M.pair(d,dark).gray>.99);assert(M.pair(d,dark).gradient>.99);
});
test('versão antiga, vetores truncados e NaN são rejeitados',()=>{
 const d=descriptor(texture);assert(!M.valid({full:{},crop:{}}));assert(!M.valid({...d,version:0}));
 for(const value of [NaN,Infinity]){const bad=structuredClone(d);bad.views[0].gray[0]=value;assert(!M.valid(bad));}
 const bad=structuredClone(d);bad.views[0].gradient.pop();assert(!M.valid(bad));
});
test('catálogo vazio é uma resposta pendente válida',()=>{const r=M.rank(descriptor(texture),[]);assert(!r.automatic);assert.deepEqual(r.candidates,[]);});
