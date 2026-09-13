/* Redução de fundo uniforme. Não é segmentação semântica: se houver dúvida, retorna null. */
(function(root){
 'use strict';
 function segment(data,width,height){
  const total=width*height,border=[];
  for(let x=0;x<width;x++){border.push(x,(height-1)*width+x);}
  for(let y=1;y<height-1;y++){border.push(y*width,y*width+width-1);}
  const clusters=new Map();
  for(const p of border){const k=[0,1,2].map(c=>data[p*4+c]>>5).join(',');if(!clusters.has(k))clusters.set(k,[]);clusters.get(k).push(p);}
  const largest=[...clusters.values()].sort((a,b)=>b.length-a.length)[0];
  if(!largest||largest.length<border.length*.35)return null;
  const bg=[0,1,2].map(c=>largest.reduce((s,p)=>s+data[p*4+c],0)/largest.length);
  const distance=p=>Math.hypot(data[p*4]-bg[0],data[p*4+1]-bg[1],data[p*4+2]-bg[2]);
  const threshold=35;
  const compatible=border.filter(p=>distance(p)<=threshold);
  if(compatible.length<border.length*.75)return null;
  const background=new Uint8Array(total),queue=new Int32Array(total);let head=0,tail=0;
  for(const p of compatible)if(!background[p]){background[p]=1;queue[tail++]=p;}
  while(head<tail){
   const p=queue[head++],x=p%width,y=Math.floor(p/width);
   for(const n of [x?p-1:-1,x<width-1?p+1:-1,y?p-width:-1,y<height-1?p+width:-1]){
    if(n<0||background[n]||distance(n)>threshold)continue;background[n]=1;queue[tail++]=n;
   }
  }
  const remaining=total-tail;if(remaining<total*.045||remaining>total*.82)return null;
  // Só a maior região conectada; sujeira pequena na parede não vira parte da peça.
  const seen=new Uint8Array(background),components=[];
  for(let start=0;start<total;start++)if(!seen[start]){
   head=0;tail=0;queue[tail++]=start;seen[start]=1;
   while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);
    for(const n of [x?p-1:-1,x<width-1?p+1:-1,y?p-width:-1,y<height-1?p+width:-1])if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;}
   }
   components.push(queue.slice(0,tail));
  }
  components.sort((a,b)=>b.length-a.length);const object=components[0];
  if(!object||object.length<remaining*.85)return null;
  const mask=new Uint8Array(total);let left=width,top=height,right=0,bottom=0;
  for(const p of object){mask[p]=1;const x=p%width,y=Math.floor(p/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const w=right-left+1,h=bottom-top+1;
  if(w<10||h<10||(left===0)+(right===width-1)+(top===0)+(bottom===height-1)>1||object.length/(w*h)<.2)return null;
  return {mask,box:[left,top,w,h],background:bg};
 }
 root.AcervoForeground={segment};
 if(typeof module!=='undefined')module.exports=root.AcervoForeground;
})(globalThis);
