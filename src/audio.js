/** Quiet procedural garden ambience; starts only after the Sound button gesture. */
export class GardenAudio {
  constructor() { this.enabled=false; this.context=null; this.nodes=[]; }
  async toggle() {
    if(!this.context) {
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context) return false;
      this.context=new Context();
      const c=this.context;
      this.gain=c.createGain(); this.gain.gain.value=0; this.gain.connect(c.destination);
      const buffer=c.createBuffer(1,c.sampleRate*4,c.sampleRate);
      const data=buffer.getChannelData(0); let brown=0;
      for(let i=0;i<data.length;i++) { brown=(brown+Math.random()*.022-.011)/1.015; data[i]=brown; }
      const wind=c.createBufferSource(); wind.buffer=buffer; wind.loop=true;
      const filter=c.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=700;
      wind.connect(filter); filter.connect(this.gain); wind.start(); this.nodes.push(wind,filter);
      const lfo=c.createOscillator(), depth=c.createGain(); lfo.frequency.value=.11; depth.gain.value=180;
      lfo.connect(depth); depth.connect(filter.frequency); lfo.start(); this.nodes.push(lfo,depth);
    }
    await this.context.resume();
    this.enabled=!this.enabled;
    this.gain.gain.setTargetAtTime(this.enabled?.35:0,this.context.currentTime,.35);
    return this.enabled;
  }
  async suspend() { if(this.context) await this.context.suspend(); }
  async resume() { if(this.context&&this.enabled) await this.context.resume(); }
  destroy() { this.nodes.forEach(n=>{try{n.stop?.();n.disconnect();}catch{}}); this.context?.close(); }
}
