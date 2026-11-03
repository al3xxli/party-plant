// Draw and hit-test the same leaf paths, including their openings.
new p5(p => {
  const host = document.getElementById('garden');
  const hitContext = document.createElement('canvas').getContext('2d');
  const mature = new Path2D(`
    M 0 3 C -8 -14 -17 -31 -35 -30 C -53 -30 -63 -12 -64 7
    C -65 10 -64 16 -63 18 C -49 15 -35 9 -21 7
    C -33 14 -51 19 -62 27 C -62 38 -58 47 -55 53
    C -43 46 -25 31 -13 26 C -23 38 -41 50 -51 63
    C -47 72 -41 82 -35 87 C -27 78 -17 66 -9 55
    C -14 71 -25 83 -30 94 C -23 104 -8 115 4 132
    C 8 115 22 113 33 99 C 26 89 20 82 18 72
    C 25 81 33 89 40 90 C 48 83 53 72 55 62
    C 41 57 28 48 16 36 C 30 42 44 54 59 54
    C 64 42 66 34 64 25 C 50 23 35 18 23 11
    C 38 15 52 20 65 16 C 67 -3 58 -20 43 -26
    C 25 -34 11 -18 0 3 Z`);
  const holes = [
    [-32,-7,3.3,10,.86], [-22,14,2.7,7.6,1.02],
    [27,-6,3.5,10,-.91], [17,24,2.7,7.8,-.72], [-13,46,2.1,6.6,.62]
  ];
  for (const [x,y,rx,ry,angle] of holes) {
    const hole = new Path2D();
    hole.ellipse(x,y,rx,ry,angle,0,2*Math.PI);
    mature.addPath(hole);
  }
  const young = new Path2D('M 0 3 C -10 -23 -33 -27 -42 -10 C -56 17 -31 60 -11 82 C -3 92 2 100 4 109 C 14 92 47 57 50 25 C 54 2 43 -21 27 -22 C 14 -24 5 -8 0 3 Z');
  // Each blade hangs from its own petiole. A young, unbroken blade sits behind the mature leaves.
  const leaves = [
    {x:-28,y:87,angle:1.66,sx:.72,sy:.71,joint:196,blade:young,light:'#73916a',dark:'#486e50'},
    {x:-13,y:90,angle:-2.22,sx:.90,sy:.84,joint:173,blade:mature,light:'#63845e',dark:'#3c6146'},
    {x:63,y:92,angle:-.43,sx:-.88,sy:.90,joint:185,blade:mature,light:'#41684e',dark:'#224c37'},
    {x:-61,y:114,angle:.72,sx:1.02,sy:.95,joint:207,blade:mature,light:'#4d7455',dark:'#2c533e'}
  ];
  const pointers = new Map(), stemTop=138, stemBottom=223;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let canvas, scale=1, ox=0, oy=0;
  function layout() {
    const w=Math.max(1,host.clientWidth), h=Math.max(1,host.clientHeight);
    p.resizeCanvas(w,h);
    scale=Math.min((w-18)/420,(h-3)/342); ox=w/2; oy=(h-335*scale)/2;
  }
  function rotation(leaf,i) {
    const gesture=.033*band.level('chime')+.012*band.level('bass');
    return leaf.angle+(reduceMotion?0:(i%2?1:-1)*gesture);
  }
  function curve(ctx,d,color,width) {
    ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke(new Path2D(d));
  }
  function leaf(ctx,part,i) {
    ctx.save();
    ctx.translate(part.x,part.y); ctx.rotate(rotation(part,i)); ctx.scale(part.sx,part.sy);
    ctx.fillStyle=part.dark; ctx.fill(part.blade,'evenodd');
    ctx.save(); ctx.clip(part.blade,'evenodd');
    ctx.fillStyle=part.light;
    ctx.fill(new Path2D('M -75 -45 L 2 -45 C -3 -12 -5 40 0 78 C 2 100 6 123 4 142 L -75 142 Z'));
    // Veins are clipped at every split and hole in the blade.
    for (const [height,spread] of [[10,53],[31,59],[54,48],[77,31],[97,16]]) {
      for (const side of [-1,1]) {
        curve(ctx,`M -1 ${height} Q ${side*spread*.40} ${height-8} ${side*spread} ${height-33}`,
          side===1?'#77907a':'#809780',.68);
      }
    }
    curve(ctx,'M 0 3 C -4 24 -3 62 1 89 Q 4 116 4 130','#a6b495',1.35);
    ctx.restore(); ctx.restore();
  }
  function petiole(ctx,part) {
    const d=`M 1 ${part.joint} C ${part.x*.28} ${part.joint-16} ${part.x*.79} ${part.y+8} ${part.x} ${part.y}`;
    curve(ctx,d,'#466248',3.1);curve(ctx,d,'#829376',1.0);
  }
  function pot(ctx) {
    ctx.save();ctx.translate(0,-2.5*band.level('drum'));
    const body=new Path2D('M -59 241 C -57 260 -54 285 -48 304 C -41 316 39 316 47 305 C 54 285 57 260 59 241 Z');
    ctx.fillStyle='#f6f5f1';ctx.fill(body);ctx.strokeStyle='#55534c';ctx.lineWidth=1.1;ctx.stroke(body);
    ctx.save();ctx.clip(body);
    ctx.fillStyle='#e8e7e1';ctx.fill(new Path2D('M 36 241 Q 40 275 30 312 L 60 313 L 64 241 Z'));
    ctx.restore();
    const rim=new Path2D();rim.ellipse(0,242,59,10,0,0,Math.PI*2);
    ctx.fillStyle='#e9e7df';ctx.fill(rim);ctx.stroke(rim);
    const soil=new Path2D();soil.ellipse(0,242,54,6.7,0,0,Math.PI*2);
    ctx.fillStyle=band.state.wet>.18?'#484137':'#695d4e';ctx.fill(soil);
    ctx.fillStyle='#998b76';
    for(let i=0;i<25;i++) {
      const x=Math.sin(i*79)*50,y=Math.cos(i*17)*4*(1-Math.abs(x)/57);
      ctx.fillRect(x,242+y,1.4,.8);
    }
    ctx.restore();
  }
  function specimen() {
    const ctx=p.drawingContext;ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
    pot(ctx);
    curve(ctx,'M 0 243 C -6 212 2 157 5 135','#3e5643',5.0);
    curve(ctx,'M -1 243 C -6 212 1 157 5 135','#799172',1.3);
    for(const part of leaves)petiole(ctx,part);
    leaves.forEach((part,i)=>leaf(ctx,part,i));
    for(let y=207;y<=214;y+=3)curve(ctx,`M -6 ${y} L 1 ${y-1}`,'#906b51',1.8);
    if(band.state.lead) {
      const y=stemBottom-(stemBottom-stemTop)*band.state.pitch;
      ctx.beginPath();ctx.arc(2,y,5.5,0,Math.PI*2);ctx.strokeStyle='#111';ctx.lineWidth=1.2;ctx.stroke();
    }
    ctx.restore();
  }
  function point(e) {
    const r=canvas.elt.getBoundingClientRect();
    return {x:(e.clientX-r.left-ox)/scale,y:(e.clientY-r.top-oy)/scale};
  }
  function target({x,y}) {
    if(Math.abs(x-3)<14 && y>=stemTop-7 && y<=stemBottom+7)return 'lead';
    if((x/59)**2+((y-242)/10)**2<=1)return 'soil';
    if(Math.abs(x)<(59-(y-242)*.16) && y>=242 && y<=310)return 'drum';
    for(let i=leaves.length-1;i>=0;i--) {
      const part=leaves[i],a=rotation(part,i),dx=x-part.x,dy=y-part.y;
      const u=(Math.cos(a)*dx+Math.sin(a)*dy)/part.sx;
      const v=(-Math.sin(a)*dx+Math.cos(a)*dy)/part.sy;
      if(hitContext.isPointInPath(part.blade,u,v,'evenodd'))return 'chime';
    }
    return null;
  }
  function play(e,part,initial) {
    const {x,y}=point(e),id='plant'+e.pointerId;
    if(part==='chime' && initial)chime(true,id);
    if(part==='lead')lead(true,id,(stemBottom-y)/(stemBottom-stemTop));
    if(part==='soil' && (!initial || manual()))wet((x+56)/112);
    if(part==='drum' && initial)strike(1-Math.min(1,Math.abs(x)/52));
  }
  p.setup=()=>{
    p.pixelDensity(Math.min(window.devicePixelRatio||1,2));canvas=p.createCanvas(1,1);canvas.parent(host);
    canvas.elt.style.touchAction='none';
    canvas.elt.setAttribute('aria-label','Hold a leaf to chime, slide up the stem for pitch, drag across the soil for bass, or tap the pot for drums. The adjacent controls also support keyboard play.');
    p.frameRate(reduceMotion?12:30);
    layout();new ResizeObserver(layout).observe(host);
    window.addEventListener('plantbandstop',()=>pointers.clear());
    canvas.elt.addEventListener('pointerdown',e=>{
      const part=target(point(e));if(e.button!==0||!part)return;
      e.preventDefault();canvas.elt.setPointerCapture(e.pointerId);pointers.set(e.pointerId,part);play(e,part,true);
    });
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.elt.addEventListener(ev,e=>{
      const part=pointers.get(e.pointerId);pointers.delete(e.pointerId);
      if(part==='chime')chime(false,'plant'+e.pointerId);
      if(part==='lead')lead(false,'plant'+e.pointerId);
    });
    canvas.elt.addEventListener('pointermove',e=>{
      const held=pointers.get(e.pointerId),part=held||target(point(e));
      canvas.elt.style.cursor=({lead:'ns-resize',soil:'ew-resize',chime:'pointer',drum:'pointer'})[part]||'default';
      if(held)play(e,held,false);
    });
  };
  p.draw=()=>{p.clear();p.push();p.translate(ox,oy);p.scale(scale);specimen();p.pop();};
},document.getElementById('garden'));
