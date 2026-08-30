import * as THREE from "three";
import { Player, PieceStyle, BoardAnim, Theme, Settings } from "./types";

interface CellMesh {
  group: THREE.Group;       // holds the piece, positioned at cell
  piece: THREE.Object3D | null;
  index: number;
  targetPos: THREE.Vector3;
  hover: THREE.Mesh;        // hover highlight plane
}

const CELL_SIZE = 2.2;
const GAP = 0.25;
const BOARD_DEPTH = 0.45;

export class Game3D {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  private cells: CellMesh[] = [];
  private boardGroup: THREE.Group;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoveredIndex = -1;
  private particles: THREE.Points | null = null;
  private winLineMesh: THREE.Line | null = null;
  private confetti: THREE.Points | null = null;
  private confettiVel: Float32Array | null = null;
  private clock = new THREE.Clock();
  private anim: BoardAnim = "float";
  private pieceStyle: PieceStyle = "neon";
  private xColor = 0xff4d6d;
  private oColor = 0x4dd0ff;
  private boardColor = 0x7c5cff;
  private theme: Theme;
  private onCellClick: (index: number) => void;
  private rafId = 0;
  private pieceAnimQueue: { mesh: THREE.Object3D; born: number }[] = [];
  private baseMat!: THREE.MeshStandardMaterial;
  private lineMat!: THREE.MeshStandardMaterial;
  private bgUniforms!: { top: { value: THREE.Color }; bottom: { value: THREE.Color } };
  private rimLight!: THREE.PointLight;

  constructor(canvas: HTMLCanvasElement, theme: Theme, onCellClick: (i: number) => void) {
    this.theme = theme;
    this.onCellClick = onCellClick;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(theme.fog, 18, 40);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 7.5, 9.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    this.setupLights();
    this.buildBackground();
    this.buildBoard();
    this.bindEvents();
    this.resize();
  }

  private setupLights() {
    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(6, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -10; key.shadow.camera.right = 10;
    key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
    this.scene.add(key);
    const rim = new THREE.PointLight(this.theme.glow, 1.4, 30);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);
    this.rimLight = rim;
    const fill = new THREE.PointLight(0x6688ff, 0.6, 25);
    fill.position.set(6, 3, 6);
    this.scene.add(fill);
  }

  private buildBackground() {
    // Gradient background via large sphere
    const geo = new THREE.SphereGeometry(50, 32, 32);
    this.bgUniforms = {
      top: { value: new THREE.Color(this.theme.bg) },
      bottom: { value: new THREE.Color(this.theme.bg2) },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: this.bgUniforms,
      vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        void main(){ float h=normalize(vP).y*0.5+0.5; vec3 c=mix(bottom,top,h); gl_FragColor=vec4(c,1.0);} `,
    });
    this.scene.add(new THREE.Mesh(geo, mat));

    // Star particles
    const starGeo = new THREE.BufferGeometry();
    const count = 400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 30 + Math.random() * 15;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7, sizeAttenuation: true });
    this.particles = new THREE.Points(starGeo, starMat);
    this.scene.add(this.particles);
  }

  private cellPosition(index: number): THREE.Vector3 {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const step = CELL_SIZE + GAP;
    const offset = step; // center the 3x3
    return new THREE.Vector3(col * step - offset, 0, row * step - offset);
  }

  private buildBoard() {
    const step = CELL_SIZE + GAP;
    const total = step * 3 - GAP;

    // Base plate
    const baseGeo = new THREE.BoxGeometry(total + 0.6, BOARD_DEPTH, total + 0.6);
    const baseMat = new THREE.MeshStandardMaterial({
      color: this.boardColor,
      metalness: 0.4,
      roughness: 0.35,
      emissive: this.boardColor,
      emissiveIntensity: 0.12,
    });
    this.baseMat = baseMat;
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -BOARD_DEPTH / 2 - 0.05;
    base.receiveShadow = true;
    this.boardGroup.add(base);

    // Grid lines (thin boxes) and cell hover planes
    const lineMat = new THREE.MeshStandardMaterial({
      color: this.theme.grid,
      emissive: this.theme.grid,
      emissiveIntensity: 0.5,
      metalness: 0.3,
      roughness: 0.4,
    });
    this.lineMat = lineMat;
    const lineLen = total;
    const lineT = 0.09;
    // 2 vertical + 2 horizontal dividers
    for (let i = 1; i <= 2; i++) {
      const off = i * step - step * 1.5;
      const v = new THREE.Mesh(new THREE.BoxGeometry(lineT, 0.12, lineLen), lineMat);
      v.position.set(off, 0.02, 0);
      this.boardGroup.add(v);
      const h = new THREE.Mesh(new THREE.BoxGeometry(lineLen, 0.12, lineT), lineMat);
      h.position.set(0, 0.02, off);
      this.boardGroup.add(h);
    }

    // Cells (invisible hover planes + groups for pieces)
    for (let i = 0; i < 9; i++) {
      const pos = this.cellPosition(i);
      const group = new THREE.Group();
      group.position.copy(pos);
      this.boardGroup.add(group);

      const hoverGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
      const hoverMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      });
      const hover = new THREE.Mesh(hoverGeo, hoverMat);
      hover.rotation.x = -Math.PI / 2;
      hover.position.set(pos.x, 0.06, pos.z);
      hover.userData.index = i;
      this.boardGroup.add(hover);

      this.cells.push({ group, piece: null, index: i, targetPos: pos.clone(), hover });
    }
  }

  private makePieceMaterial(color: number, style: PieceStyle): THREE.Material {
    switch (style) {
      case "glass":
        return new THREE.MeshPhysicalMaterial({
          color, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 1.2,
          transparent: true, opacity: 0.85, ior: 1.5, emissive: color, emissiveIntensity: 0.15,
        });
      case "neon":
        return new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3,
        });
      case "metal":
        return new THREE.MeshStandardMaterial({
          color, metalness: 1, roughness: 0.18, emissive: color, emissiveIntensity: 0.1,
        });
      case "solid":
      default:
        return new THREE.MeshStandardMaterial({
          color, metalness: 0.3, roughness: 0.5, emissive: color, emissiveIntensity: 0.25,
        });
    }
  }

  private buildX(color: number): THREE.Object3D {
    const group = new THREE.Group();
    const mat = this.makePieceMaterial(color, this.pieceStyle);
    const len = CELL_SIZE * 0.62;
    const t = 0.34;
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(len, t, t), mat);
    bar1.rotation.y = Math.PI / 4;
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(len, t, t), mat);
    bar2.rotation.y = -Math.PI / 4;
    [bar1, bar2].forEach((b) => { b.castShadow = true; group.add(b); });
    return group;
  }

  private buildO(color: number): THREE.Object3D {
    const mat = this.makePieceMaterial(color, this.pieceStyle);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(CELL_SIZE * 0.32, 0.18, 24, 48), mat);
    torus.rotation.x = Math.PI / 2;
    torus.castShadow = true;
    return torus;
  }

  placePiece(index: number, player: Player) {
    const cell = this.cells[index];
    if (!cell || cell.piece) return;
    const color = player === 1 ? this.xColor : this.oColor;
    const piece = player === 1 ? this.buildX(color) : this.buildO(color);
    piece.position.y = 4; // drop from above
    piece.scale.setScalar(0.01);
    piece.userData.player = player;
    cell.group.add(piece);
    cell.piece = piece;
    this.pieceAnimQueue.push({ mesh: piece, born: this.clock.getElapsedTime() });
  }

  removePiece(index: number) {
    const cell = this.cells[index];
    if (!cell || !cell.piece) return;
    cell.group.remove(cell.piece);
    cell.piece = null;
  }

  clearPieces() {
    for (const cell of this.cells) {
      if (cell.piece) { cell.group.remove(cell.piece); cell.piece = null; }
    }
    this.clearWinLine();
    this.clearConfetti();
  }

  highlightWinLine(line: number[], color: number) {
    this.clearWinLine();
    const a = this.cellPosition(line[0]);
    const b = this.cellPosition(line[2]);
    const start = a.clone().setY(0.5);
    const end = b.clone().setY(0.5);
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 4 });
    this.winLineMesh = new THREE.Line(geo, mat);
    this.boardGroup.add(this.winLineMesh);

    // glowing tube along the line
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const tubeGeo = new THREE.CylinderGeometry(0.12, 0.12, len, 16);
    const tubeMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.8 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    tube.position.copy(mid);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    tube.userData.isWinTube = true;
    this.boardGroup.add(tube);
    this.winLineMesh.userData.tube = tube;
  }

  clearWinLine() {
    if (this.winLineMesh) {
      const tube = this.winLineMesh.userData.tube as THREE.Mesh | undefined;
      if (tube) this.boardGroup.remove(tube);
      this.boardGroup.remove(this.winLineMesh);
      this.winLineMesh = null;
    }
  }

  spawnConfetti(color: number) {
    this.clearConfetti();
    const count = 180;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.confettiVel = new Float32Array(count * 3);
    const palette = [color, 0xffd700, 0x4cff8f, 0x00e5ff, 0xff6ec7];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 1] = 4 + Math.random() * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      this.confettiVel[i * 3] = (Math.random() - 0.5) * 6;
      this.confettiVel[i * 3 + 1] = 4 + Math.random() * 5;
      this.confettiVel[i * 3 + 2] = (Math.random() - 0.5) * 6;
      const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 1, sizeAttenuation: true });
    this.confetti = new THREE.Points(geo, mat);
    this.scene.add(this.confetti);
  }

  clearConfetti() {
    if (this.confetti) { this.scene.remove(this.confetti); this.confetti.geometry.dispose(); this.confetti = null; }
    this.confettiVel = null;
  }

  // ===== Settings updates =====
  applySettings(s: Settings, theme: Theme) {
    this.theme = theme;
    this.pieceStyle = s.pieceStyle;
    this.xColor = s.xColor;
    this.oColor = s.oColor;
    this.boardColor = s.boardColor;
    this.anim = s.boardAnim;

    // Repaint board, grid, background, fog and glow to match the new settings
    this.baseMat.color.setHex(s.boardColor);
    this.baseMat.emissive.setHex(s.boardColor);
    this.lineMat.color.setHex(theme.grid);
    this.lineMat.emissive.setHex(theme.grid);
    this.bgUniforms.top.value.setHex(theme.bg);
    this.bgUniforms.bottom.value.setHex(theme.bg2);
    (this.scene.fog as THREE.Fog).color.setHex(theme.fog);
    this.rimLight.color.setHex(theme.glow);

    // Refresh existing pieces' colors
    for (const cell of this.cells) {
      if (cell.piece) {
        const player: Player = cell.piece.userData.player ?? 1;
        // rebuild piece with new style/color
        cell.group.remove(cell.piece);
        const color = player === 1 ? this.xColor : this.oColor;
        const piece = player === 1 ? this.buildX(color) : this.buildO(color);
        piece.position.y = 0.7;
        piece.scale.setScalar(1);
        cell.group.add(piece);
        cell.piece = piece;
      }
    }
    // Reframe: spin mode needs a wider fit than float/static
    this.resize();
  }

  // ===== Events =====
  private bindEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 200));
  }

  private setPointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pickCell(): number {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.cells.map((c) => c.hover);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) return hits[0].object.userData.index as number;
    return -1;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.setPointer(e);
    const idx = this.pickCell();
    if (idx >= 0) this.onCellClick(idx);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.setPointer(e);
    const idx = this.pickCell();
    if (idx !== this.hoveredIndex) {
      if (this.hoveredIndex >= 0) (this.cells[this.hoveredIndex].hover.material as THREE.MeshBasicMaterial).opacity = 0;
      this.hoveredIndex = idx;
      if (idx >= 0 && !this.cells[idx].piece) {
        (this.cells[idx].hover.material as THREE.MeshBasicMaterial).opacity = 0.12;
      }
    }
  };

  private onPointerLeave = () => {
    if (this.hoveredIndex >= 0) (this.cells[this.hoveredIndex].hover.material as THREE.MeshBasicMaterial).opacity = 0;
    this.hoveredIndex = -1;
  };

  resize() {
    // Canvas is position:fixed covering the full viewport, so use window dims
    // (NOT parent.clientWidth which excludes padding and causes raycast mismatch)
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);

    // Frame the board in the free area below the HUD/action buttons:
    // iterate camera distance until the projected board bounds fit, then
    // shift the look target so the board centers in that free area.
    const hudBottom = document.getElementById("actions")?.getBoundingClientRect().bottom ?? 0;
    const pad = 10;
    const freeTop = Math.min(hudBottom + pad, h * 0.45);
    const freeH = h - freeTop - pad;
    // Steepen the view on narrow screens: a more top-down angle projects a
    // taller board, filling portrait layouts instead of leaving dead space.
    const steep = Math.min(1, Math.max(0, (0.9 - w / h) / 0.45));
    const dir = new THREE.Vector3(0, 7.5 + steep * 3.5, 9.5 - steep * 3.5).normalize();
    const half = (CELL_SIZE + GAP) * 1.5 + 0.4; // board half-extent incl. rim
    // Spin mode sweeps the corners through a circle of radius half*sqrt(2)
    const footprint: [number, number][] = [];
    if (this.anim === "spin") {
      const r = half * Math.SQRT2;
      for (let a = 0; a < 8; a++)
        footprint.push([Math.cos((a * Math.PI) / 4) * r, Math.sin((a * Math.PI) / 4) * r]);
    } else {
      for (const x of [-half, half]) for (const z of [-half, half]) footprint.push([x, z]);
    }
    const corners: THREE.Vector3[] = [];
    for (const [x, z] of footprint)
      for (const y of [-BOARD_DEPTH - 0.3, 1.3]) // base bottom .. piece tops (+float bob headroom)
        corners.push(new THREE.Vector3(x, y, z));

    let dist = 12;
    let box = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    for (let iter = 0; iter < 4; iter++) {
      this.camera.position.copy(dir).multiplyScalar(dist);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateMatrixWorld(true);
      box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        const px = ((p.x + 1) / 2) * w;
        const py = ((1 - p.y) / 2) * h;
        box.minX = Math.min(box.minX, px); box.maxX = Math.max(box.maxX, px);
        box.minY = Math.min(box.minY, py); box.maxY = Math.max(box.maxY, py);
      }
      const scale = Math.max((box.maxX - box.minX) / (0.95 * w), (box.maxY - box.minY) / (0.95 * freeH));
      if (scale > 0.98 && scale < 1.02) break;
      dist = Math.min(34, Math.max(8, dist * scale));
    }

    const offPx = (freeTop + freeH / 2) - (box.minY + box.maxY) / 2;
    const vHalf = Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    // Only the view-perpendicular component of a world-Y shift moves the
    // board on screen, so divide by dir.z (cosine of the downward pitch).
    const yOff = (offPx * 2 * dist * vHalf) / (h * dir.z);
    this.camera.lookAt(0, yOff, 0);

    // Keep the board clear of the fog now that camera distance is dynamic
    // (its farthest corner sits at roughly dist + 6)
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist + 7;
    fog.far = dist + 30;
  }

  // ===== Render loop =====
  start() {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() { cancelAnimationFrame(this.rafId); }

  private update() {
    const t = this.clock.getElapsedTime();
    // Board animation
    if (this.anim === "float") {
      this.boardGroup.position.y = Math.sin(t * 1.2) * 0.18;
      this.boardGroup.rotation.z = Math.sin(t * 0.5) * 0.015;
    } else if (this.anim === "spin") {
      this.boardGroup.rotation.y = t * 0.25;
      this.boardGroup.position.y = 0;
    } else {
      this.boardGroup.position.y = 0;
      this.boardGroup.rotation.y = 0;
      this.boardGroup.rotation.z = 0;
    }

    // Stars slow rotation
    if (this.particles) this.particles.rotation.y = t * 0.02;

    // Piece spawn animation (drop + scale)
    for (let i = this.pieceAnimQueue.length - 1; i >= 0; i--) {
      const item = this.pieceAnimQueue[i];
      const age = t - item.born;
      const dur = 0.5;
      const p = Math.min(1, age / dur);
      // ease out bounce
      const ease = 1 - Math.pow(1 - p, 3);
      const bounce = p > 0.7 ? Math.sin((p - 0.7) / 0.3 * Math.PI) * 0.25 : 0;
      item.mesh.position.y = 4 * (1 - ease) + 0.7 - bounce;
      item.mesh.scale.setScalar(0.01 + 0.99 * ease);
      item.mesh.rotation.y = (1 - ease) * Math.PI;
      if (p >= 1) {
        item.mesh.position.y = 0.7;
        item.mesh.scale.setScalar(1);
        this.pieceAnimQueue.splice(i, 1);
      }
    }

    // Gentle idle rotation on placed pieces
    for (const cell of this.cells) {
      if (cell.piece && !this.pieceAnimQueue.find((q) => q.mesh === cell.piece)) {
        cell.piece.rotation.y += 0.004;
        cell.piece.position.y = 0.7 + Math.sin(t * 1.5 + cell.index) * 0.04;
      }
    }

    // Win tube pulse
    if (this.winLineMesh?.userData.tube) {
      const tube = this.winLineMesh.userData.tube as THREE.Mesh;
      const m = tube.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.6;
    }

    // Confetti physics
    if (this.confetti && this.confettiVel) {
      const pos = this.confetti.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const dt = this.clock.getDelta();
      for (let i = 0; i < arr.length / 3; i++) {
        this.confettiVel[i * 3 + 1] -= 9.8 * dt; // gravity
        arr[i * 3] += this.confettiVel[i * 3] * dt;
        arr[i * 3 + 1] += this.confettiVel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += this.confettiVel[i * 3 + 2] * dt;
      }
      pos.needsUpdate = true;
      const mat = this.confetti.material as THREE.PointsMaterial;
      if (arr[1] < -8) mat.opacity = Math.max(0, mat.opacity - dt * 0.5);
    }
  }

  dispose() {
    this.stop();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.renderer.dispose();
  }
}
