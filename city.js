(function () {
  if (!window.AFRAME) return;
  const THREE = window.THREE;
  const DEG = Math.PI / 180;

  // Colours are taken from the "From smart machines to smart cities" lesson photos.
  const palette = {
    navy: "#073b73",
    blue: "#087fc1",
    cyan: "#08a6d4",
    brand: "#03a3d9",
    lightBlue: "#69d1eb",
    white: "#f8fbff",
    asphalt: "#3a4a58",
    concrete: "#e3e9ee",
    grass: "#7cc96b",
    green: "#2d9c61",
    darkGreen: "#167044",
    glass: "#8fd3f0",
    stone: "#ecdcc0",
    tile: "#c0583f",
    tower: "#3f4852",
    pole: "#2b3a47",
    trunk: "#8a6242",
    busTeal: "#5a9aa3",
    yellow: "#f4c843",
    red: "#e2412f"
  };

  const systems = {
    energy: { id: "energy", title: "Clean Power", icon: "☀️", message: "Lebanon gets more than 300 days of sunshine a year! Rooftop solar panels and wind turbines, like the ones in Copenhagen, make clean electricity without smoky diesel generators." },
    traffic: { id: "traffic", title: "Smart Traffic Light", icon: "🚦", message: "Its camera sensor sees the bus waiting and turns green exactly when needed, like the smart lights in Pittsburgh. No more waiting at a red light when nobody is crossing!" },
    waste: { id: "waste", title: "Smart Trash Can", icon: "🗑️", message: "Its sensor measures how full it is and calls the garbage truck before trash spills onto the street, like the smart bins in Singapore." },
    green: { id: "green", title: "Plant-Covered Towers", icon: "🌿", message: "Like the Bosco Verticale in Milan, the trees on these towers clean the air we breathe and keep the buildings cool." },
    home: { id: "home", title: "Smart Home", icon: "🏠", message: "The round smart thermostat learns the temperature people like and changes it automatically to save energy." },
    transport: { id: "transport", title: "Electric Bus", icon: "🚌", message: "Like the new electric buses between Jbeil and Beirut, it runs on 100% clean electricity: quiet, safe and with zero exhaust. Its roof sensor helps it drive by itself!" }
  };

  function add(parent, tag, attrs) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([name, value]) => node.setAttribute(name, value));
    parent.appendChild(node);
    return node;
  }

  function selectTarget(target) {
    if (!target) return;
    document.dispatchEvent(new CustomEvent("smart-system-select", {
      detail: {
        id: target.dataset.system,
        title: target.dataset.title,
        message: target.dataset.message,
        icon: target.dataset.icon,
        element: target
      }
    }));
  }

  // Hit boxes are never drawn (visible: false) but can still be tapped, because
  // THREE.Raycaster ignores material visibility. Drawing them cost a lot of
  // transparent overdraw on tablets.
  const HITBOX_MATERIAL = "color: #45e28b; opacity: 0.33; transparent: true; depthWrite: false; visible: false";

  function targetBox(parent, meta, attrs) {
    const hitbox = add(parent, "a-box", Object.assign({
      class: "smart-target",
      material: HITBOX_MATERIAL
    }, attrs));
    hitbox.dataset.system = meta.id;
    hitbox.dataset.title = meta.title;
    hitbox.dataset.message = meta.message;
    hitbox.dataset.icon = meta.icon;
    hitbox.addEventListener("click", function () { selectTarget(hitbox); });
    return hitbox;
  }

  // ---------------------------------------------------------------------------
  // Geometry batching. Scenery is built with plain three.js and merged into one
  // mesh per material, so the whole city draws in a few dozen calls instead of
  // hundreds of separate A-Frame entities.
  // ---------------------------------------------------------------------------

  function prismGeometry(width, height, depth) {
    // Gable roof: ridge along x, base at y = 0.
    const w = width / 2;
    const d = depth / 2;
    const A = [-w, 0, d], B = [w, 0, d], C = [w, height, 0], D = [-w, height, 0], E = [-w, 0, -d], F = [w, 0, -d];
    const triangles = [A, B, C, A, C, D, F, E, D, F, D, C, B, F, C, A, D, E];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles.flat(), 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  function starGeometry(outer, inner) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 ? inner : outer;
      const angle = i * Math.PI / 5 + Math.PI / 2;
      shape[i ? "lineTo" : "moveTo"](Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  }

  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    cyl: (top, bottom, h, segments) => new THREE.CylinderGeometry(top, bottom, h, segments || 12),
    ball: (r, detail) => new THREE.IcosahedronGeometry(r, detail || 0),
    sphere: (r, segments) => new THREE.SphereGeometry(r, segments || 12, Math.max(6, Math.round((segments || 12) / 2))),
    cone: (r, h, segments) => new THREE.ConeGeometry(r, h, segments || 8),
    ground: (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    halfDisc: (r) => new THREE.CircleGeometry(r, 24, 0, Math.PI).rotateX(-Math.PI / 2),
    prism: prismGeometry,
    star: starGeometry
  };

  function canvasTexture(width, height, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d"), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  function once(make) {
    let value = null;
    return function () { return value || (value = make()); };
  }

  const FONT = "system-ui, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Arabic', Arial, sans-serif";

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexagonPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (60 * i - 90) * DEG;
      ctx[i ? "lineTo" : "moveTo"](cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
  }

  function boltPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + 10 * s, y);
    ctx.lineTo(x - 6 * s, y + 24 * s);
    ctx.lineTo(x + 2 * s, y + 24 * s);
    ctx.lineTo(x - 8 * s, y + 46 * s);
    ctx.lineTo(x + 12 * s, y + 18 * s);
    ctx.lineTo(x + 3 * s, y + 18 * s);
    ctx.lineTo(x + 12 * s, y);
    ctx.closePath();
  }

  const textures = {
    shadow: once(() => canvasTexture(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
      g.addColorStop(0, "rgba(10,30,45,.5)");
      g.addColorStop(.5, "rgba(10,30,45,.3)");
      g.addColorStop(1, "rgba(10,30,45,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    })),
    panel: once(() => canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#eef3f8";
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#3a8ae0");
      g.addColorStop(.5, "#0d4ea3");
      g.addColorStop(1, "#1d68c6");
      ctx.fillStyle = g;
      ctx.fillRect(6, 6, w - 12, h - 12);
      ctx.strokeStyle = "rgba(200,230,255,.6)";
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i += 1) {
        const x = 6 + i * (w - 12) / 4;
        ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, h - 6); ctx.stroke();
      }
      for (let i = 1; i < 6; i += 1) {
        const y = 6 + i * (h - 12) / 6;
        ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 6, y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,.2)";
      ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(70, 6); ctx.lineTo(6, 70); ctx.closePath(); ctx.fill();
    })),
    boardLabel: once(() => canvasTexture(1024, 52, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 34px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MINDSCAPE  ·  SMART CITY", w / 2, h / 2 + 2);
    })),
    thermostat: once(() => canvasTexture(256, 256, (ctx) => {
      const c = 128;
      const bezel = ctx.createLinearGradient(0, 0, 256, 256);
      bezel.addColorStop(0, "#f7f9fb");
      bezel.addColorStop(.5, "#9ca7b0");
      bezel.addColorStop(1, "#e8ecef");
      ctx.fillStyle = bezel;
      ctx.beginPath(); ctx.arc(c, c, 124, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0b1014";
      ctx.beginPath(); ctx.arc(c, c, 104, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      for (let i = 0; i < 48; i += 1) {
        const a = (140 + i * (260 / 47)) * DEG;
        ctx.strokeStyle = i < 16 ? "#ff8a3d" : "#5b6670";
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * 82, c + Math.sin(a) * 82);
        ctx.lineTo(c + Math.cos(a) * 95, c + Math.sin(a) * 95);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText("HEATING", c, c - 40);
      ctx.font = `800 68px ${FONT}`;
      ctx.fillText("19°", c + 8, c + 8);
      ctx.save();
      ctx.translate(c, c + 56);
      ctx.rotate(-.6);
      ctx.fillStyle = "#3ddc6b";
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    })),
    busSide: once(() => canvasTexture(512, 96, (ctx, w, h) => {
      ctx.fillStyle = palette.busTeal;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e4f46b";
      boltPath(ctx, 250, 22, 1.1);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.font = `700 30px ${FONT}`;
      ctx.fillText("مشوارك بأمان وعالطاقة كمان!", w - 22, h / 2 + 2);
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.font = `800 26px ${FONT}`;
      ctx.fillText("E-BUS", 22, h / 2 + 2);
    })),
    busFront: once(() => canvasTexture(128, 32, (ctx, w, h) => {
      ctx.fillStyle = "#0b1115";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#62f0c2";
      ctx.font = `800 20px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡ JBEIL", w / 2, h / 2 + 1);
    })),
    binSticker: once(() => canvasTexture(128, 64, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 2, 2, w - 4, h - 4, 12);
      ctx.fill();
      ctx.fillStyle = "#1e8a4c";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText("♻", w / 2, 20);
      ctx.fillStyle = "#16324a";
      ctx.font = `800 17px ${FONT}`;
      ctx.fillText("SMART BIN", w / 2, 46);
    })),
    truckSide: once(() => canvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#2e9d5b";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 52px ${FONT}`;
      ctx.fillText("♻", w / 2, 50);
      ctx.font = `800 24px ${FONT}`;
      ctx.fillText("CLEAN CITY", w / 2, 100);
    })),
    sunRays: once(() => canvasTexture(256, 256, (ctx) => {
      ctx.translate(128, 128);
      for (let i = 0; i < 12; i += 1) {
        ctx.rotate(Math.PI / 6);
        ctx.fillStyle = i % 2 ? "#ffb627" : "#ffd23f";
        ctx.beginPath(); ctx.moveTo(-15, -70); ctx.lineTo(0, -124); ctx.lineTo(15, -70); ctx.closePath(); ctx.fill();
      }
    })),
    sunFace: once(() => canvasTexture(256, 256, (ctx) => {
      const g = ctx.createRadialGradient(110, 104, 10, 128, 128, 74);
      g.addColorStop(0, "#fff3a0");
      g.addColorStop(1, "#ffc21a");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(128, 128, 72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6b3b0a";
      ctx.beginPath(); ctx.arc(104, 118, 8, 0, Math.PI * 2); ctx.arc(152, 118, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,120,90,.55)";
      ctx.beginPath(); ctx.arc(90, 142, 11, 0, Math.PI * 2); ctx.arc(166, 142, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#6b3b0a";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(128, 134, 24, .2 * Math.PI, .8 * Math.PI); ctx.stroke();
    })),
    badge: (icon) => canvasTexture(256, 256, (ctx) => {
      ctx.shadowColor = "rgba(0,40,70,.35)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = palette.brand;
      hexagonPath(ctx, 128, 128, 112);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 12;
      ctx.strokeStyle = "#ffffff";
      hexagonPath(ctx, 128, 128, 100);
      ctx.stroke();
      ctx.font = `110px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, 128, 136);
    })
  };

  const MATERIALS = {
    matte: { make: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: 0 }) },
    shiny: { make: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .35, metalness: .25 }) },
    glass: { make: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .15, metalness: .1, emissive: new THREE.Color("#1d6f9a"), emissiveIntensity: .35 }) },
    glow: { make: () => new THREE.MeshBasicMaterial({ vertexColors: true }) },
    panel: { uv: true, make: () => new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.panel(), roughness: .3, metalness: .15 }) },
    shadow: { uv: true, make: () => new THREE.MeshBasicMaterial({ map: textures.shadow(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) }
  };
  const materialCache = {};
  function sharedMaterial(kind) {
    return materialCache[kind] || (materialCache[kind] = MATERIALS[kind].make());
  }

  const tmpMatrix = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  function Batch() { this.parts = {}; }

  // options: p = [x, y, z], r = [rx, ry, rz] in degrees, s = number or [sx, sy, sz],
  // kind = material name, flat = faceted low-poly shading.
  Batch.prototype.add = function (geometry, color, options) {
    const o = options || {};
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const p = o.p || [0, 0, 0];
    const r = o.r || [0, 0, 0];
    const s = o.s == null ? 1 : o.s;
    tmpPos.set(p[0], p[1], p[2]);
    tmpQuat.setFromEuler(tmpEuler.set(r[0] * DEG, r[1] * DEG, r[2] * DEG));
    if (Array.isArray(s)) tmpScale.set(s[0], s[1], s[2]); else tmpScale.set(s, s, s);
    g.applyMatrix4(tmpMatrix.compose(tmpPos, tmpQuat, tmpScale));
    if (o.flat) g.computeVertexNormals();
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    tmpColor.set(color || "#ffffff");
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const kind = o.kind || "matte";
    (this.parts[kind] = this.parts[kind] || []).push(g);
    return this;
  };

  Batch.prototype.shadow = function (x, z, w, d, y) {
    return this.add(G.ground(w, d), "#ffffff", { kind: "shadow", p: [x, (y || 0) + .004, z] });
  };

  Batch.prototype.build = function () {
    const group = new THREE.Group();
    Object.keys(this.parts).forEach((kind) => {
      const mesh = new THREE.Mesh(mergeGeometries(this.parts[kind], MATERIALS[kind].uv), sharedMaterial(kind));
      group.add(mesh);
    });
    this.parts = {};
    return group;
  };

  function mergeGeometries(list, withUv) {
    let total = 0;
    list.forEach((g) => { total += g.attributes.position.count; });
    const position = new Float32Array(total * 3);
    const normal = new Float32Array(total * 3);
    const color = new Float32Array(total * 3);
    const uv = withUv ? new Float32Array(total * 2) : null;
    let offset = 0;
    list.forEach((g) => {
      position.set(g.attributes.position.array, offset * 3);
      normal.set(g.attributes.normal.array, offset * 3);
      color.set(g.attributes.color.array, offset * 3);
      if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, offset * 2);
      offset += g.attributes.position.count;
      g.dispose();
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    merged.setAttribute("color", new THREE.BufferAttribute(color, 3));
    if (uv) merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    return merged;
  }

  function place(object, o) {
    const p = o.p || [0, 0, 0];
    const r = o.r || [0, 0, 0];
    object.position.set(p[0], p[1], p[2]);
    object.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
    if (o.s) object.scale.setScalar(o.s);
    return object;
  }

  function labelMesh(texture, width, height, options) {
    const o = options || {};
    const params = { map: texture, transparent: !!o.transparent, alphaTest: o.transparent ? .02 : 0 };
    const material = o.glow ? new THREE.MeshBasicMaterial(params) : new THREE.MeshStandardMaterial(Object.assign(params, { roughness: .7 }));
    return place(new THREE.Mesh(new THREE.PlaneGeometry(width, height), material), o);
  }

  const ringMaterial = once(() => new THREE.MeshBasicMaterial({ color: palette.lightBlue, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));

  function pulseRing(parent, radius, options, life) {
    const o = options || {};
    const mesh = place(new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 1.7, 24), o.material || ringMaterial()), o);
    parent.add(mesh);
    const phase = Math.random() * 6;
    life.push((t) => { mesh.scale.setScalar(1 + .28 * Math.sin(t * 4.2 + phase)); });
    return mesh;
  }

  function seeded(seed) {
    let a = seed;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tree(b, x, z, size, y0, type, color) {
    const s = size || 1;
    const y = y0 || 0;
    if (type === "pine") {
      b.add(G.cyl(.045 * s, .06 * s, .3 * s, 6), palette.trunk, { p: [x, y + .15 * s, z] });
      b.add(G.cone(.34 * s, .55 * s, 7), color || "#2f8a4a", { p: [x, y + .5 * s, z], flat: true });
      b.add(G.cone(.26 * s, .45 * s, 7), color || "#3fa35a", { p: [x, y + .8 * s, z], flat: true });
    } else {
      b.add(G.cyl(.05 * s, .07 * s, .42 * s, 6), palette.trunk, { p: [x, y + .21 * s, z] });
      b.add(G.ball(.3 * s, 1), color || "#3fa556", { p: [x, y + .6 * s, z], flat: true });
      b.add(G.ball(.2 * s, 1), color || "#56b865", { p: [x + .12 * s, y + .82 * s, z + .05 * s], flat: true });
    }
    b.shadow(x - .05, z - .05, .8 * s, .8 * s, y);
  }

  function streetLamp(b, x, z, y0) {
    const y = y0 || 0;
    b.add(G.cyl(.022, .03, 1.0, 6), palette.pole, { p: [x, y + .5, z] });
    b.add(G.cone(.09, .07, 8), palette.pole, { p: [x, y + 1.1, z] });
    b.add(G.sphere(.065, 10), "#fff1b0", { kind: "glow", p: [x, y + 1.02, z] });
  }

  function windowPane(b, p, w, h, ry) {
    b.add(G.box(w + .05, h + .05, .02), palette.white, { p, r: [0, ry || 0, 0] });
    b.add(G.box(w, h, .03), palette.glass, { kind: "glass", p, r: [0, ry || 0, 0] });
  }

  function wheel(b, x, y, z, r) {
    b.add(G.cyl(r, r, .08, 12), "#151d23", { p: [x, y, z], r: [90, 0, 0] });
    b.add(G.cyl(r * .45, r * .45, .09, 8), "#9aa6ae", { p: [x, y, z], r: [90, 0, 0] });
  }

  // ---------------------------------------------------------------------------
  // City pieces
  // ---------------------------------------------------------------------------

  function buildGround(city) {
    const b = new Batch();
    // Toy-like plinth in the Mindscape blue so the city looks like a model on the desk.
    b.add(G.box(8.4, .22, 8.4), palette.brand, { p: [0, -.17, 0] });
    b.add(G.box(8.5, .05, 8.5), "#0284b8", { p: [0, -.255, 0] });
    b.add(G.box(8.4, .06, 8.4), palette.grass, { p: [0, -.03, 0] });

    [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3]].forEach(([x, z]) => b.add(G.box(3.2, .06, 3.2), palette.concrete, { p: [x, .03, z] }));

    b.add(G.box(1.32, .03, 8.4), palette.asphalt, { p: [0, .015, 0] });
    b.add(G.box(8.4, .03, 1.32), palette.asphalt, { p: [0, .0152, 0] });
    for (let i = 1.8; i < 4.1; i += .6) {
      [-1, 1].forEach((side) => {
        b.add(G.box(.32, .006, .05), palette.white, { p: [side * i, .033, 0] });
        b.add(G.box(.05, .006, .32), palette.white, { p: [0, .033, side * i] });
      });
    }
    [-.5, -.3, -.1, .1, .3, .5].forEach((offset) => {
      [-1.05, 1.05].forEach((d) => {
        b.add(G.box(.12, .006, .6), palette.white, { p: [offset, .033, d] });
        b.add(G.box(.6, .006, .12), palette.white, { p: [d, .033, offset] });
      });
    });
    b.add(G.box(.06, .006, .6), palette.white, { p: [-1.45, .033, .33] });
    b.add(G.box(.06, .006, .6), palette.white, { p: [1.45, .033, -.33] });

    [[-3.6, -1.0, .95, .06, "pine"], [-3.62, 1.05, .9, .06, "pine"], [-3.6, 3.6, 1, .06], [-1.1, 3.62, .85, .06],
      [1.2, -3.6, .9, .06, "pine"], [3.62, -3.62, .8, .06], [3.75, 1.0, .9, 0], [3.72, 3.72, 1, 0, "pine"],
      [1.05, 3.72, .85, 0], [-4.0, -4.0, .7, 0, "pine"], [4.0, -2.2, .7, 0, "pine"], [-4.0, 2.2, .7, 0]
    ].forEach(([x, z, s, y, type]) => tree(b, x, z, s, y, type));

    [[-2.9, .84, .06], [2.9, -.84, .06], [-.84, -2.9, .06], [.84, 3.0, 0]].forEach(([x, z, y]) => streetLamp(b, x, z, y));
    city.content.add(b.build());

    const label = textures.boardLabel();
    const labelMat = new THREE.MeshBasicMaterial({ map: label, transparent: true, alphaTest: .05 });
    [[0, 4.202, 0], [0, -4.202, 180], [4.202, 0, 90], [-4.202, 0, -90]].forEach(([x, z, ry]) => {
      city.content.add(place(new THREE.Mesh(new THREE.PlaneGeometry(4.2, .21), labelMat), { p: [x, -.16, z], r: [0, ry, 0] }));
    });
  }

  function buildEnergy(city) {
    // Lebanese stone house with a red tile roof covered in solar panels.
    const house = city.systemEntity("energy", -2.25, .06, -2.15);
    const b = new Batch();
    b.add(G.box(1.9, .95, 1.4), palette.stone, { p: [0, .475, 0] });
    b.add(G.box(1.94, .05, 1.44), "#d8c29d", { p: [0, .025, 0] });
    b.add(G.prism(2.12, .55, 1.62), palette.tile, { p: [0, .95, 0] });
    b.add(G.box(.34, .6, .03), "#7b4a2e", { p: [.5, .3, .71] });
    windowPane(b, [-.45, .56, .71], .42, .3);
    windowPane(b, [-.45, .56, -.71], .42, .3);
    windowPane(b, [.45, .56, -.71], .42, .3);
    windowPane(b, [.96, .56, 0], .36, .3, 90);
    windowPane(b, [-.96, .56, 0], .36, .3, 90);

    const slope = Math.atan2(.55, .81);
    const along = [0, -Math.sin(slope), Math.cos(slope)];
    const normal = [0, Math.cos(slope), Math.sin(slope)];
    [-.17, .17].forEach((s) => {
      [-.64, 0, .64].forEach((x) => {
        const y = .95 + .275 + along[1] * s + normal[1] * .03;
        const z = .405 + along[2] * s + normal[2] * .03;
        b.add(G.box(.58, .03, .32), "#ffffff", { kind: "panel", p: [x, y, z], r: [slope / DEG, 0, 0] });
      });
    });
    [-.65, 0, .65].forEach((x) => {
      b.add(G.box(.05, .26, .05), palette.pole, { p: [x, .13, 1.12] });
      b.add(G.box(.58, .03, .36), "#ffffff", { kind: "panel", p: [x, .3, 1.1], r: [28, 0, 0] });
    });
    b.shadow(-.1, -.05, 2.8, 2.3);
    house.object3D.add(b.build());
    targetBox(house, systems.energy, { position: "0 .8 .25", width: "2.3", height: "1.7", depth: "2.2" });

    // Tall, slender turbines like the Copenhagen photo.
    [[-3.5, -3.5, 2.7, 1.9], [-1.15, -3.55, 2.3, 2.3]].forEach(([x, z, h, speed]) => {
      const turbine = city.systemEntity("energy", x, .06, z);
      const tb = new Batch();
      tb.add(G.cyl(.11, .13, .05, 10), palette.concrete, { p: [0, .025, 0] });
      tb.add(G.cyl(.035, .075, h, 10), palette.white, { p: [0, h / 2, 0] });
      tb.add(G.box(.14, .13, .32), palette.white, { p: [0, h + .03, -.01] });
      tb.shadow(-.08, -.08, .6, .6);
      turbine.object3D.add(tb.build());

      const rotor = new THREE.Group();
      rotor.position.set(0, h + .03, .18);
      const rb = new Batch();
      rb.add(G.sphere(.065, 10), palette.concrete, { s: [1, 1, 1.3] });
      [0, 120, 240].forEach((a) => {
        rb.add(G.box(.07, .74, .02), palette.white, { p: [-Math.sin(a * DEG) * .4, Math.cos(a * DEG) * .4, 0], r: [0, 0, a] });
      });
      rotor.add(rb.build());
      turbine.object3D.add(rotor);
      city.life.push((t, dt) => { rotor.rotation.z -= dt * speed; });
      targetBox(turbine, systems.energy, { position: `0 ${(h + .8) / 2} .1`, width: "1.6", height: `${h + .8}`, depth: ".6" });
    });
  }

  function buildForest(city) {
    // Twin towers covered in trees, like the Bosco Verticale in Milan.
    const el = city.systemEntity("green", 2.45, .06, -2.15);
    const b = new Batch();
    const rand = seeded(7);
    const plants = ["#2f7d3b", "#3f9444", "#5aa845", "#7cb342", "#1f6b3a", "#9bbf3c", "#c7b83a"];
    const pick = () => plants[Math.floor(rand() * plants.length)];

    function tower(cx, cz, size, floors) {
      const floorHeight = .4;
      const h = floors * floorHeight + .1;
      b.add(G.box(size, h, size), palette.tower, { p: [cx, h / 2, cz] });
      for (let f = 0; f < floors; f += 1) {
        const y = .12 + f * floorHeight;
        b.add(G.box(size + .012, .16, size + .012), "#6fb6d8", { kind: "glass", p: [cx, y + .2, cz] });
        for (let side = 0; side < 4; side += 1) {
          const nx = [0, 1, 0, -1][side];
          const nz = [1, 0, -1, 0][side];
          const tx = nz;
          const tz = -nx;
          const len = size * (.55 + rand() * .5);
          const off = (rand() - .5) * (size - len);
          const slab = side % 2 === 0 ? G.box(len, .05, .22) : G.box(.22, .05, len);
          b.add(slab, palette.white, { p: [cx + nx * (size / 2 + .11) + tx * off, y + .02, cz + nz * (size / 2 + .11) + tz * off] });
          const count = 2 + Math.floor(rand() * 2);
          for (let k = 0; k < count; k += 1) {
            const pos = off + (k / (count - 1) - .5) * (len - .16);
            const px = cx + nx * (size / 2 + .14) + tx * pos;
            const pz = cz + nz * (size / 2 + .14) + tz * pos;
            const r = .09 + rand() * .08;
            b.add(G.ball(r, 0), pick(), { p: [px, y + .06 + r * .8, pz], r: [rand() * 90, rand() * 90, 0], flat: true });
            if (rand() < .35) b.add(G.cone(.05, .22, 5), pick(), { p: [px + nx * .06, y - .08, pz + nz * .06], r: [180, 0, 0], flat: true });
          }
        }
      }
      b.add(G.box(size + .04, .06, size + .04), palette.white, { p: [cx, h + .03, cz] });
      b.add(G.ball(.22, 1), pick(), { p: [cx - size * .2, h + .25, cz], flat: true });
      b.add(G.ball(.18, 1), pick(), { p: [cx + size * .22, h + .2, cz + size * .15], flat: true });
      b.shadow(cx - .12, cz - .12, size + 1, size + 1);
    }

    tower(-.6, -.5, .95, 7);
    tower(.7, .55, .85, 5);
    el.object3D.add(b.build());
    targetBox(el, systems.green, { position: "0 1.65 0", width: "2.8", height: "3.3", depth: "2.5" });
  }

  function buildHome(city) {
    const el = city.systemEntity("home", -2.3, .06, 2.45);
    const b = new Batch();
    b.add(G.box(1.74, .08, 1.44), "#cfd8df", { p: [0, .04, 0] });
    b.add(G.box(1.7, 1.05, 1.4), "#fbfcfa", { p: [0, .525, 0] });
    b.add(G.prism(1.92, .62, 1.62), palette.navy, { p: [0, 1.05, 0] });
    b.add(G.box(.34, .62, .03), palette.cyan, { p: [.45, .31, -.71] });
    b.add(G.sphere(.025, 8), palette.yellow, { p: [.34, .32, -.73] });
    windowPane(b, [-.55, .62, -.71], .36, .34);
    windowPane(b, [-.4, .62, .71], .42, .34);
    windowPane(b, [.4, .62, .71], .42, .34);
    windowPane(b, [.86, .62, 0], .4, .34, 90);
    windowPane(b, [-.86, .62, 0], .4, .34, 90);
    // Flower bed in front of the house.
    b.add(G.box(1.1, .08, .2), "#7a5a3c", { p: [-.25, .04, -.95] });
    ["#ff6b8b", "#ffd23f", "#ff8a3d", "#c86bff", "#ff6b8b", "#ffd23f"].forEach((color, i) => {
      b.add(G.ball(.05, 0), color, { p: [-.7 + i * .18, .12, -.95], flat: true });
    });
    b.shadow(-.1, -.05, 2.3, 2.0);
    el.object3D.add(b.build());

    // Round smart thermostat, like the one in the lesson photo.
    el.object3D.add(labelMesh(textures.thermostat(), .44, .44, { glow: true, transparent: true, p: [-.05, .6, -.717], r: [0, 180, 0] }));
    pulseRing(el.object3D, .17, { p: [-.05, .6, -.714], r: [0, 180, 0] }, city.life);
    targetBox(el, systems.home, { position: "0 .9 -.1", width: "2.1", height: "1.9", depth: "1.9" });
  }

  function kid(b, x, y, z, shirt, skin, hair) {
    b.add(G.box(.07, .05, .16), "#2c4a7a", { p: [x - .04, y + .02, z - .05] });
    b.add(G.box(.07, .05, .16), "#2c4a7a", { p: [x + .04, y + .02, z - .05] });
    b.add(G.cyl(.07, .08, .2, 8), shirt, { p: [x, y + .14, z + .03] });
    b.add(G.sphere(.075, 10), skin, { p: [x, y + .31, z + .03] });
    b.add(G.sphere(.078, 10), hair, { p: [x, y + .335, z + .045], s: [1, .7, 1] });
  }

  function buildPark(city) {
    // Playground like the lesson photo: yellow floor, blue zone, red star, blue swings.
    const park = new THREE.Group();
    park.position.set(2.35, 0, 2.35);
    const b = new Batch();
    b.add(G.cyl(1.35, 1.35, .03, 32), palette.yellow, { p: [0, .015, 0] });
    b.add(G.halfDisc(1.2), "#2b8fd6", { p: [0, .032, 0], r: [0, 30, 0] });
    b.add(G.star(.38, .16), palette.red, { p: [.3, .034, .6] });
    const frame = "#1f6fc9";
    [-.8, .8].forEach((x) => {
      b.add(G.cyl(.03, .03, 1.45, 6), frame, { p: [x, .69, .225], r: [-18, 0, 0] });
      b.add(G.cyl(.03, .03, 1.45, 6), frame, { p: [x, .69, -.225], r: [18, 0, 0] });
    });
    b.add(G.cyl(.035, .035, 1.7, 8), frame, { p: [0, 1.38, 0], r: [0, 0, 90] });
    b.add(G.box(.6, .05, .18), "#b07a45", { p: [-.45, .22, 1.02] });
    [-.7, -.2].forEach((x) => b.add(G.box(.04, .2, .14), palette.pole, { p: [x, .1, 1.02] }));
    b.shadow(-.05, -.05, 2.2, 1.2, .034);
    park.add(b.build());

    [[-.38, "#ef5c55", "#f2c6a0", "#3b2616", 0], [.38, "#23b27a", "#8d5a3b", "#1b120b", 1.3]].forEach(([x, shirt, skin, hair, phase]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.38, 0);
      const sb = new Batch();
      sb.add(G.cyl(.012, .012, .88, 4), palette.white, { p: [-.1, -.44, 0] });
      sb.add(G.cyl(.012, .012, .88, 4), palette.white, { p: [.1, -.44, 0] });
      sb.add(G.box(.28, .04, .2), palette.cyan, { p: [0, -.9, 0] });
      kid(sb, 0, -.88, 0, shirt, skin, hair);
      pivot.add(sb.build());
      park.add(pivot);
      city.life.push((t) => { pivot.rotation.x = Math.sin(t * 2.3 + phase) * .42; });
    });
    city.content.add(park);
  }

  function buildTraffic(city) {
    const lampColors = {
      red: ["#ff3b30", "#4d1f1c"],
      yellow: ["#ffcc33", "#4d3f18"],
      green: ["#3cf07f", "#173d26"]
    };
    const lamps = {};
    Object.keys(lampColors).forEach((key) => { lamps[key] = new THREE.MeshBasicMaterial({ color: lampColors[key][1] }); });
    const lens = new THREE.MeshBasicMaterial({ color: palette.cyan });
    const sensorRing = new THREE.MeshBasicMaterial({ color: palette.lightBlue, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false });
    const rings = [];

    function trafficLight(x, z, ry) {
      const el = city.systemEntity("traffic", x, .06, z, ry);
      const b = new Batch();
      b.add(G.cyl(.1, .12, .05, 8), palette.pole, { p: [0, .025, 0] });
      b.add(G.cyl(.04, .05, 1.75, 8), palette.pole, { p: [0, .875, 0] });
      b.add(G.box(.3, .8, .26), "#18232c", { p: [0, 1.95, 0] });
      b.add(G.box(.42, .92, .03), "#0f171d", { p: [0, 1.95, -.14] });
      [.25, 0, -.25].forEach((y) => b.add(G.box(.22, .025, .12), "#0f171d", { p: [0, 1.95 + y + .11, .18] }));
      // The camera "eye" that lets the light see the traffic.
      b.add(G.box(.16, .1, .2), palette.white, { p: [0, 1.38, .1] });
      b.shadow(-.05, -.05, .5, .5);
      el.object3D.add(b.build());
      [["red", .25], ["yellow", 0], ["green", -.25]].forEach(([key, y]) => {
        el.object3D.add(place(new THREE.Mesh(G.cyl(.085, .085, .03, 16), lamps[key]), { p: [0, 1.95 + y, .135], r: [90, 0, 0] }));
      });
      el.object3D.add(place(new THREE.Mesh(G.cyl(.035, .035, .02, 12), lens), { p: [0, 1.38, .205], r: [90, 0, 0] }));
      const ring = place(new THREE.Mesh(new THREE.RingGeometry(.05, .065, 20), sensorRing), { p: [0, 1.38, .22] });
      el.object3D.add(ring);
      rings.push(ring);
      targetBox(el, systems.traffic, { position: "0 1.2 0", width: ".7", height: "2.4", depth: ".7" });
    }

    trafficLight(-.98, .98, -90);
    trafficLight(.98, -.98, 90);

    // The electric bus drives up and down the main road. The smart lights stay red
    // until their camera sees the bus waiting, then turn green just for it.
    const busEl = city.systemEntity("transport", -3.25, .03, .33);
    const bus = busEl.object3D;
    const b = new Batch();
    [[-.5, .29], [.5, .29], [-.5, -.29], [.5, -.29]].forEach(([x, z]) => wheel(b, x, .13, z, .13));
    b.add(G.box(1.6, .3, .6), palette.busTeal, { p: [0, .3, 0] });
    b.add(G.box(1.58, .3, .58), "#111a20", { kind: "shiny", p: [0, .6, 0] });
    b.add(G.box(1.6, .07, .6), palette.white, { p: [0, .785, 0] });
    b.add(G.box(.5, .1, .42), palette.white, { p: [-.35, .87, 0] });
    b.add(G.box(.5, .1, .42), palette.white, { p: [.3, .87, 0] });
    b.add(G.cyl(.06, .07, .07, 10), "#1d2830", { p: [.66, .855, 0] });
    b.add(G.cyl(.066, .066, .02, 12), palette.cyan, { kind: "glow", p: [.66, .9, 0] });
    b.add(G.box(.02, .06, .12), "#fff6c8", { kind: "glow", p: [.805, .3, .2] });
    b.add(G.box(.02, .06, .12), "#fff6c8", { kind: "glow", p: [.805, .3, -.2] });
    b.add(G.box(.02, .06, .1), "#ff4a3d", { kind: "glow", p: [-.805, .3, .2] });
    b.add(G.box(.02, .06, .1), "#ff4a3d", { kind: "glow", p: [-.805, .3, -.2] });
    b.shadow(0, 0, 2.0, 1.0);
    bus.add(b.build());
    bus.add(labelMesh(textures.busFront(), .5, .125, { glow: true, p: [.806, .69, 0], r: [0, 90, 0] }));
    bus.add(labelMesh(textures.busSide(), 1.5, .28, { p: [0, .3, .302] }));
    bus.add(labelMesh(textures.busSide(), 1.5, .28, { p: [0, .3, -.302], r: [0, 180, 0] }));
    targetBox(busEl, systems.transport, { position: "0 .5 0", width: "1.8", height: "1.1", depth: ".8" });
    city.badgeSpots.transport = { parent: bus, p: [0, 1.5, 0] };

    const LANE = .33;
    const END = 3.25;
    const STOP = 2.3;
    const SPEED = .9;
    const state = { dir: 1, x: -END, mode: "drive", u: 0 };
    const light = { state: "", timer: 0 };

    function setLight(next) {
      light.state = next;
      const on = next === "detect" ? "red" : next;
      Object.keys(lamps).forEach((key) => lamps[key].color.set(lampColors[key][key === on ? 0 : 1]));
      lens.color.set(next === "detect" ? "#ffffff" : palette.cyan);
    }
    setLight("red");

    city.life.push((t, dt) => {
      if (light.state === "detect" || light.state === "yellow") {
        light.timer -= dt;
        if (light.timer <= 0) setLight(light.state === "detect" ? "green" : "red");
      }
      const detecting = light.state === "detect";
      rings.forEach((ring) => ring.scale.setScalar(detecting ? 1.6 + Math.sin(t * 18) * .5 : 1 + .25 * Math.sin(t * 4)));

      if (state.mode === "turn") {
        state.u = Math.min(1, state.u + dt / 1.3);
        const a = state.u * Math.PI;
        if (state.dir === 1) {
          bus.position.set(END + LANE * Math.sin(a), .03, LANE * Math.cos(a));
          bus.rotation.y = a;
        } else {
          bus.position.set(-END - LANE * Math.sin(a), .03, -LANE * Math.cos(a));
          bus.rotation.y = Math.PI + a;
        }
        if (state.u >= 1) {
          state.dir = -state.dir;
          state.x = state.dir * -END;
          state.mode = "drive";
        }
        return;
      }

      const step = SPEED * dt;
      const progress = state.dir * state.x;
      if (state.mode === "wait") {
        if (light.state === "red") { setLight("detect"); light.timer = .9; }
        if (light.state === "green") state.mode = "drive";
      } else if (light.state !== "green" && progress < -STOP && progress + step >= -STOP) {
        state.x = state.dir * -STOP;
        state.mode = "wait";
      }
      if (state.mode === "drive") {
        state.x += state.dir * step;
        const now = state.dir * state.x;
        if (light.state === "green" && now > 1.9) { setLight("yellow"); light.timer = 1; }
        if (now >= END) { state.x = state.dir * END; state.mode = "turn"; state.u = 0; }
      }
      bus.position.set(state.x, .03, state.dir * LANE);
      bus.rotation.y = state.dir === 1 ? 0 : Math.PI;
    });
  }

  function buildWaste(city) {
    // The bin fills up, its sensor turns red and "calls" the garbage truck,
    // which drives over, empties it and backs away again.
    const el = city.systemEntity("waste", .95, 0, 1.85);
    const bin = el.object3D;
    const b = new Batch();
    b.add(G.cyl(.36, .36, .03, 16), palette.concrete, { p: [0, .015, 0] });
    b.add(G.cyl(.26, .24, .62, 16), "#8a979f", { kind: "shiny", p: [0, .34, 0] });
    b.add(G.cyl(.265, .265, .03, 16), "#56636b", { p: [0, .2, 0] });
    b.add(G.cyl(.265, .265, .03, 16), "#56636b", { p: [0, .52, 0] });
    b.add(G.box(.02, .46, .1), "#1b252c", { p: [-.258, .36, 0] });
    b.shadow(-.05, -.05, .8, .8);
    bin.add(b.build());
    bin.add(labelMesh(textures.binSticker(), .26, .13, { p: [0, .36, -.262], r: [0, 180, 0] }));

    const fillMaterial = new THREE.MeshBasicMaterial({ color: "#3cf07f" });
    const fill = place(new THREE.Mesh(G.box(.024, .4, .07), fillMaterial), { p: [-.266, .36, 0] });
    bin.add(fill);

    const lid = new THREE.Group();
    lid.position.set(.26, .66, 0);
    const lb = new Batch();
    lb.add(G.cyl(.29, .28, .07, 16), "#26323b", { p: [-.26, .035, 0] });
    lb.add(G.sphere(.12, 12), "#26323b", { p: [-.26, .07, 0], s: [1, .45, 1] });
    lid.add(lb.build());
    const sensorMaterial = new THREE.MeshBasicMaterial({ color: palette.cyan });
    lid.add(place(new THREE.Mesh(G.sphere(.05, 12), sensorMaterial), { p: [-.26, .14, 0] }));
    pulseRing(lid, .06, { p: [-.26, .14, 0], r: [-90, 0, 0] }, city.life);
    bin.add(lid);

    const waves = [0, 1, 2].map(() => {
      const material = new THREE.MeshBasicMaterial({ color: "#ff5a4e", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const mesh = place(new THREE.Mesh(new THREE.RingGeometry(.14, .17, 24), material), { p: [0, .9, 0], r: [-90, 0, 0] });
      mesh.visible = false;
      bin.add(mesh);
      return mesh;
    });
    targetBox(el, systems.waste, { position: "0 .45 0", width: ".8", height: "1", depth: ".8" });

    const truckEl = add(city.contentEl, "a-entity", {});
    const truck = truckEl.object3D;
    const PARK = 3.45;
    const STOPZ = 1.85;
    truck.position.set(.33, .03, PARK);
    truck.rotation.y = Math.PI / 2;
    const tb = new Batch();
    [[-.3, .22], [.3, .22], [-.3, -.22], [.3, -.22]].forEach(([x, z]) => wheel(tb, x, .1, z, .1));
    tb.add(G.box(.3, .36, .46), palette.white, { p: [.3, .3, 0] });
    tb.add(G.box(.02, .14, .38), palette.glass, { kind: "glass", p: [.451, .38, 0] });
    tb.add(G.box(.62, .44, .48), "#2e9d5b", { p: [-.16, .36, 0] });
    tb.add(G.box(.64, .04, .5), "#23804a", { p: [-.16, .6, 0] });
    tb.add(G.box(.08, .04, .08), "#ff9d2e", { kind: "glow", p: [.3, .5, 0] });
    tb.add(G.box(.02, .05, .08), "#fff6c8", { kind: "glow", p: [.451, .2, .15] });
    tb.add(G.box(.02, .05, .08), "#fff6c8", { kind: "glow", p: [.451, .2, -.15] });
    tb.shadow(0, 0, 1.2, .8);
    const truckBody = new THREE.Group();
    truckBody.add(tb.build());
    truckBody.add(labelMesh(textures.truckSide(), .5, .25, { p: [-.16, .36, .241] }));
    truckBody.add(labelMesh(textures.truckSide(), .5, .25, { p: [-.16, .36, -.241], r: [0, 180, 0] }));
    truck.add(truckBody);

    const green = new THREE.Color("#3cf07f");
    const amber = new THREE.Color("#ffcc33");
    const red = new THREE.Color("#ff3b30");
    const waste = { level: .15, mode: "filling", timer: 0, z: PARK };

    function setLevel(level) {
      waste.level = level;
      fill.scale.y = Math.max(.001, level);
      fill.position.y = .16 + .2 * level;
      if (level < .5) fillMaterial.color.copy(green).lerp(amber, level * 2);
      else fillMaterial.color.copy(amber).lerp(red, (level - .5) * 2);
    }
    setLevel(waste.level);

    city.life.push((t, dt) => {
      const calling = waste.mode === "calling" || waste.mode === "coming";
      waves.forEach((wave, i) => {
        wave.visible = calling;
        if (!calling) return;
        const phase = (t * .9 + i / 3) % 1;
        wave.position.y = .82 + phase * .7;
        wave.scale.setScalar(.6 + phase * 1.4);
        wave.material.opacity = 1 - phase;
      });
      truckBody.position.y = 0;
      lid.rotation.z = 0;

      if (waste.mode === "filling") {
        setLevel(Math.min(1, waste.level + dt / 11));
        if (waste.level >= 1) {
          waste.mode = "calling";
          waste.timer = .9;
          sensorMaterial.color.set("#ff3b30");
        }
      } else if (waste.mode === "calling") {
        waste.timer -= dt;
        if (waste.timer <= 0) waste.mode = "coming";
      } else if (waste.mode === "coming") {
        waste.z = Math.max(STOPZ, waste.z - dt * .8);
        if (waste.z <= STOPZ) { waste.mode = "emptying"; waste.timer = 0; }
      } else if (waste.mode === "emptying") {
        waste.timer += dt;
        const k = Math.min(1, waste.timer / 1.2);
        lid.rotation.z = -Math.sin(k * Math.PI) * .9;
        truckBody.position.y = Math.abs(Math.sin(waste.timer * 9)) * .03 * (1 - k);
        setLevel(Math.max(0, 1 - k));
        if (waste.timer >= 1.6) {
          waste.mode = "leaving";
          sensorMaterial.color.set(palette.cyan);
        }
      } else if (waste.mode === "leaving") {
        waste.z = Math.min(PARK, waste.z + dt * .6);
        if (waste.z >= PARK) waste.mode = "filling";
      }
      truck.position.z = waste.z;
    });
  }

  function buildSky(city) {
    // A smiling sun (Lebanon has 300+ sunny days) and two drifting clouds.
    const sun = new THREE.Group();
    sun.position.set(-2.6, 4.4, -3.0);
    const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.sunRays(), transparent: true, depthWrite: false }));
    rays.scale.set(1.7, 1.7, 1);
    rays.renderOrder = 1;
    const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.sunFace(), transparent: true, depthWrite: false }));
    face.scale.set(1.7, 1.7, 1);
    face.renderOrder = 2;
    sun.add(rays, face);
    city.content.add(sun);
    city.life.push((t) => {
      rays.material.rotation = t * .25;
      sun.position.y = 4.4 + Math.sin(t * 1.1) * .08;
    });

    [[1.6, 3.9, -3.2, 0], [-.8, 4.2, 2.8, 2]].forEach(([x, y, z, phase]) => {
      const cloud = new THREE.Group();
      cloud.position.set(x, y, z);
      const b = new Batch();
      [[0, 0, 0, .34], [.34, -.05, .05, .26], [-.34, -.06, 0, .25], [.12, .16, -.02, .24]].forEach(([cx, cy, cz, r]) => {
        b.add(G.ball(r, 1), "#ffffff", { p: [cx, cy, cz], flat: true });
      });
      cloud.add(b.build());
      city.content.add(cloud);
      city.life.push((t) => { cloud.position.x = x + Math.sin(t * .12 + phase) * .9; });
    });
  }

  const cities = [];

  AFRAME.registerComponent("smart-city", {
    init: function () {
      this.life = [];
      this.groups = {};
      this.badges = {};
      this.badgeSpots = {
        energy: { p: [-2.25, 2.4, -2.15] },
        traffic: { p: [-.98, 2.8, .98] },
        waste: { p: [.95, 1.7, 1.85] },
        green: { p: [1.85, 3.9, -2.65] },
        home: { p: [-2.3, 2.5, 2.45] }
      };
      this.bounces = [];
      this.now = 0;
      cities.push(this);
      this.build = this.build.bind(this);
      if (this.el.sceneEl && this.el.sceneEl.hasLoaded) {
        this.build();
      } else if (this.el.sceneEl) {
        this.el.sceneEl.addEventListener("loaded", this.build, { once: true });
      }
    },

    remove: function () {
      const index = cities.indexOf(this);
      if (index >= 0) cities.splice(index, 1);
    },

    systemEntity: function (id, x, y, z, ry) {
      const el = add(this.contentEl, "a-entity", { position: `${x} ${y} ${z}`, rotation: `0 ${ry || 0} 0` });
      (this.groups[id] = this.groups[id] || []).push(el.object3D);
      return el;
    },

    build: function () {
      if (this.built) return;
      this.built = true;
      // The plinth is .28 thick; lift everything so the city sits on the surface.
      this.contentEl = add(this.el, "a-entity", { position: "0 .28 0" });
      this.content = this.contentEl.object3D;
      buildGround(this);
      buildEnergy(this);
      buildForest(this);
      buildHome(this);
      buildPark(this);
      buildTraffic(this);
      buildWaste(this);
      buildSky(this);
      this.life.push((t) => this.animateRewards(t));
      this.el.emit("city-ready", {}, false);
    },

    tick: function (time, delta) {
      if (!this.built) return;
      const dt = Math.min(delta || 16, 100) / 1000;
      this.now = time / 1000;
      for (let i = 0; i < this.life.length; i += 1) {
        // A broken animation removes itself instead of stopping the whole render loop.
        try {
          this.life[i](this.now, dt);
        } catch (error) {
          this.life.splice(i, 1);
          i -= 1;
          console.error("smart-city animation stopped:", error);
        }
      }
    },

    bounce: function (id) {
      (this.groups[id] || []).forEach((object) => {
        this.bounces = this.bounces.filter((item) => item.object !== object);
        this.bounces.push({ object, start: this.now });
      });
    },

    markFound: function (id) {
      this.bounce(id);
      if (this.badges[id] || !systems[id] || !this.badgeSpots[id]) return;
      const spot = this.badgeSpots[id];
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.badge(systems[id].icon), transparent: true, depthWrite: false }));
      sprite.position.set(spot.p[0], spot.p[1], spot.p[2]);
      sprite.scale.setScalar(.001);
      sprite.renderOrder = 3;
      (spot.parent || this.content).add(sprite);
      this.badges[id] = { sprite, start: this.now, baseY: spot.p[1] };
    },

    animateRewards: function (t) {
      this.bounces = this.bounces.filter((item) => {
        const k = (t - item.start) / .8;
        if (k >= 1) { item.object.scale.setScalar(1); return false; }
        item.object.scale.setScalar(1 + .22 * Math.sin(k * Math.PI * 3) * (1 - k));
        return true;
      });
      Object.values(this.badges).forEach((badge) => {
        const k = Math.min(1, (t - badge.start) / .6);
        const pop = k < 1 ? Math.sin(k * Math.PI * .5) * (1 + .35 * Math.sin(k * Math.PI)) : 1;
        badge.sprite.scale.setScalar(.75 * pop);
        badge.sprite.position.y = badge.baseY + Math.sin(t * 2 + badge.baseY) * .08;
      });
    }
  });

  window.SmartCity = {
    systems,
    palette,
    selectTarget,
    targetFromObject: function (object) {
      let current = object;
      while (current) {
        if (current.el && current.el.classList && current.el.classList.contains("smart-target")) return current.el;
        current = current.parent;
      }
      return null;
    },
    flashTarget: function (target, color) {
      if (!target) return;
      // Always restore to the fixed hidden material. getAttribute("material") returns
      // A-Frame's live data object, so "saving" it did not work and quick repeated
      // taps left big coloured boxes stuck on the city.
      window.clearTimeout(target.flashTimer);
      target.setAttribute("material", `color: ${color || "#45e28b"}; opacity: .33; transparent: true; depthWrite: false; visible: true`);
      target.flashTimer = window.setTimeout(function () { target.setAttribute("material", HITBOX_MATERIAL); }, 1050);
    },
    // Makes a system jump (used for hints) without giving a badge.
    bounce: function (id) { cities.forEach((city) => city.bounce(id)); },
    // Makes a system jump and floats its badge above it in the 3D city.
    markFound: function (id) { cities.forEach((city) => city.markFound(id)); }
  };
})();
