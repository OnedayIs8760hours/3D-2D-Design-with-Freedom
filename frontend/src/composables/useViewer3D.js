import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Composable wrapping the Three.js 3D viewer.
 */
export function useViewer3D(containerId, options = {}) {
  const loading = ref(true);
  const scene = shallowRef(null);
  const camera = shallowRef(null);
  const renderer = shallowRef(null);
  const controls = shallowRef(null);

  let allMeshes = [];
  let cachedCanvasSource = null;
  let uvConfig = null;
  let cachedUVTemplateUrl = null;
  let onUVTemplateReady = null;
  let animFrameId = null;
  let container = null;
  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();

  const modelUrl = options.modelUrl || '/api/models/2.glb';
  const uvGuideUrl = options.uvGuideUrl || '';
  const useDirectUvSpace = options.useDirectUvSpace || false;
  const textureCanvasSize = 1024;
  const uvTemplatePaddingRatio = 0.06;

  function init() {
    container = document.getElementById(containerId);

    const s = new THREE.Scene();
    s.background = new THREE.Color(0xeeeeee);
    scene.value = s;

    const cam = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    cam.position.set(0, 0, 40);
    camera.value = cam;

    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setSize(container.clientWidth, container.clientHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(r.domElement);
    renderer.value = r;

    const ctrl = new OrbitControls(cam, r.domElement);
    ctrl.enableDamping = true;
    controls.value = ctrl;

    addLights(s);
    initPlaceholder(s);
    loadModel();

    window.addEventListener('resize', onResize);
  }

  function addLights(s) {
    s.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(5, 10, 7);
    s.add(dir);
    const back = new THREE.DirectionalLight(0xffffff, 0.5);
    back.position.set(-5, 5, -10);
    s.add(back);
  }

  function initPlaceholder(s) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(10, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    box.name = 'PlaceholderBox';
    s.add(box);
    allMeshes.push(box);
  }

  function loadModel() {
    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        const s = scene.value;
        const placeholder = s.getObjectByName('PlaceholderBox');
        if (placeholder) {
          s.remove(placeholder);
          allMeshes = [];
        }

        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              roughness: 0.5,
              metalness: 0.1,
              side: THREE.DoubleSide,
            });
            allMeshes.push(child);
          }
        });

        uvConfig = analyzeUVBounds(allMeshes, textureCanvasSize, uvTemplatePaddingRatio);

        // Scale & center
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 20 / maxDim;
        model.scale.set(scale, scale, scale);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center.multiplyScalar(scale));

        s.add(model);
        loading.value = false;

        if (uvConfig) publishUVTemplate();
        if (cachedCanvasSource) updateTexture(cachedCanvasSource);
      },
      undefined,
      (err) => console.error('Model load error:', err),
    );
  }

  function publishUVTemplate() {
    const canvas = createCombinedUVCanvas(allMeshes, textureCanvasSize, uvTemplatePaddingRatio, uvConfig);
    if (!canvas) return;
    cachedUVTemplateUrl = canvas.toDataURL('image/png');
    if (onUVTemplateReady) onUVTemplateReady(cachedUVTemplateUrl);
  }

  function setUVTemplateListener(listener) {
    onUVTemplateReady = listener;
    if (listener && cachedUVTemplateUrl) listener(cachedUVTemplateUrl);
  }

  function updateTexture(canvasElement) {
    cachedCanvasSource = canvasElement;
    if (allMeshes.length === 0 || !uvConfig) return;

    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      const uv = getMeshUVAttribute(mesh);
      if (!uv) return;

      const mat = mesh.material;
      if (!mat.map || mat.map.source.data !== canvasElement) {
        const texture = new THREE.CanvasTexture(canvasElement);
        texture.outputColorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.center.set(0, 0);
        texture.rotation = 0;

        if (useDirectUvSpace) {
          texture.repeat.set(1, 1);
          texture.offset.set(0, 0);
        } else {
          texture.repeat.set(uvConfig.textureScale, uvConfig.textureScale);
          texture.offset.set(uvConfig.textureOffsetX, uvConfig.textureOffsetY);
        }
        texture.flipY = false;

        mat.map = texture;
        mat.needsUpdate = true;
      } else {
        mat.map.needsUpdate = true;
      }
    });
  }

  function start() {
    animate();
  }

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    controls.value?.update();
    renderer.value?.render(scene.value, camera.value);
  }

  function onResize() {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.value.aspect = w / h;
    camera.value.updateProjectionMatrix();
    renderer.value.setSize(w, h);
  }

  onMounted(() => init());
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    if (animFrameId) cancelAnimationFrame(animFrameId);
    renderer.value?.dispose();
  });

  function uvToCanvas(u, v) {
    if (useDirectUvSpace || !uvConfig) {
      return { x: u * textureCanvasSize, y: v * textureCanvasSize };
    }
    return {
      x: uvConfig.offsetX + (u - uvConfig.minU) * uvConfig.pixelScale,
      y: uvConfig.offsetY + (v - uvConfig.minV) * uvConfig.pixelScale,
    };
  }

  function raycastUV(clientX, clientY) {
    if (!container || !camera.value || !renderer.value || allMeshes.length === 0) return null;

    const rect = renderer.value.domElement.getBoundingClientRect();
    mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera.value);
    const intersects = raycaster.intersectObjects(allMeshes, false);

    if (intersects.length === 0 || !intersects[0].uv) return null;

    const hit = intersects[0];
    const canvasPos = uvToCanvas(hit.uv.x, hit.uv.y);

    return {
      u: hit.uv.x,
      v: hit.uv.y,
      canvasX: canvasPos.x,
      canvasY: canvasPos.y,
      point: hit.point,
    };
  }

  function setOrbitEnabled(enabled) {
    if (controls.value) controls.value.enabled = enabled;
  }

  function getRendererDom() {
    return renderer.value?.domElement ?? null;
  }

  return { loading, updateTexture, setUVTemplateListener, start, raycastUV, setOrbitEnabled, getRendererDom };
}

// ── UV helper functions (unchanged logic) ──────────────────

function getMeshUVAttribute(mesh) {
  if (!mesh.geometry?.attributes) return null;
  return mesh.geometry.attributes.uv || mesh.geometry.attributes.uv2 || null;
}

function analyzeUVBounds(meshes, canvasSize = 1024, paddingRatio = 0.06) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  let validMeshCount = 0;

  meshes.forEach((mesh) => {
    const uv = getMeshUVAttribute(mesh);
    if (!uv) return;
    validMeshCount++;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  });

  if (validMeshCount === 0 || minU === Infinity) return null;

  const rangeU = Math.max(maxU - minU, 1e-6);
  const rangeV = Math.max(maxV - minV, 1e-6);
  const layout = computeUvCanvasLayout({ minU, minV, rangeU, rangeV }, canvasSize, paddingRatio);

  return { minU, maxU, minV, maxV, rangeU, rangeV, validMeshCount, ...layout };
}

function computeUvCanvasLayout(bounds, canvasSize, paddingRatio) {
  const basePadding = Math.round(canvasSize * paddingRatio);
  const drawableWidth = canvasSize - basePadding * 2;
  const drawableHeight = canvasSize - basePadding * 2;
  const pixelScale = Math.min(drawableWidth / bounds.rangeU, drawableHeight / bounds.rangeV);
  const contentWidth = bounds.rangeU * pixelScale;
  const contentHeight = bounds.rangeV * pixelScale;
  const offsetX = (canvasSize - contentWidth) * 0.5;
  const offsetY = (canvasSize - contentHeight) * 0.5;

  return {
    pixelScale, contentWidth, contentHeight, offsetX, offsetY,
    textureScale: pixelScale / canvasSize,
    textureOffsetX: offsetX / canvasSize - bounds.minU * (pixelScale / canvasSize),
    textureOffsetY: offsetY / canvasSize - bounds.minV * (pixelScale / canvasSize),
  };
}

function createCombinedUVCanvas(meshes, size, paddingRatio, uvConfig) {
  const bounds = uvConfig || analyzeUVBounds(meshes, size, paddingRatio);
  if (!bounds) return null;

  const mapX = (u) => bounds.offsetX + (u - bounds.minU) * bounds.pixelScale;
  const mapY = (v) => bounds.offsetY + (v - bounds.minV) * bounds.pixelScale;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Grid
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.lineWidth = 1;
  for (let step = 0; step <= 8; step++) {
    const ox = bounds.offsetX + (bounds.contentWidth / 8) * step;
    const oy = bounds.offsetY + (bounds.contentHeight / 8) * step;
    ctx.beginPath(); ctx.moveTo(ox, bounds.offsetY); ctx.lineTo(ox, bounds.offsetY + bounds.contentHeight); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bounds.offsetX, oy); ctx.lineTo(bounds.offsetX + bounds.contentWidth, oy); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(71,85,105,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.offsetX, bounds.offsetY, bounds.contentWidth, bounds.contentHeight);
  ctx.restore();

  // Mesh outlines
  meshes.forEach((mesh, index) => {
    const uv = getMeshUVAttribute(mesh);
    if (!uv) return;
    const hue = (index * 137) % 360;
    const triangles = collectTriangles(mesh, uv, mapX, mapY);
    if (triangles.length === 0) return;

    ctx.fillStyle = `hsla(${hue},85%,72%,0.18)`;
    triangles.forEach((t) => {
      ctx.beginPath();
      ctx.moveTo(t[0].x, t[0].y); ctx.lineTo(t[1].x, t[1].y); ctx.lineTo(t[2].x, t[2].y);
      ctx.closePath(); ctx.fill();
    });

    ctx.strokeStyle = `hsla(${hue},70%,42%,0.95)`;
    ctx.lineWidth = 2;
    const boundary = extractBoundary(triangles);
    boundary.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); });
  });

  return canvas;
}

function collectTriangles(mesh, uv, mapX, mapY) {
  const idx = mesh.geometry.index;
  const count = idx ? idx.count : uv.count;
  const triangles = [];
  for (let i = 0; i < count; i += 3) {
    const abc = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
    triangles.push(abc.map((vi) => ({ u: uv.getX(vi), v: uv.getY(vi), x: mapX(uv.getX(vi)), y: mapY(uv.getY(vi)) })));
  }
  return triangles;
}

function extractBoundary(triangles) {
  const map = new Map();
  triangles.forEach((pts) => {
    [[pts[0], pts[1]], [pts[1], pts[2]], [pts[2], pts[0]]].forEach(([a, b]) => {
      const ka = `${a.u.toFixed(5)},${a.v.toFixed(5)}`;
      const kb = `${b.u.toFixed(5)},${b.v.toFixed(5)}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const c = map.get(key);
      if (c) c.count++; else map.set(key, { a, b, count: 1 });
    });
  });
  return Array.from(map.values()).filter((e) => e.count === 1).map((e) => [e.a, e.b]);
}
