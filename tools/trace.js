// node tools/trace.js <car> <drift|stock> <scenario>   — prints a time trace for tuning
require('../physics.js'); const P=globalThis.DriftPhysics; const DT=1/240;
const id=process.argv[2]||'mustang', drift=process.argv[3]!=='stock', sc=process.argv[4]||'hb';
const c=P.makeCar(P.CARS.find(x=>x.id===id),drift); const env={height:()=>0,surface:()=>1};
const S={ // t -> input
 hb:  t=>({steer:t<0.9?1:1,gas:t<0.25?0:1,handbrake:t>0.25&&t<0.6?1:0}),         // handbrake entry, key held into turn
 hb0: t=>({steer:t<0.9?1:0,gas:t<0.25?0:1,handbrake:t>0.25&&t<0.6?1:0}),         // release steering after entry
 pow: t=>({steer:t<0.3?0:1,gas:1,handbrake:0}),                                    // power-over, key held
 trans:t=>({steer:t<3?1:-1,gas:t<0.25?0:1,handbrake:t>0.25&&t<0.6?1:0}),          // switch direction at 3 s
 lift:t=>({steer:t<2.5?1:0,gas:t<0.25||t>2.5?0:1,handbrake:t>0.25&&t<0.6?1:0}),  // lift off at 2.5 s
 turn:t=>({steer:t<0.5?0:1,gas:0.4,handbrake:0}),                                  // plain grip corner, part throttle
};
const v0=sc==='pow'?12:20; c.vx=v0; c.w.fill(v0/c.spec.R); c.gear=2;
for(let i=0;i<240*8;i++){const t=i*DT;
 P.step(c,Object.assign({brake:0,assist:true},S[sc](t)),DT,env);
 if(i%120==0) console.log(t.toFixed(1),'mph',(c.speed*2.237).toFixed(0).padStart(3),'angle',(c.beta*57.3).toFixed(0).padStart(4),'yaw',(c.r*57.3).toFixed(0).padStart(4),'steer',(c.steer*57.3).toFixed(0).padStart(4),'wheel',(c.w[2]*c.spec.R*2.237).toFixed(0).padStart(4),'g',c.gear,'rpm',c.rpm.toFixed(0));}
