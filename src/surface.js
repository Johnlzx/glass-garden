import * as THREE from 'three';

/** A deterministic, tileable height field. This never changes with time:
 * the camera/light changes, while the physical glass surface stays still. */
export function makeSurface(size = 1024) {
  const heights = new Float32Array(size * size);
  const hash = (x, y) => {
    let h = Math.imul(x + 137, 374761393) ^ Math.imul(y + 719, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = t => t * t * (3 - 2 * t);
  for (const [cells, amplitude] of [[64,.09],[128,.20],[256,.40],[512,.23],[1024,.08]]) {
    const grid = new Float32Array(cells * cells);
    for (let y=0;y<cells;y++) for(let x=0;x<cells;x++) grid[y*cells+x]=hash(x+cells,y);
    for(let y=0;y<size;y++) {
      const gy=y/size*cells, iy=Math.floor(gy), fy=smooth(gy-iy);
      for(let x=0;x<size;x++) {
        const gx=x/size*cells, ix=Math.floor(gx), fx=smooth(gx-ix);
        const a=grid[iy*cells+ix], b=grid[iy*cells+(ix+1)%cells];
        const c=grid[((iy+1)%cells)*cells+ix], d=grid[((iy+1)%cells)*cells+(ix+1)%cells];
        heights[y*size+x] += (a+(b-a)*fx+(c-a+(d-c-b+a)*fx)*fy)*amplitude;
      }
    }
  }
  const data = new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const i=y*size+x;
    const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*3.2;
    const dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*3.2;
    data[4*i]=Math.max(0,Math.min(255,Math.round(128+dx*127)));
    data[4*i+1]=Math.max(0,Math.min(255,Math.round(128+dy*127)));
    data[4*i+2]=Math.round(heights[i]*255);
    data[4*i+3]=255;
  }
  const texture = new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=texture.minFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}
