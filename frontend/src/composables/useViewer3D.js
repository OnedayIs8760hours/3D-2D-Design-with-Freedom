import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

/**
 * Composable wrapping the Three.js 3D viewer.
 * Supports two isolated workflows:
 * - uv2d: 2D canvas drives the model texture through UV mapping
 * - 3d: decals are placed directly on the model as independent 3D assets
 */
export function useViewer3D(containerId, options = {}) {
  const loading = ref(true);
  const scene = shallowRef(null);
  const camera = shallowRef(null);
  const renderer = shallowRef(null);
  const controls = shallowRef(null);
  const decalItems = ref([]);
  const selectedDecalId = ref('');

  let allMeshes = [];
  let decalMeshes = [];
  let modelRoot = null;
  let decalRoot = null;
  let cachedCanvasSource = null;
  let uvConfig = null;
  let cachedUVTemplateUrl = null;
  let onUVTemplateReady = null;
  let animFrameId = null;
  let container = null;
  let editorMode = 'uv2d';
  let baseColor = '#ffffff';
  let decalCounter = 1;
  let onDecalChange = null;

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
    initDecalRoot(s);
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

  function initDecalRoot(s) {
    decalRoot = new THREE.Group();
    decalRoot.name = 'DecalRoot';
    decalRoot.visible = editorMode === '3d';
    s.add(decalRoot);
  }

  function initPlaceholder(s) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(10, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    box.name = 'PlaceholderBox';
    s.add(box);
    allMeshes = [box];
  }

  function loadModel() {
    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        const s = scene.value;
        const placeholder = s.getObjectByName('PlaceholderBox');
        if (placeholder) {
          s.remove(placeholder);
        }

        if (modelRoot) {
          s.remove(modelRoot);
          modelRoot = null;
        }

        disposeAllDecals();
        allMeshes = [];

        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.material = createBaseMaterial();
            allMeshes.push(child);
          }
        });

        uvConfig = analyzeUVBounds(allMeshes, textureCanvasSize, uvTemplatePaddingRatio);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 20 / maxDim;
        model.scale.set(scale, scale, scale);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center.multiplyScalar(scale));

        modelRoot = model;
        s.add(model);
        loading.value = false;

        if (uvConfig) publishUVTemplate();
        applyRenderMode();
      },
      undefined,
      (err) => console.error('Model load error:', err),
    );
  }

  function createBaseMaterial() {
    return new THREE.MeshStandardMaterial({
      color: editorMode === '3d' ? baseColor : '#ffffff',
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: false,
    });
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
    if (editorMode !== 'uv2d' || allMeshes.length === 0 || !uvConfig) return;

    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      const uv = getMeshUVAttribute(mesh);
      if (!uv) return;

      const mat = mesh.material;
      if (mat.map) {
        mat.map.dispose();
      }

      const texture = new THREE.CanvasTexture(canvasElement);
      texture.outputColorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.center.set(0, 0);
      texture.rotation = 0;
      texture.flipY = false;

      if (useDirectUvSpace) {
        texture.repeat.set(1, 1);
        texture.offset.set(0, 0);
      } else {
        texture.repeat.set(uvConfig.textureScale, uvConfig.textureScale);
        texture.offset.set(uvConfig.textureOffsetX, uvConfig.textureOffsetY);
      }

      mat.map = texture;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    });
  }

  function applyRenderMode() {
    if (!allMeshes.length) return;

    const is3DMode = editorMode === '3d';
    if (decalRoot) decalRoot.visible = is3DMode;

    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      if (is3DMode) {
        if (mesh.material.map) {
          mesh.material.map.dispose();
          mesh.material.map = null;
        }
        mesh.material.color.set(baseColor);
        mesh.material.needsUpdate = true;
      } else {
        mesh.material.color.set('#ffffff');
        mesh.material.needsUpdate = true;
      }
    });

    if (!is3DMode && cachedCanvasSource) {
      updateTexture(cachedCanvasSource);
    }
  }

  function setEditorMode(mode) {
    editorMode = mode === '3d' ? '3d' : 'uv2d';
    if (editorMode !== '3d') {
      clearSelectedDecal();
    }
    applyRenderMode();
  }

  function setBaseColor(color) {
    baseColor = color;
    if (editorMode !== '3d') return;

    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      mesh.material.color.set(color);
      mesh.material.needsUpdate = true;
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
    if (!container || !camera.value || !renderer.value) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.value.aspect = w / h;
    camera.value.updateProjectionMatrix();
    renderer.value.setSize(w, h);
  }

  onMounted(() => init());
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    if (animFrameId) cancelAnimationFrame(animFrameId);
    disposeAllDecals();
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

  function raycastObjects(clientX, clientY, objects) {
    if (!container || !camera.value || !renderer.value || !objects.length) return [];

    const rect = renderer.value.domElement.getBoundingClientRect();
    mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera.value);
    return raycaster.intersectObjects(objects, false);
  }

  function raycastModel(clientX, clientY) {
    const intersects = raycastObjects(clientX, clientY, allMeshes);
    if (intersects.length === 0) return null;

    const hit = intersects[0];
    const normal = getWorldNormal(hit);
    const canvasPos = hit.uv ? uvToCanvas(hit.uv.x, hit.uv.y) : { x: 0, y: 0 };

    return {
      u: hit.uv?.x ?? null,
      v: hit.uv?.y ?? null,
      canvasX: canvasPos.x,
      canvasY: canvasPos.y,
      point: hit.point.clone(),
      normal,
      object: hit.object,
    };
  }

  function raycastUV(clientX, clientY) {
    const hit = raycastModel(clientX, clientY);
    if (!hit || hit.u == null || hit.v == null) return null;
    return hit;
  }

  function pickDecal(clientX, clientY) {
    const intersects = raycastObjects(clientX, clientY, decalMeshes);
    return intersects.length ? intersects[0].object : null;
  }

  async function addDecalAtClient(dataUrl, clientX, clientY, options = {}) {
    const hit = raycastModel(clientX, clientY);
    if (!hit) return null;
    return addDecalAtHit(dataUrl, hit, options);
  }

  async function addDecalAtHit(dataUrl, hit, options = {}) {
    if (!hit?.object) return null;

    const asset = await loadDecalAsset(dataUrl);
    const id = options.id || `decal-${decalCounter++}`;
    const label = options.label || getDefaultDecalLabel(options.type || 'image', id);
    const scale = options.scale || 4.8;
    const rotation = options.rotation || 0;
    const aspect = asset.aspect || 1;

    const decalMesh = buildDecalMesh(hit, {
      id,
      label,
      type: options.type || 'image',
      dataUrl,
      texture: asset.texture,
      scale,
      rotation,
      aspect,
    });

    decalRoot.add(decalMesh);
    decalMeshes.push(decalMesh);
    refreshDecalItems();
    selectDecalById(id);
    notifyDecalChange();
    return decalMesh;
  }

  function buildDecalMesh(hit, asset) {
    const geometry = createDecalGeometry(hit, asset.scale, asset.aspect, asset.rotation);
    const material = new THREE.MeshStandardMaterial({
      map: asset.texture,
      transparent: true,
      alphaTest: 0.05,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x2563eb),
      emissiveIntensity: 0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;
    mesh.userData = {
      id: asset.id,
      name: asset.label,
      type: asset.type,
      dataUrl: asset.dataUrl,
      scale: asset.scale,
      rotation: asset.rotation,
      aspect: asset.aspect,
      point: hit.point.clone(),
      normal: hit.normal.clone(),
      targetUuid: hit.object.uuid,
      canvasX: hit.canvasX ?? 0,
      canvasY: hit.canvasY ?? 0,
    };
    return mesh;
  }

  function createDecalGeometry(hit, scale, aspect, rotation) {
    const orientation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        hit.normal.clone().normalize(),
      ),
    );
    orientation.z += rotation;

    const size = new THREE.Vector3(scale * aspect, scale, scale);
    const position = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.015));
    return new DecalGeometry(hit.object, position, orientation, size);
  }

  function selectDecalAt(clientX, clientY) {
    const mesh = pickDecal(clientX, clientY);
    if (!mesh) return null;
    selectDecalById(mesh.userData.id);
    return mesh;
  }

  function selectDecalById(id) {
    selectedDecalId.value = id || '';
    syncDecalHighlight();
  }

  function clearSelectedDecal() {
    selectedDecalId.value = '';
    syncDecalHighlight();
  }

  function moveSelectedDecalTo(clientX, clientY) {
    const id = selectedDecalId.value;
    if (!id) return null;

    const mesh = decalMeshes.find((item) => item.userData.id === id);
    const hit = raycastModel(clientX, clientY);
    if (!mesh || !hit) return null;

    const nextGeometry = createDecalGeometry(hit, mesh.userData.scale, mesh.userData.aspect, mesh.userData.rotation);
    mesh.geometry.dispose();
    mesh.geometry = nextGeometry;
    mesh.userData.point = hit.point.clone();
    mesh.userData.normal = hit.normal.clone();
    mesh.userData.targetUuid = hit.object.uuid;
    mesh.userData.canvasX = hit.canvasX ?? mesh.userData.canvasX;
    mesh.userData.canvasY = hit.canvasY ?? mesh.userData.canvasY;
    notifyDecalChange();
    return mesh;
  }

  function removeDecalById(id) {
    const index = decalMeshes.findIndex((item) => item.userData.id === id);
    if (index === -1) return;
    const [mesh] = decalMeshes.splice(index, 1);
    disposeDecalMesh(mesh);
    if (selectedDecalId.value === id) {
      selectedDecalId.value = '';
    }
    refreshDecalItems();
    syncDecalHighlight();
    notifyDecalChange();
  }

  function removeSelectedDecal() {
    if (!selectedDecalId.value) return false;
    removeDecalById(selectedDecalId.value);
    return true;
  }

  function refreshDecalItems() {
    decalItems.value = decalMeshes
      .map((mesh) => ({
        id: mesh.userData.id,
        type: mesh.userData.type || 'image',
        name: mesh.userData.name || '贴花',
      }))
      .reverse();
  }

  function syncDecalHighlight() {
    decalMeshes.forEach((mesh) => {
      const active = mesh.userData.id === selectedDecalId.value;
      mesh.material.emissiveIntensity = active ? 0.22 : 0;
      mesh.renderOrder = active ? 12 : 10;
    });
  }

  function getDecalState() {
    return decalMeshes.map((mesh) => ({
      id: mesh.userData.id,
      type: mesh.userData.type,
      name: mesh.userData.name,
      dataUrl: mesh.userData.dataUrl,
      scale: mesh.userData.scale,
      rotation: mesh.userData.rotation,
      aspect: mesh.userData.aspect,
      point: mesh.userData.point,
      normal: mesh.userData.normal,
      targetUuid: mesh.userData.targetUuid,
    }));
  }

  function setOrbitEnabled(enabled) {
    if (controls.value) controls.value.enabled = enabled;
  }

  function getRendererDom() {
    return renderer.value?.domElement ?? null;
  }

  function setDecalChangeCallback(fn) {
    onDecalChange = fn;
  }

  function notifyDecalChange() {
    if (!onDecalChange) return;
    const data = decalMeshes.map((m) => ({
      id: m.userData.id,
      type: m.userData.type,
      name: m.userData.name,
      dataUrl: m.userData.dataUrl,
      canvasX: m.userData.canvasX,
      canvasY: m.userData.canvasY,
      scale: m.userData.scale,
      aspect: m.userData.aspect,
    }));
    onDecalChange(data);
  }

  function disposeAllDecals() {
    decalMeshes.forEach(disposeDecalMesh);
    decalMeshes = [];
    decalItems.value = [];
    selectedDecalId.value = '';
  }

  return {
    loading,
    decalItems,
    selectedDecalId,
    updateTexture,
    setUVTemplateListener,
    start,
    raycastUV,
    setOrbitEnabled,
    getRendererDom,
    setEditorMode,
    setBaseColor,
    addDecalAtClient,
    selectDecalAt,
    selectDecalById,
    clearSelectedDecal,
    moveSelectedDecalTo,
    removeDecalById,
    removeSelectedDecal,
    getDecalState,
    setDecalChangeCallback,
  };
}

function getMeshUVAttribute(mesh) {
  if (!mesh.geometry?.attributes) return null;
  return mesh.geometry.attributes.uv || mesh.geometry.attributes.uv2 || null;
}

function analyzeUVBounds(meshes, canvasSize = 1024, paddingRatio = 0.06) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let validMeshCount = 0;

  meshes.forEach((mesh) => {
    const uv = getMeshUVAttribute(mesh);
    if (!uv) return;
    validMeshCount++;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
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
    pixelScale,
    contentWidth,
    contentHeight,
    offsetX,
    offsetY,
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

  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.lineWidth = 1;
  for (let step = 0; step <= 8; step++) {
    const ox = bounds.offsetX + (bounds.contentWidth / 8) * step;
    const oy = bounds.offsetY + (bounds.contentHeight / 8) * step;
    ctx.beginPath();
    ctx.moveTo(ox, bounds.offsetY);
    ctx.lineTo(ox, bounds.offsetY + bounds.contentHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bounds.offsetX, oy);
    ctx.lineTo(bounds.offsetX + bounds.contentWidth, oy);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(71,85,105,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.offsetX, bounds.offsetY, bounds.contentWidth, bounds.contentHeight);
  ctx.restore();

  meshes.forEach((mesh, index) => {
    const uv = getMeshUVAttribute(mesh);
    if (!uv) return;
    const hue = (index * 137) % 360;
    const triangles = collectTriangles(mesh, uv, mapX, mapY);
    if (triangles.length === 0) return;

    ctx.fillStyle = `hsla(${hue},85%,72%,0.18)`;
    triangles.forEach((triangle) => {
      ctx.beginPath();
      ctx.moveTo(triangle[0].x, triangle[0].y);
      ctx.lineTo(triangle[1].x, triangle[1].y);
      ctx.lineTo(triangle[2].x, triangle[2].y);
      ctx.closePath();
      ctx.fill();
    });

    ctx.strokeStyle = `hsla(${hue},70%,42%,0.95)`;
    ctx.lineWidth = 2;
    const boundary = extractBoundary(triangles);
    boundary.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  });

  return canvas;
}

function collectTriangles(mesh, uv, mapX, mapY) {
  const idx = mesh.geometry.index;
  const count = idx ? idx.count : uv.count;
  const triangles = [];
  for (let i = 0; i < count; i += 3) {
    const abc = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
    triangles.push(abc.map((vi) => ({
      u: uv.getX(vi),
      v: uv.getY(vi),
      x: mapX(uv.getX(vi)),
      y: mapY(uv.getY(vi)),
    })));
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
      const current = map.get(key);
      if (current) current.count++;
      else map.set(key, { a, b, count: 1 });
    });
  });
  return Array.from(map.values()).filter((entry) => entry.count === 1).map((entry) => [entry.a, entry.b]);
}

function getWorldNormal(hit) {
  const normal = hit.face?.normal?.clone() || new THREE.Vector3(0, 0, 1);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  normal.applyMatrix3(normalMatrix).normalize();
  return normal;
}

function disposeDecalMesh(mesh) {
  mesh.geometry?.dispose();
  if (mesh.material?.map) mesh.material.map.dispose();
  mesh.material?.dispose?.();
  mesh.parent?.remove(mesh);
}

function loadDecalAsset(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const texture = new THREE.Texture(image);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      resolve({ texture, aspect: image.width / image.height || 1 });
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function getDefaultDecalLabel(type, id) {
  const index = id.split('-').pop();
  const map = {
    image: '图片贴花',
    text: '文字贴花',
    rect: '矩形贴花',
    circle: '圆形贴花',
    triangle: '三角贴花',
    line: '线条贴花',
  };
  return `${map[type] || '3D 贴花'} ${index}`;
}
