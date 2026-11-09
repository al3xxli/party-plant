// A trailing, variegated vine and glazed pot, drawn from the supplied plant photo.
new p5(p => {
  const host=document.getElementById('garden');
  const hitContext=document.createElement('canvas').getContext('2d');
  const leafPath=new Path2D('M 0 3 C -9 -12 -21 -16 -30 -8 C -44 5 -30 33 -13 53 C -4 64 0 71 2 80 C 10 67 28 49 35 28 C 44 4 31 -13 20 -13 C 11 -13 5 -6 0 3 Z');
  const potBody=new Path2D('M 315 96 C 313 123 286 135 285 182 C 284 224 312 253 359 254 C 406 254 431 224 429 181 C 427 139 403 126 402 96 Z');
  const leaves=[
    {x:414,y:91,node:[417,133],angle:-1.12,size:.91,light:'#d7dda9',dark:'#92a65c'},
    {x:410,y:204,node:[393,213],angle:-.77,size:.80,light:'#c0cf91',dark:'#8eaa5e'},
    {x:328,y:281,node:[344,269],angle:-.48,size:1.08,light:'#cad7a1',dark:'#5e7e32'},
    {x:277,y:248,node:[284,294],angle:1.13,size:.97,light:'#d2daae',dark:'#8da56c'},
    {x:222,y:325,node:[207,311],angle:-.21,size:.92,light:'#d5debb',dark:'#90a478'},
    {x:125,y:308,node:[142,307],angle:.84,size:.79,light:'#c5d2a1',dark:'#708d48'},
    {x:86,y:267,node:[105,278],angle:1.97,size:.89,light:'#d2dbac',dark:'#83a258'},
    {x:117,y:238,node:[115,260],angle:3.40,size:.67,light:'#d9e0b6',dark:'#6f9144'},
    {x:164,y:269,node:[150,300],angle:2.52,size:.61,light:'#cbd7a3',dark:'#92ab6c'}
  ];
  const control=[
    [342,111],[308,34],[386,53],[412,73],
    [447,110],[418,204],[365,250],
    [312,298],[205,329],[133,301],
    [82,282],[69,249],[109,228]
  ];
  const nodes=[[329,72],[360,57],[392,64],[421,95],[425,135],[408,183],[386,225],[345,269],[284,294],[207,311],[142,307],[105,278]];
  const pointers=new Map();
  let canvas,scale=1,ox=0,oy=0,visualBend=0,visualTilt=0;

  function layout() {
    const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
    p.resizeCanvas(w,h);
    scale=Math.min(w/540,h/420);ox=(w-540*scale)/2;oy=(h-420*scale)/2;
  }
  function deform(x,y) {
    const influence=clip((330-x)/240);
    return [x+visualBend*13*influence,y-visualBend*(visualBend<0?32:87)*influence];
  }
  function drawCurve(ctx,path,color,width) {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(path);
  }
  function vinePath() {
    const pts=control.map(([x,y])=>deform(x,y)),path=new Path2D();
    path.moveTo(...pts[0]);
    for(let i=1;i<pts.length;i+=3)path.bezierCurveTo(...pts[i],...pts[i+1],...pts[i+2]);
    return path;
  }
  function leafPose(part,i) {
    const [x,y]=deform(part.x,part.y);
    const squeezed=band.state.pinching && (
      [...pointers.values()].some(hand=>hand.part==='leaf'&&hand.index===i) ||
      ((hands.pinch.size>0||window.plantHardware?.connected||playingDemo) && i===2 && ![...pointers.values()].some(hand=>hand.part==='leaf'))
    );
    return {x,y,angle:part.angle-visualBend*.22*clip((330-part.x)/240),
      sx:part.size*(squeezed?1-band.state.force*.23:1),sy:part.size};
  }
  function drawLeaf(ctx,part,i) {
    const pose=leafPose(part,i),node=deform(...part.node);
    const stalk=new Path2D();
    stalk.moveTo(...node);stalk.quadraticCurveTo(pose.x+5,node[1]-10,pose.x,pose.y);
    drawCurve(ctx,stalk,'#708b4a',2.8);
    ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.scale(pose.sx,pose.sy);
    ctx.fillStyle=part.light;ctx.fill(leafPath);ctx.save();ctx.clip(leafPath);
    // Irregular green islands and cream edges suggest the photographed variegation.
    ctx.fillStyle=part.dark;
    ctx.fill(new Path2D('M 3 4 C 15 -14 34 -13 33 12 C 27 17 37 28 22 34 C 30 43 12 54 5 67 C 8 45 -2 30 3 4 Z'));
    ctx.fill(new Path2D('M -28 -3 Q -18 1 -17 13 Q -8 16 -13 23 Q -1 30 -8 40 Q -22 22 -28 -3 Z'));
    for(let j=0;j<48;j++) {
      const x=Math.sin((j+1)*(i+11))*32,y=(j*17+i*5)%63-7;
      ctx.fillStyle=j%3===0?part.light:part.dark;
      ctx.beginPath();ctx.ellipse(x,y,1.5+(j%3),.7+(j%2),.4,0,Math.PI*2);ctx.fill();
    }
    for(const h of [14,26,40,53]) {
      const span=27*(1-h/80);
      drawCurve(ctx,new Path2D(`M 1 ${h} Q -9 ${h-7} ${-span} ${h-14}`),'#a5b683',.55);
      drawCurve(ctx,new Path2D(`M 1 ${h} Q 12 ${h-8} ${span+3} ${h-14}`),'#adc08a',.55);
    }
    drawCurve(ctx,new Path2D('M 0 3 Q -4 40 2 78'),'#e3e8bd',1.1);
    ctx.restore();
    ctx.strokeStyle='#8c9b6e';ctx.lineWidth=.55;ctx.stroke(leafPath);
    ctx.restore();
  }
  function drawPot(ctx) {
    ctx.save();
    const glaze=ctx.createLinearGradient(289,145,427,215);
    glaze.addColorStop(0,'#68606b');glaze.addColorStop(.28,'#6e4854');
    glaze.addColorStop(.64,'#3e384d');glaze.addColorStop(1,'#6d4b58');
    ctx.fillStyle=glaze;ctx.fill(potBody);
    ctx.save();ctx.clip(potBody);
    for(let i=0;i<600;i++) {
      const x=285+(i*37.79)%145,y=105+(i*29.53)%149;
      ctx.fillStyle=i%3===0?'#a5776d80':'#b0a8b34f';
      ctx.fillRect(x,y,.6+(i%3)*.35,.8);
    }
    ctx.fillStyle='#d6ccd721';
    ctx.fill(new Path2D('M 309 137 C 283 177 305 207 324 207 C 318 179 320 162 329 145 Z'));
    ctx.restore();
    ctx.strokeStyle='#443b47';ctx.lineWidth=1;ctx.stroke(potBody);
    const rim=new Path2D();rim.ellipse(358,97,44,16,0,0,Math.PI*2);
    ctx.fillStyle='#585568';ctx.fill(rim);ctx.strokeStyle='#93848f';ctx.stroke(rim);
    const inside=new Path2D();inside.ellipse(358,98,38,11,0,0,Math.PI*2);
    ctx.fillStyle='#272923';ctx.fill(inside);
    ctx.fillStyle='#8d8269';
    for(let i=0;i<25;i++)ctx.fillRect(327+(i*23.1)%60,93+(i*7.4)%9,1.4,.8);
    ctx.restore();
  }
  function specimen() {
    const ctx=p.drawingContext;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    drawPot(ctx);
    const vine=vinePath();
    if (band.state.chime) {
      drawCurve(ctx,vine,'#fff',13);
      drawCurve(ctx,vine,'#66330b',10);
      drawCurve(ctx,vine,'#f6aa4e',6);
    } else {
      drawCurve(ctx,vine,'#587333',6);
      drawCurve(ctx,vine,'#94aa63',2.1);
    }
    for(const node of nodes) {
      const [x,y]=deform(...node);
      ctx.save();ctx.translate(x,y);ctx.rotate(.4);
      ctx.fillStyle='#b1b575';ctx.fillRect(-4,-3,2,7);
      ctx.fillStyle='#665d3f';ctx.fillRect(-5,4,5,1.8);ctx.restore();
    }
    leaves.forEach((part,i)=>drawLeaf(ctx,part,i));
    // Keep a steady target around the copper collar for the full contact.
    if (band.state.chime) {
      const ring=new Path2D();
      ring.arc(421.5,158,15,0,Math.PI*2);
      drawCurve(ctx,ring,'#fff',6);
      drawCurve(ctx,ring,'#3e2918',2.5);
    }
    ctx.strokeStyle=band.state.chime?'#332516':'#a48453';ctx.lineWidth=1.6;
    for(let i=0;i<4;i++) {ctx.beginPath();ctx.moveTo(421-i,154+i*2);ctx.lineTo(429-i,156+i*2);ctx.stroke();}
    ctx.restore();
  }
  function point(e) {
    const box=canvas.elt.getBoundingClientRect();
    const x=(e.clientX-box.left-ox)/scale-358,y=(e.clientY-box.top-oy)/scale-250;
    return {x:358+Math.cos(visualTilt)*x+Math.sin(visualTilt)*y,y:250-Math.sin(visualTilt)*x+Math.cos(visualTilt)*y};
  }
  function target({x,y}) {
    for(let i=leaves.length-1;i>=0;i--) {
      const pose=leafPose(leaves[i],i),dx=x-pose.x,dy=y-pose.y,a=pose.angle;
      const u=(Math.cos(a)*dx+Math.sin(a)*dy)/pose.sx,v=(-Math.sin(a)*dx+Math.cos(a)*dy)/pose.sy;
      if(hitContext.isPointInPath(leafPath,u,v))return {part:'leaf',index:i};
    }
    hitContext.lineWidth=22;
    if(hitContext.isPointInStroke(vinePath(),x,y))return {part:'stem'};
    if(((x-358)/40)**2+((y-98)/13)**2<=1)return {part:'pot'};
    if(hitContext.isPointInPath(potBody,x,y))return {part:'pot'};
    return null;
  }
  function play(e,hand,initial) {
    const pos=point(e),id='plant'+e.pointerId;
    if(hand.part==='leaf') {
      const pressure=e.pointerType==='pen'&&e.pressure>0?e.pressure:clip(.45+Math.hypot(pos.x-hand.start.x,pos.y-hand.start.y)/80);
      pinchLeaf(true,id,pressure);
    }
    if(hand.part==='stem') {
      const distance=Math.hypot(pos.x-hand.start.x,pos.y-hand.start.y);
      if(initial)touchStem(true,id);
      if(distance>8 || hand.bending) {
        hand.bending=true;touchStem(false,id);
        const horizontal=pos.x-hand.start.x, upward=hand.start.y-pos.y;
        flexStem(true,id,(Math.abs(horizontal)>Math.abs(upward)?horizontal:upward)/95);
      }
    }
    if(hand.part==='pot') {
      const distance=(e.clientX-hand.startClientX)/scale;
      if(Math.abs(distance)>8||hand.tilting) {
        hand.tilting=true;tiltPot(true,id,distance/90);
      }
    }
  }
  p.setup=()=>{
    p.pixelDensity(Math.min(window.devicePixelRatio||1,2));
    canvas=p.createCanvas(1,1);canvas.parent(host);canvas.elt.style.touchAction='none';
    canvas.elt.setAttribute('aria-label','Trailing vine. Hold a leaf to pinch, touch the stem or drag it left/down to curl and right/up to extend, and drag the pot sideways for the pad. Keyboard controls B, F and C also work.');
    p.frameRate(30);layout();new ResizeObserver(layout).observe(host);
    window.addEventListener('plantbandstop',()=>pointers.clear());
    canvas.elt.addEventListener('pointerdown',e=>{
      if(window.plantHardware?.connected)return;
      const pos=point(e),part=target(pos);
      if(e.button!==0||!part)return;
      e.preventDefault();canvas.elt.setPointerCapture(e.pointerId);
      const hand={...part,start:pos,startClientX:e.clientX,bending:false,tilting:false};
      pointers.set(e.pointerId,hand);play(e,hand,true);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture']) {
      canvas.elt.addEventListener(event,e=>{
        const hand=pointers.get(e.pointerId);
        if(!hand)return;
        pointers.delete(e.pointerId);
        const id='plant'+e.pointerId;
        if(hand.part==='leaf')pinchLeaf(false,id);
        if(hand.part==='stem') {touchStem(false,id);flexStem(false,id);}
        if(hand.part==='pot') tiltPot(false,id);
      });
    }
    canvas.elt.addEventListener('pointermove',e=>{
      const held=pointers.get(e.pointerId),part=held||target(point(e));
      canvas.elt.style.cursor=({stem:'grab',leaf:'pointer',pot:'grab'})[part?.part]||'default';
      if(held)play(e,held,false);
    });
  };
  p.draw=()=>{
    const targetBend=band.state.lead?band.state.pitch:0;
    visualBend+=(targetBend-visualBend)*.18;
    visualTilt+=(band.state.tilt*.24-visualTilt)*.18;
    p.clear();p.push();p.translate(ox,oy);p.scale(scale);p.translate(358,250);p.rotate(visualTilt);p.translate(-358,-250);specimen();p.pop();
  };
},document.getElementById('garden'));
