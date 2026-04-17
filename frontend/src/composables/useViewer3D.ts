import { onMounted, onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from 'vue';
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

interface ViewerOptions {
  modelUrl?: string;
  uvGuideUrl?: string;
  useDirectUvSpace?: boolean;
}

interface UVConfig {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  rangeU: number;
  rangeV: number;
  validMeshCount: number;
  pixelScale: number;
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  textureScale: number;
  textureOffsetX: number;
  textureOffsetY: number;
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface ModelHit {
  u: number | null;
  v: number | null;
  canvasX: number;
  canvasY: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  object: THREE.Mesh;
}

interface DecalItem {
  id: string;
  type: string;
  name: string;
}

interface DecalAssetLoaded {
  texture: THREE.Texture;
  aspect: number;
}

interface DecalBuildOptions {
  id: string;
  label: string;
  type: string;
  dataUrl: string;
  texture: THREE.Texture;
  scale: number;
  rotation: number;
  aspect: number;
}

interface DecalChangeData {
  id: string;
  type: string;
  name: string;
  dataUrl: string;
  canvasX: number;
  canvasY: number;
  scale: number;
  aspect: number;
}

export function useViewer3D(containerId: string, options: ViewerOptions = {}) {
  const loading: Ref<boolean> = ref(true);
  const scene: ShallowRef<THREE.Scene | null> = shallowRef(null);
  const camera: ShallowRef<THREE.PerspectiveCamera | null> = shallowRef(null);
  const renderer: ShallowRef<THREE.WebGLRenderer | null> = shallowRef(null);
  const controls: ShallowRef<OrbitControls | null> = shallowRef(null);
  const decalItems: Ref<DecalItem[]> = ref([]);
  const selectedDecalId: Ref<string> = ref('');

  let allMeshes: THREE.Mesh[] = [];
  let decalMeshes: THREE.Group[] = [];
  let modelRoot: THREE.Object3D | null = null;
  let decalRoot: THREE.Group | null = null;
  let cachedCanvasSource: HTMLCanvasElement | null = null;
  let uvConfig: UVConfig | null = null;
  let cachedUVTemplateUrl: string | null = null;
  let onUVTemplateReady: ((url: string) => void) | null = null;
  let animFrameId: number | null = null;
  let container: HTMLElement | null = null;
  let editorMode: string = 'uv2d';
  let baseColor: string = '#ffffff';
  let decalCounter = 1;
  let onDecalChange: ((data: DecalChangeData[]) => void) | null = null;

  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();

  const modelUrl = options.modelUrl || '/api/models/2.glb';
  const useDirectUvSpace = options.useDirectUvSpace || false;
  const textureCanvasSize = 1024;
  const uvTemplatePaddingRatio = 0.06;

  function init(): void {
    container = document.getElementById(containerId);
    if (!container) return;

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

  function addLights(s: THREE.Scene): void {
    s.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(5, 10, 7);
    s.add(dir);
    const back = new THREE.DirectionalLight(0xffffff, 0.5);
    back.position.set(-5, 5, -10);
    s.add(back);
  }

  function initDecalRoot(s: THREE.Scene): void {
    decalRoot = new THREE.Group();
    decalRoot.name = 'DecalRoot';
    decalRoot.visible = editorMode === '3d';
    s.add(decalRoot);
  }

  function initPlaceholder(s: THREE.Scene): void {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(10, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    );
    box.name = 'PlaceholderBox';
    s.add(box);
    allMeshes = [box];
  }

  function loadModel(): void {
    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        const s = scene.value;
        if (!s) return;
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
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = createBaseMaterial();
            allMeshes.push(child as THREE.Mesh);
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

  function createBaseMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: editorMode === '3d' ? baseColor : '#ffffff',
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: false,
    });
  }

  function publishUVTemplate(): void {
    const canvas = createCombinedUVCanvas(allMeshes, textureCanvasSize, uvTemplatePaddingRatio, uvConfig);
    if (!canvas) return;
    cachedUVTemplateUrl = canvas.toDataURL('image/png');
    if (onUVTemplateReady) onUVTemplateReady(cachedUVTemplateUrl);
  }

  function setUVTemplateListener(listener: (url: string) => void): void {
    onUVTemplateReady = listener;
    if (listener && cachedUVTemplateUrl) listener(cachedUVTemplateUrl);
  }

  function updateTexture(canvasElement: HTMLCanvasElement): void {
    cachedCanvasSource = canvasElement;
    if (editorMode !== 'uv2d' || allMeshes.length === 0 || !uvConfig) return;

    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      const uv = getMeshUVAttribute(mesh);
      if (!uv) return;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.map) {
        mat.map.dispose();
      }

      const texture = new THREE.CanvasTexture(canvasElement);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.center.set(0, 0);
      texture.rotation = 0;
      texture.flipY = false;

      if (useDirectUvSpace) {
        texture.repeat.set(1, 1);
        texture.offset.set(0, 0);
      } else {
        texture.repeat.set(uvConfig!.textureScale, uvConfig!.textureScale);
        texture.offset.set(uvConfig!.textureOffsetX, uvConfig!.textureOffsetY);
      }

      mat.map = texture;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    });
  }

  function applyRenderMode(): void {
    if (!allMeshes.length) return;

    const is3DMode = editorMode === '3d';
    if (decalRoot) decalRoot.visible = is3DMode;

    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (is3DMode) {
        if (mat.map) {
          mat.map.dispose();
          mat.map = null;
        }
        mat.color.set(baseColor);
        mat.needsUpdate = true;
      } else {
        mat.color.set('#ffffff');
        mat.needsUpdate = true;
      }
    });

    if (!is3DMode && cachedCanvasSource) {
      updateTexture(cachedCanvasSource);
    }
  }

  function setEditorMode(mode: string): void {
    editorMode = mode === '3d' ? '3d' : 'uv2d';
    if (editorMode !== '3d') {
      clearSelectedDecal();
    }
    applyRenderMode();
  }

  function setBaseColor(color: string): void {
    baseColor = color;
    if (editorMode !== '3d') return;

    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(color);
      mat.needsUpdate = true;
    });
  }

  function start(): void {
    animate();
  }

  function animate(): void {
    animFrameId = requestAnimationFrame(animate);
    controls.value?.update();
    if (scene.value && camera.value) {
      renderer.value?.render(scene.value, camera.value);
    }
  }

  function onResize(): void {
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

  function uvToCanvas(u: number, v: number): CanvasPoint {
    if (useDirectUvSpace || !uvConfig) {
      return { x: u * textureCanvasSize, y: v * textureCanvasSize };
    }
    return {
      x: uvConfig.offsetX + (u - uvConfig.minU) * uvConfig.pixelScale,
      y: uvConfig.offsetY + (v - uvConfig.minV) * uvConfig.pixelScale,
    };
  }

  function raycastObjects(clientX: number, clientY: number, objects: THREE.Mesh[]): THREE.Intersection[] {
    if (!container || !camera.value || !renderer.value || !objects.length) return [];

    const rect = renderer.value.domElement.getBoundingClientRect();
    mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera.value);
    return raycaster.intersectObjects(objects, false);
  }

  function raycastModel(clientX: number, clientY: number): ModelHit | null {
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
      object: hit.object as THREE.Mesh,
    };
  }

  function raycastUV(clientX: number, clientY: number): ModelHit | null {
    const hit = raycastModel(clientX, clientY);
    if (!hit || hit.u == null || hit.v == null) return null;
    return hit;
  }

  function pickDecal(clientX: number, clientY: number): THREE.Group | null {
    // Collect all child meshes from decal groups for raycasting
    const parts: THREE.Mesh[] = [];
    decalMeshes.forEach((g) => g.traverse((c) => { if ((c as THREE.Mesh).isMesh) parts.push(c as THREE.Mesh); }));
    if (!parts.length) return null;
    const intersects = raycastObjects(clientX, clientY, parts);
    if (!intersects.length) return null;
    // Walk up to the Group that has userData.id
    let obj: THREE.Object3D | null = intersects[0].object;
    while (obj && !obj.userData?.id && obj.parent) obj = obj.parent;
    return obj?.userData?.id ? obj as THREE.Group : null;
  }

  async function addDecalAtClient(dataUrl: string, clientX: number, clientY: number, options: Record<string, any> = {}): Promise<THREE.Group | null> {
    const hit = raycastModel(clientX, clientY);
    if (!hit) return null;
    return addDecalAtHit(dataUrl, hit, options);
  }

  async function addDecalAtHit(dataUrl: string, hit: ModelHit, options: Record<string, any> = {}): Promise<THREE.Group | null> {
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

    decalRoot!.add(decalMesh);
    decalMeshes.push(decalMesh);
    refreshDecalItems();
    selectDecalById(id);
    notifyDecalChange();
    return decalMesh;
  }

  function buildDecalMesh(hit: ModelHit, asset: DecalBuildOptions): THREE.Group {
    const group = new THREE.Group();
    group.name = `Decal_${asset.id}`;

    const position = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.01));
    const orientation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        hit.normal.clone().normalize(),
      ),
    );
    orientation.z += asset.rotation;

    // Keep projection depth small to reduce deformation on curved surfaces
    const depthScale = Math.min(asset.scale * 0.35, 2.0);
    const size = new THREE.Vector3(asset.scale * asset.aspect, asset.scale, depthScale);

    // Project onto every model mesh so decal spans across panels
    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      try {
        const geom = new DecalGeometry(mesh, position, orientation, size);
        if (!geom.attributes.position || geom.attributes.position.count === 0) {
          geom.dispose();
          return;
        }
        const mat = new THREE.MeshStandardMaterial({
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
        const part = new THREE.Mesh(geom, mat);
        part.renderOrder = 10;
        group.add(part);
      } catch (_e) {
        // mesh not intersected by decal projection, skip
      }
    });

    group.userData = {
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
    return group;
  }

  function selectDecalAt(clientX: number, clientY: number): THREE.Group | null {
    const mesh = pickDecal(clientX, clientY);
    if (!mesh) return null;
    selectDecalById(mesh.userData.id);
    return mesh;
  }

  function selectDecalById(id: string): void {
    selectedDecalId.value = id || '';
    syncDecalHighlight();
  }

  function clearSelectedDecal(): void {
    selectedDecalId.value = '';
    syncDecalHighlight();
  }

  function moveSelectedDecalTo(clientX: number, clientY: number): THREE.Group | null {
    const id = selectedDecalId.value;
    if (!id) return null;

    const group = decalMeshes.find((item) => item.userData.id === id);
    const hit = raycastModel(clientX, clientY);
    if (!group || !hit) return null;

    // Save texture reference before disposing old children
    let savedTexture: THREE.Texture | null = null;
    const oldChildren = [...group.children];
    oldChildren.forEach((c) => {
      const meshChild = c as THREE.Mesh;
      if (meshChild.isMesh && (meshChild.material as THREE.MeshStandardMaterial)?.map && !savedTexture) {
        savedTexture = (meshChild.material as THREE.MeshStandardMaterial).map;
      }
      meshChild.geometry?.dispose();
      if (meshChild.material) {
        (meshChild.material as THREE.MeshStandardMaterial).map = null;
        (meshChild.material as THREE.Material).dispose();
      }
      group.remove(c);
    });

    const position = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.01));
    const orientation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        hit.normal.clone().normalize(),
      ),
    );
    orientation.z += group.userData.rotation;
    const depthScale = Math.min(group.userData.scale * 0.35, 2.0);
    const size = new THREE.Vector3(group.userData.scale * group.userData.aspect, group.userData.scale, depthScale);

    // Re-project onto all meshes at new position
    allMeshes.forEach((mesh) => {
      if (mesh.name === 'PlaceholderBox') return;
      try {
        const geom = new DecalGeometry(mesh, position, orientation, size);
        if (!geom.attributes.position || geom.attributes.position.count === 0) {
          geom.dispose();
          return;
        }
        const mat = new THREE.MeshStandardMaterial({
          map: savedTexture,
          transparent: true,
          alphaTest: 0.05,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          side: THREE.DoubleSide,
          emissive: new THREE.Color(0x2563eb),
          emissiveIntensity: group.userData.id === selectedDecalId.value ? 0.22 : 0,
        });
        const part = new THREE.Mesh(geom, mat);
        part.renderOrder = group.userData.id === selectedDecalId.value ? 12 : 10;
        group.add(part);
      } catch (_e) { /* skip */ }
    });

    group.userData.point = hit.point.clone();
    group.userData.normal = hit.normal.clone();
    group.userData.targetUuid = hit.object.uuid;
    group.userData.canvasX = hit.canvasX ?? group.userData.canvasX;
    group.userData.canvasY = hit.canvasY ?? group.userData.canvasY;
    notifyDecalChange();
    return group;
  }

  function removeDecalById(id: string): void {
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

  function removeSelectedDecal(): boolean {
    if (!selectedDecalId.value) return false;
    removeDecalById(selectedDecalId.value);
    return true;
  }

  function refreshDecalItems(): void {
    decalItems.value = decalMeshes
      .map((mesh) => ({
        id: mesh.userData.id as string,
        type: (mesh.userData.type as string) || 'image',
        name: (mesh.userData.name as string) || '贴花',
      }))
      .reverse();
  }

  function syncDecalHighlight(): void {
    decalMeshes.forEach((group) => {
      const active = group.userData.id === selectedDecalId.value;
      group.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = active ? 0.22 : 0;
        child.renderOrder = active ? 12 : 10;
      });
    });
  }

  function getDecalState(): Record<string, any>[] {
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

  function setOrbitEnabled(enabled: boolean): void {
    if (controls.value) controls.value.enabled = enabled;
  }

  function getRendererDom(): HTMLCanvasElement | null {
    return renderer.value?.domElement ?? null;
  }

  function setDecalChangeCallback(fn: (data: DecalChangeData[]) => void): void {
    onDecalChange = fn;
  }

  function notifyDecalChange(): void {
    if (!onDecalChange) return;
    const data: DecalChangeData[] = decalMeshes.map((m) => ({
      id: m.userData.id as string,
      type: m.userData.type as string,
      name: m.userData.name as string,
      dataUrl: m.userData.dataUrl as string,
      canvasX: (m.userData.canvasX as number) ?? 0,
      canvasY: (m.userData.canvasY as number) ?? 0,
      scale: m.userData.scale as number,
      aspect: m.userData.aspect as number,
    }));
    onDecalChange(data);
  }

  function disposeAllDecals(): void {
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

function getMeshUVAttribute(mesh: THREE.Mesh): THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null {
  if (!mesh.geometry?.attributes) return null;
  return (mesh.geometry.attributes.uv || (mesh.geometry.attributes as any).uv2 || null) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
}

interface UVBounds {
  minU: number;
  minV: number;
  rangeU: number;
  rangeV: number;
}

function analyzeUVBounds(meshes: THREE.Mesh[], canvasSize: number = 1024, paddingRatio: number = 0.06): UVConfig | null {
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

interface UVCanvasLayout {
  pixelScale: number;
  contentWidth: number;
  contentHeight: number;
  offsetX: number;
  offsetY: number;
  textureScale: number;
  textureOffsetX: number;
  textureOffsetY: number;
}

function computeUvCanvasLayout(bounds: UVBounds, canvasSize: number, paddingRatio: number): UVCanvasLayout {
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

interface UVTrianglePoint {
  u: number;
  v: number;
  x: number;
  y: number;
}

function createCombinedUVCanvas(meshes: THREE.Mesh[], size: number, paddingRatio: number, uvConfig: UVConfig | null): HTMLCanvasElement | null {
  const bounds = uvConfig || analyzeUVBounds(meshes, size, paddingRatio);
  if (!bounds) return null;

  const mapX = (u: number): number => bounds.offsetX + (u - bounds.minU) * bounds.pixelScale;
  const mapY = (v: number): number => bounds.offsetY + (v - bounds.minV) * bounds.pixelScale;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
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

function collectTriangles(mesh: THREE.Mesh, uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, mapX: (u: number) => number, mapY: (v: number) => number): UVTrianglePoint[][] {
  const idx = mesh.geometry.index;
  const count = idx ? idx.count : uv.count;
  const triangles: UVTrianglePoint[][] = [];
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

interface BoundaryEdge {
  a: UVTrianglePoint;
  b: UVTrianglePoint;
  count: number;
}

function extractBoundary(triangles: UVTrianglePoint[][]): [UVTrianglePoint, UVTrianglePoint][] {
  const map = new Map<string, BoundaryEdge>();
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

function getWorldNormal(hit: THREE.Intersection): THREE.Vector3 {
  const normal = hit.face?.normal?.clone() || new THREE.Vector3(0, 0, 1);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  normal.applyMatrix3(normalMatrix).normalize();
  return normal;
}

function disposeDecalMesh(group: THREE.Group): void {
  if (group.traverse) {
    group.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const meshChild = child as THREE.Mesh;
      meshChild.geometry?.dispose();
      const mat = meshChild.material as THREE.MeshStandardMaterial;
      if (mat?.map) mat.map.dispose();
      mat?.dispose?.();
    });
  } else {
    const meshGroup = group as unknown as THREE.Mesh;
    meshGroup.geometry?.dispose();
    const mat = meshGroup.material as THREE.MeshStandardMaterial;
    if (mat?.map) mat.map.dispose();
    mat?.dispose?.();
  }
  group.parent?.remove(group);
}

function loadDecalAsset(dataUrl: string): Promise<DecalAssetLoaded> {
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

function getDefaultDecalLabel(type: string, id: string): string {
  const index = id.split('-').pop();
  const map: Record<string, string> = {
    image: '图片贴花',
    text: '文字贴花',
    rect: '矩形贴花',
    circle: '圆形贴花',
    triangle: '三角贴花',
    line: '线条贴花',
  };
  return `${map[type] || '3D 贴花'} ${index}`;
}
