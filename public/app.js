import * as THREE from 'three';

// --- Shaders ---
const face_vert = `
attribute vec3 position;
uniform vec2 px;
uniform vec2 boundarySpace;
varying vec2 uv;
precision highp float;
void main(){
  vec3 pos = position;
  vec2 scale = 1.0 - boundarySpace * 2.0;
  pos.xy = pos.xy * scale;
  uv = vec2(0.5)+(pos.xy)*0.5;
  gl_Position = vec4(pos, 1.0);
}
`;
const line_vert = `
attribute vec3 position;
uniform vec2 px;
precision highp float;
varying vec2 uv;
void main(){
  vec3 pos = position;
  uv = 0.5 + pos.xy * 0.5;
  vec2 n = sign(pos.xy);
  pos.xy = abs(pos.xy) - px * 1.0;
  pos.xy *= n;
  gl_Position = vec4(pos, 1.0);
}
`;
const mouse_vert = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform vec2 center;
uniform vec2 scale;
uniform vec2 px;
varying vUv;
void main(){
  vec2 pos = position.xy * scale * 2.0 * px + center;
  vUv = uv;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;
const advection_frag = `
precision highp float;
uniform sampler2D velocity;
uniform float dt;
uniform bool isBFECC;
uniform vec2 fboSize;
uniform vec2 px;
varying vec2 uv;
void main(){
  vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
  if(isBFECC == false){
    vec2 vel = texture2D(velocity, uv).xy;
    vec2 uv2 = uv - vel * dt * ratio;
    vec2 newVel = texture2D(velocity, uv2).xy;
    gl_FragColor = vec4(newVel, 0.0, 0.0);
  } else {
    vec2 spot_new = uv;
    vec2 vel_old = texture2D(velocity, uv).xy;
    vec2 spot_old = spot_new - vel_old * dt * ratio;
    vec2 vel_new1 = texture2D(velocity, spot_old).xy;
    vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
    vec2 error = spot_new2 - spot_new;
    vec2 spot_new3 = spot_new - error / 2.0;
    vec2 vel_2 = texture2D(velocity, spot_new3).xy;
    vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
    vec2 newVel2 = texture2D(velocity, spot_old2).xy; 
    gl_FragColor = vec4(newVel2, 0.0, 0.0);
  }
}
`;
const color_frag = `
precision highp float;
uniform sampler2D velocity;
uniform sampler2D palette;
uniform vec4 bgColor;
varying vec2 uv;
void main(){
  vec2 vel = texture2D(velocity, uv).xy;
  float lenv = clamp(length(vel), 0.0, 1.0);
  vec3 c = texture2D(palette, vec2(lenv, 0.5)).rgb;
  vec3 outRGB = mix(bgColor.rgb, c, lenv);
  float outA = mix(bgColor.a, 1.0, lenv);
  gl_FragColor = vec4(outRGB, outA);
}
`;
const divergence_frag = `
precision highp float;
uniform sampler2D velocity;
uniform float dt;
uniform vec2 px;
varying vec2 uv;
void main(){
  float x0 = texture2D(velocity, uv-vec2(px.x, 0.0)).x;
  float x1 = texture2D(velocity, uv+vec2(px.x, 0.0)).x;
  float y0 = texture2D(velocity, uv-vec2(0.0, px.y)).y;
  float y1 = texture2D(velocity, uv+vec2(0.0, px.y)).y;
  float divergence = (x1 - x0 + y1 - y0) / 2.0;
  gl_FragColor = vec4(divergence / dt);
}
`;
const externalForce_frag = `
precision highp float;
varying vec2 vUv;
uniform vec2 force;
void main(){
  vec2 circle = (vUv - 0.5) * 2.0;
  float d = 1.0 - min(length(circle), 1.0);
  d *= d;
  gl_FragColor = vec4(force * d, 0.0, 1.0);
}
`;
const poisson_frag = `
precision highp float;
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform vec2 px;
varying vec2 uv;
void main(){
  float p0 = texture2D(pressure, uv + vec2(px.x * 2.0, 0.0)).r;
  float p1 = texture2D(pressure, uv - vec2(px.x * 2.0, 0.0)).r;
  float p2 = texture2D(pressure, uv + vec2(0.0, px.y * 2.0)).r;
  float p3 = texture2D(pressure, uv - vec2(0.0, px.y * 2.0)).r;
  float div = texture2D(divergence, uv).r;
  float newP = (p0 + p1 + p2 + p3) / 4.0 - div;
  gl_FragColor = vec4(newP);
}
`;
const pressure_frag = `
precision highp float;
uniform sampler2D pressure;
uniform sampler2D velocity;
uniform vec2 px;
uniform float dt;
varying vec2 uv;
void main(){
  float step = 1.0;
  float p0 = texture2D(pressure, uv + vec2(px.x * step, 0.0)).r;
  float p1 = texture2D(pressure, uv - vec2(px.x * step, 0.0)).r;
  float p2 = texture2D(pressure, uv + vec2(0.0, px.y * step)).r;
  float p3 = texture2D(pressure, uv - vec2(0.0, px.y * step)).r;
  vec2 v = texture2D(velocity, uv).xy;
  vec2 gradP = vec2(p0 - p1, p2 - p3) * 0.5;
  v = v - gradP * dt;
  gl_FragColor = vec4(v, 0.0, 1.0);
}
`;
const viscous_frag = `
precision highp float;
uniform sampler2D velocity;
uniform sampler2D velocity_new;
uniform float v;
uniform vec2 px;
uniform float dt;
varying vec2 uv;
void main(){
  vec2 old = texture2D(velocity, uv).xy;
  vec2 new0 = texture2D(velocity_new, uv + vec2(px.x * 2.0, 0.0)).xy;
  vec2 new1 = texture2D(velocity_new, uv - vec2(px.x * 2.0, 0.0)).xy;
  vec2 new2 = texture2D(velocity_new, uv + vec2(0.0, px.y * 2.0)).xy;
  vec2 new3 = texture2D(velocity_new, uv - vec2(0.0, px.y * 2.0)).xy;
  vec2 newv = 4.0 * old + v * dt * (new0 + new1 + new2 + new3);
  newv /= 4.0 * (1.0 + v * dt);
  gl_FragColor = vec4(newv, 0.0, 0.0);
}
`;

// --- Core Engine ---
class CommonClass {
  init(container) {
    this.container = container;
    const rect = container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.aspect = this.width / this.height;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x000000, 0);
    this.clock = new THREE.Clock();
    this.time = 0;
  }
  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.renderer.setSize(this.width, this.height);
  }
  update() {
    this.delta = this.clock.getDelta();
    this.time += this.delta;
  }
}
const Common = new CommonClass();

class MouseClass {
  constructor() {
    this.coords = new THREE.Vector2();
    this.coords_old = new THREE.Vector2();
    this.diff = new THREE.Vector2();
    this.isAutoActive = false;
    this.autoIntensity = 2.2;
  }
  init(container) {
    container.addEventListener('mousemove', e => {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      this.coords.set(nx * 2 - 1, -(ny * 2 - 1));
      if (this.onInteract) this.onInteract();
    });
  }
  update() {
    this.diff.subVectors(this.coords, this.coords_old);
    this.coords_old.copy(this.coords);
    if (this.isAutoActive) this.diff.multiplyScalar(this.autoIntensity);
  }
}
const Mouse = new MouseClass();

class AutoDriver {
  constructor(mouse, opts) {
    this.mouse = mouse;
    this.speed = opts.speed;
    this.current = new THREE.Vector2();
    this.target = new THREE.Vector2();
    this.lastTime = performance.now();
    this.pickNewTarget();
  }
  pickNewTarget() {
    this.target.set(Math.random() * 2 - 1, Math.random() * 2 - 1);
  }
  update() {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.1) dt = 0.016;

    const dir = new THREE.Vector2().subVectors(this.target, this.current);
    if (dir.length() < 0.01) this.pickNewTarget();
    else {
      dir.normalize();
      this.current.addScaledVector(dir, this.speed * dt);
      this.mouse.coords.copy(this.current);
      this.mouse.isAutoActive = true;
    }
  }
}

class ShaderPass {
  constructor(props) {
    this.props = props;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.material = new THREE.RawShaderMaterial(props.material);
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.uniforms = this.material.uniforms;
  }
  update() {
    Common.renderer.setRenderTarget(this.props.output);
    Common.renderer.render(this.scene, this.camera);
    Common.renderer.setRenderTarget(null);
  }
}

class Simulation {
  constructor(options) {
    this.options = options;
    this.fboSize = new THREE.Vector2();
    this.cellScale = new THREE.Vector2();
    this.fbos = {};
    this.init();
  }
  init() {
    this.fboSize.set(Common.width * 0.5, Common.height * 0.5);
    this.cellScale.set(1 / this.fboSize.x, 1 / this.fboSize.y);
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter };
    ['vel_0', 'vel_1', 'vel_v0', 'vel_v1', 'div', 'p_0', 'p_1'].forEach(key => {
      this.fbos[key] = new THREE.WebGLRenderTarget(this.fboSize.x, this.fboSize.y, opts);
    });

    this.advection = new ShaderPass({
      material: {
        vertexShader: face_vert, fragmentShader: advection_frag,
        uniforms: { boundarySpace: { value: this.cellScale }, px: { value: this.cellScale }, fboSize: { value: this.fboSize }, velocity: { value: null }, dt: { value: 0.014 }, isBFECC: { value: true } }
      }, output: this.fbos.vel_1
    });

    this.force = new ShaderPass({
      material: {
        vertexShader: mouse_vert, fragmentShader: externalForce_frag, blending: THREE.AdditiveBlending,
        uniforms: { px: { value: this.cellScale }, force: { value: new THREE.Vector2() }, center: { value: new THREE.Vector2() }, scale: { value: new THREE.Vector2(100, 100) } }
      }, output: this.fbos.vel_1
    });

    this.viscous = new ShaderPass({
      material: {
        vertexShader: face_vert, fragmentShader: viscous_frag,
        uniforms: { boundarySpace: { value: this.cellScale }, velocity: { value: null }, velocity_new: { value: null }, v: { value: 30 }, px: { value: this.cellScale }, dt: { value: 0.014 } }
      }, output: this.fbos.vel_v1
    });

    this.divergence = new ShaderPass({
      material: {
        vertexShader: face_vert, fragmentShader: divergence_frag,
        uniforms: { boundarySpace: { value: this.cellScale }, velocity: { value: null }, px: { value: this.cellScale }, dt: { value: 0.014 } }
      }, output: this.fbos.div
    });

    this.poisson = new ShaderPass({
      material: {
        vertexShader: face_vert, fragmentShader: poisson_frag,
        uniforms: { boundarySpace: { value: this.cellScale }, pressure: { value: null }, divergence: { value: null }, px: { value: this.cellScale } }
      }, output: this.fbos.p_1
    });

    this.pressure = new ShaderPass({
      material: {
        vertexShader: face_vert, fragmentShader: pressure_frag,
        uniforms: { boundarySpace: { value: this.cellScale }, pressure: { value: null }, velocity: { value: null }, px: { value: this.cellScale }, dt: { value: 0.014 } }
      }, output: this.fbos.vel_0
    });
  }
  update() {
    this.advection.uniforms.velocity.value = this.fbos.vel_0.texture;
    this.advection.update();

    const fX = (Mouse.diff.x / 2) * 20;
    const fY = (Mouse.diff.y / 2) * 20;
    this.force.uniforms.force.value.set(fX, fY);
    this.force.uniforms.center.value.copy(Mouse.coords);
    this.force.props.output = this.fbos.vel_1;
    this.force.update();

    let vel = this.fbos.vel_1;
    for (let i = 0; i < 32; i++) {
      const isEven = i % 2 === 0;
      this.viscous.uniforms.velocity.value = vel.texture;
      this.viscous.uniforms.velocity_new.value = (isEven ? this.fbos.vel_v0 : this.fbos.vel_v1).texture;
      this.viscous.props.output = isEven ? this.fbos.vel_v1 : this.fbos.vel_v0;
      this.viscous.update();
      vel = this.viscous.props.output;
    }

    this.divergence.uniforms.velocity.value = vel.texture;
    this.divergence.update();

    for (let i = 0; i < 32; i++) {
      const isEven = i % 2 === 0;
      this.poisson.uniforms.divergence.value = this.fbos.div.texture;
      this.poisson.uniforms.pressure.value = (isEven ? this.fbos.p_0 : this.fbos.p_1).texture;
      this.poisson.props.output = isEven ? this.fbos.p_1 : this.fbos.p_0;
      this.poisson.update();
    }
    const press = this.fbos.p_0;

    this.pressure.uniforms.velocity.value = vel.texture;
    this.pressure.uniforms.pressure.value = press.texture;
    this.pressure.update();
  }
}

function initLiquidEther() {
  const ctn = document.getElementById('liquid-ether-bg');
  if (!ctn) return;

  Common.init(ctn);
  Mouse.init(ctn);
  ctn.prepend(Common.renderer.domElement);

  const colors = ['#5227FF', '#FF9FFC', '#B497CF'];
  const data = new Uint8Array(colors.length * 4);
  colors.forEach((hex, i) => {
    const c = new THREE.Color(hex);
    data[i * 4] = c.r * 255; data[i * 4 + 1] = c.g * 255; data[i * 4 + 2] = c.b * 255; data[i * 4 + 3] = 255;
  });
  const palette = new THREE.DataTexture(data, colors.length, 1, THREE.RGBAFormat);
  palette.needsUpdate = true;

  const sim = new Simulation({});
  const outputMaterial = new THREE.RawShaderMaterial({
    vertexShader: face_vert, fragmentShader: color_frag, transparent: true,
    uniforms: { velocity: { value: sim.fbos.vel_0.texture }, palette: { value: palette }, bgColor: { value: new THREE.Vector4(0, 0, 0, 0) }, boundarySpace: { value: new THREE.Vector2() } }
  });
  const outputScene = new THREE.Scene();
  outputScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outputMaterial));
  const camera = new THREE.Camera();

  const driver = new AutoDriver(Mouse, { speed: 0.5 });
  let userActive = false;
  Mouse.onInteract = () => { userActive = true; setTimeout(() => userActive = false, 3000); };

  function loop() {
    if (!userActive) driver.update();
    Mouse.update();
    Common.update();
    sim.update();
    Common.renderer.render(outputScene, camera);
    requestAnimationFrame(loop);
  }
  loop();

  window.addEventListener('resize', () => {
    Common.resize();
    sim.init(); // Simple re-init for resize
  });
}

// --- Initialize App ---
let hunterActive = false;

document.addEventListener('DOMContentLoaded', () => {
  initLiquidEther();
  initStats();
  
  const card = document.querySelector('.glass-card');
  if (card) {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  }
});

async function initStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const counterEl = document.getElementById('visitCounter');
    if (counterEl) counterEl.textContent = data.count.toLocaleString();
  } catch {}
}

window.startRedirect = function() {
  const overlay = document.getElementById('loadingOverlay');
  const status = document.getElementById('statusText');
  overlay.style.display = 'flex';
  const steps = ["SECURING CONNECTION...", "BYPASSING CONGESTION...", "ESTABLISHING HANDSHAKE...", "FINALIZING TUNNEL..."];
  let currentStep = 0;
  const interval = setInterval(() => {
    currentStep++;
    if (currentStep < steps.length) status.textContent = steps[currentStep];
    else { clearInterval(interval); window.location.href = "/entry"; }
  }, 800);
};

window.toggleHunter = function() {
  hunterActive = !hunterActive;
  const btn = document.getElementById('hunterBtn');
  if (hunterActive) {
    btn.textContent = "WAITING FOR SERVER...";
    btn.style.color = "#ff4d4d"; btn.style.borderColor = "#ff4d4d";
    startHunting();
  } else {
    btn.textContent = "USE HUNTER MODE";
    btn.style.color = "#fff"; btn.style.borderColor = "rgba(255,255,255,0.15)";
  }
};

function startHunting() {
  if (!hunterActive) return;
  fetch('/api/ping').then(r => r.json()).then(d => {
    if (d.status === 'online') window.startRedirect();
    else setTimeout(startHunting, 2000);
  }).catch(() => setTimeout(startHunting, 2000));
}
