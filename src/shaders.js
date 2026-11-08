export const vertexShader = /* glsl */`
varying vec2 vUv;
void main() { vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
`;

export const fragmentShader = /* glsl */`
precision highp float;
uniform sampler2D uGarden;
uniform sampler2D uSurface;
uniform vec2 uResolution;
uniform vec2 uLight;
uniform float uTime;
uniform float uRelief;
uniform float uDiffusion;
uniform float uLightPower;
uniform float uWire;
uniform float uMotion;
uniform float uPreset;
uniform float uImageAspect;
varying vec2 vUv;

vec2 imageUV(vec2 uv) {
  float aspect=uResolution.x/uResolution.y;
  vec2 fit=vec2(min(aspect/uImageAspect,1.0),min(uImageAspect/aspect,1.0));
  return (uv-.5)*fit+.5;
}
vec3 garden(vec2 uv, float blur) {
  vec2 pixel=1.0/uResolution;
  vec3 c=texture2D(uGarden,imageUV(uv)).rgb*.20;
  for(int i=0;i<12;i++) {
    float angle=float(i)*2.39996323;
    float radius=sqrt((float(i)+.5)/12.0)*blur;
    c+=texture2D(uGarden,imageUV(uv+vec2(cos(angle),sin(angle))*pixel*radius)).rgb*(.8/12.0);
  }
  return c;
}
void main() {
  vec2 uv=vUv;
  float shorter=min(uResolution.x,uResolution.y);
  vec2 ratio=uResolution/shorter;
  vec2 physical=uv*ratio;
  vec3 surf=texture2D(uSurface,physical*1.12).rgb;
  vec3 finer=texture2D(uSurface,physical*2.31+vec2(.23,.51)).rgb;
  vec2 normal=(surf.rg*2.0-1.0)*.82+(finer.rg*2.0-1.0)*.18;
  float relief=uRelief;
  float wire=uWire;
  float diffusion=uDiffusion;
  if(uPreset>0.5 && uPreset<1.5) wire=0.0;
  if(uPreset>1.5 && uPreset<2.5) {
    normal=vec2(sin(physical.x*520.0)*.55,normal.y*.15);
    wire=0.0;
  }
  if(uPreset>2.5) { relief*=.06; diffusion*=.08; wire=0.0; }
  normal*=relief;
  vec2 parallax=(uLight-vec2(.28,.76))*.012;
  vec2 movement=vec2(sin(uv.y*8.0+uTime*.35),cos(uv.x*7.0+uTime*.22))*.0012*uMotion;
  vec2 refracted=uv+normal*.021/ratio+parallax+movement;
  vec3 color=garden(refracted,1.0+diffusion*8.0);

  // Embedded wire mesh, in physical rather than stretched screen coordinates.
  vec2 gridUv=(physical+normal*.0007)*79.0;
  vec2 edge=abs(fract(gridUv-.5)-.5)/max(fwidth(gridUv),vec2(.001));
  float line=1.0-smoothstep(.05,.72,min(edge.x,edge.y));
  vec2 edge2=abs(fract(gridUv-.5+vec2(.055))-.5)/max(fwidth(gridUv),vec2(.001));
  float shadow=1.0-smoothstep(.05,.60,min(edge2.x,edge2.y));
  color*=1.0-shadow*wire*.32;
  color=mix(color,vec3(.77,.81,.71),line*wire*1.0);

  // The reflected softbox is evaluated with the microscopic glass normal.
  // This gives each pebble its own light/dark rim, not a noise overlay.
  vec2 delta=(uv-uLight)*ratio;
  vec2 bent=delta+normal*.29;
  float broad=exp(-dot(bent/vec2(.60,.70),bent/vec2(.60,.70))*2.0);
  float core=exp(-dot(bent/vec2(.30,.37),bent/vec2(.30,.37))*2.1);
  vec2 topDelta=(uv-(uLight+vec2(-.17,.30)))*ratio+normal*.18;
  float top=exp(-dot(topDelta/vec2(.45,.30),topDelta/vec2(.45,.30))*1.8);
  float fresnel=pow(clamp(length(normal)*1.4,0.0,1.0),2.0);
  float micro=(surf.b-.5)*.14*relief;
  vec3 microNormal=normalize(vec3(normal*1.7,1.0));
  vec3 halfVector=normalize(vec3(-delta*.55,1.0));
  float sparkle=pow(max(dot(microNormal,halfVector),0.0),14.0);
  float sheen=(broad*.54+core*.64+top*.46)*uLightPower*(.76+sparkle*.48);
  sheen+=fresnel*broad*.20*uLightPower;
  color=mix(color,vec3(.97,.974,.956),clamp(sheen,0.0,.95));
  color+=micro*(.15+broad*.70)*uLightPower;
  color+=(normal.x-normal.y)*.11*broad*uLightPower;
  float vignette=1.0-.10*dot((uv-.5)*vec2(1.0,.7),(uv-.5)*vec2(1.0,.7));
  color*=vignette;
  gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}
`;
