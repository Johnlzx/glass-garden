// Reference-derived reflection positions (x, y), with y measured upwards.
// Catmull–Rom interpolation preserves smooth velocity between measured samples.
const keys=[
 [0,.28,.72],[1,.16,.98],[2,.25,1.02],[3,.65,1.02],
 [4,.78,.77],[5,.70,.70],[6,.33,.69],[7,.20,.94],[7.55,.28,.72]
];
export function referenceLight(time, target) {
 const t=((time%7.55)+7.55)%7.55;
 let i=0;while(i<keys.length-2&&keys[i+1][0]<t)i++;
 const a=keys[i],b=keys[i+1],p=keys[i===0?keys.length-2:i-1],n=keys[i+2]||keys[1];
 const u=(t-a[0])/(b[0]-a[0]);
 const cat=(k)=>.5*((2*a[k])+(-p[k]+b[k])*u+(2*p[k]-5*a[k]+4*b[k]-n[k])*u*u+(-p[k]+3*a[k]-3*b[k]+n[k])*u*u*u);
 return target.set(cat(1),cat(2));
}
