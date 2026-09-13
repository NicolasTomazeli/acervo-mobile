const test=require('node:test'),assert=require('node:assert/strict'),{segment}=require('../foreground.js');
function bottle(bg){const w=80,h=100,a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const object=(x>=30&&x<50&&y>=12&&y<35)||(x>=20&&x<60&&y>=35&&y<88);a.set([...(object?[40,150,70]:bg),255],(y*w+x)*4);}return a;}
test('encontra o mesmo objeto em fundos uniformes de cores diferentes',()=>{
 const a=segment(bottle([220,215,190]),80,100),b=segment(bottle([100,100,100]),80,100);assert(a&&b);assert.deepEqual(a.box,b.box);assert.deepEqual(a.mask,b.mask);
});
test('imagem uniforme não inventa um objeto',()=>{const a=new Uint8ClampedArray(80*100*4).fill(128);assert.equal(segment(a,80,100),null);});
test('fundo complexo é rejeitado sem mascaramento arbitrário',()=>{
 const a=new Uint8ClampedArray(80*100*4);for(let y=0;y<100;y++)for(let x=0;x<80;x++)a.set([(x%2)*255,(y%2)*255,((x+y)%2)*255,255],(y*80+x)*4);assert.equal(segment(a,80,100),null);
});
