import { onMounted, onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { fabric } from 'fabric';

/**
 * Composable wrapping the Fabric.js 2D texture editor.
 * Returns reactive refs and methods for the parent component.
 */

interface LayerItem {
  id: string;
  type: string;
  name: string;
}

interface DecalOverlay {
  id: string;
  dataUrl: string;
  canvasX: number;
  canvasY: number;
  scale?: number;
  aspect?: number;
}

export function useEditor2D(canvasId: string) {
  const canvas: ShallowRef<any> = shallowRef(null);
  const layerItems: Ref<LayerItem[]> = ref([]);
  const selectedObjectId: Ref<string> = ref('');
  let uvBackgroundImage: any = null;
  let onUpdate: (() => void) | null = null;
  let cleanupPanZoom: (() => void) | null = null;
  let nextObjectId = 1;

  function init(): void {
    const c = new fabric.Canvas(canvasId, {
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      width: 1024,
      height: 1024,
      selection: true,
    });

    c.on('after:render', () => {
      if (onUpdate) onUpdate();
    });

    c.on('object:added', refreshLayers);
    c.on('object:removed', refreshLayers);
    c.on('object:modified', refreshLayers);
    c.on('selection:created', syncSelectionFromCanvas);
    c.on('selection:updated', syncSelectionFromCanvas);
    c.on('selection:cleared', clearSelection);

    canvas.value = c;
    cleanupPanZoom = initPanZoom(c);
    window.addEventListener('keydown', onDeleteKeyDown);
    refreshLayers();
  }

  // ── Pan / Zoom ──────────────────────────────────
  function initPanZoom(c: any): () => void {
    const wrapper = document.getElementById('canvas-wrapper')!;
    const container = wrapper.querySelector('.canvas-container') as HTMLElement;

    let scale = 0.35;
    let panX = (wrapper.clientWidth - 1024 * scale) / 2;
    let panY = (wrapper.clientHeight - 1024 * scale) / 2;
    let isSpacePressed = false;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const updateTransform = (): void => {
      container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    };
    updateTransform();

    const setPanMode = (enabled: boolean): void => {
      isSpacePressed = enabled;
      c.selection = !enabled;
      c.forEachObject((o: any) => {
        o.selectable = !enabled;
        o.evented = !enabled;
      });
      const cursor = enabled ? 'grab' : 'default';
      wrapper.style.cursor = cursor;
      c.defaultCursor = cursor;
      c.requestRenderAll();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !isSpacePressed) {
        e.preventDefault();
        setPanMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        setPanMode(false);
        isDragging = false;
      }
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const newScale = scale - e.deltaY * 0.001;
      if (newScale > 0.1 && newScale < 3.0) {
        scale = newScale;
        updateTransform();
      }
    };

    const onMouseDown = (e: MouseEvent): void => {
      if (isSpacePressed || e.button === 1) {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        wrapper.style.cursor = 'grabbing';
        c.defaultCursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onMouseMove = (e: MouseEvent): void => {
      if (isDragging) {
        e.preventDefault();
        panX += e.clientX - lastX;
        panY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        updateTransform();
      }
    };

    const onMouseUp = (): void => {
      if (isDragging) {
        isDragging = false;
        if (isSpacePressed) {
          wrapper.style.cursor = 'grab';
          c.defaultCursor = 'grab';
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    wrapper.addEventListener('wheel', onWheel, { passive: false });
    wrapper.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      wrapper.removeEventListener('wheel', onWheel);
      wrapper.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }

  // ── Public methods ──────────────────────────────

  function setUVBackground(url: string): void {
    const c = canvas.value;
    if (!c) return;
    fabric.Image.fromURL(
      url,
      (img: any) => {
        img.scaleToWidth(c.width);
        img.scaleToHeight(c.height);
        img.set({
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
          opacity: 0.45,
          excludeFromExport: true,
        });
        if (uvBackgroundImage) c.remove(uvBackgroundImage);
        uvBackgroundImage = img;
        c.add(img);
        c.sendToBack(img);
        c.requestRenderAll();
        refreshLayers();
      },
      { crossOrigin: 'anonymous' },
    );
  }

  function addText(): void {
    const c = canvas.value;
    const text = new fabric.Text('Design', { left: 300, top: 300, fontSize: 60, fill: '#333' });
    decorateObject(text, 'text', '文字');
    c.add(text);
    c.setActiveObject(text);
  }

  function addRect(): void {
    const c = canvas.value;
    const rect = new fabric.Rect({ left: 200, top: 200, fill: 'orange', width: 100, height: 100 });
    decorateObject(rect, 'rect', '矩形');
    c.add(rect);
    c.setActiveObject(rect);
  }

  function addCircle(): void {
    const c = canvas.value;
    const circle = new fabric.Circle({ left: 250, top: 250, radius: 50, fill: '#3498db' });
    decorateObject(circle, 'circle', '圆形');
    c.add(circle);
    c.setActiveObject(circle);
  }

  function addTriangle(): void {
    const c = canvas.value;
    const triangle = new fabric.Triangle({ left: 300, top: 200, width: 100, height: 100, fill: '#2ecc71' });
    decorateObject(triangle, 'triangle', '三角形');
    c.add(triangle);
    c.setActiveObject(triangle);
  }

  function addLine(): void {
    const c = canvas.value;
    const line = new fabric.Line([200, 300, 400, 300], { stroke: '#333', strokeWidth: 3 });
    decorateObject(line, 'line', '线条');
    c.add(line);
    c.setActiveObject(line);
  }

  function addImage(dataUrl: string): void {
    const c = canvas.value;
    fabric.Image.fromURL(dataUrl, (img: any) => {
      img.scaleToWidth(200);
      decorateObject(img, 'image', '图片');
      c.add(img);
      c.centerObject(img);
      c.setActiveObject(img);
      c.requestRenderAll();
    });
  }

  function addImageAt(dataUrl: string, x: number, y: number): void {
    const c = canvas.value;
    fabric.Image.fromURL(dataUrl, (img: any) => {
      img.scaleToWidth(200);
      decorateObject(img, 'image', '图片');
      img.set({
        left: x - img.getScaledWidth() / 2,
        top: y - img.getScaledHeight() / 2,
      });
      c.add(img);
      c.setActiveObject(img);
      c.requestRenderAll();
    });
  }

  function getObjectAtPoint(x: number, y: number): any {
    const c = canvas.value;
    if (!c) return null;
    const point = new fabric.Point(x, y);
    const objects = c.getObjects().filter((o: any) => o !== uvBackgroundImage && o.selectable !== false);
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].containsPoint(point)) {
        c.setActiveObject(objects[i]);
        c.requestRenderAll();
        return objects[i];
      }
    }
    return null;
  }

  function moveObjectBy(obj: any, dx: number, dy: number): void {
    const c = canvas.value;
    if (!c || !obj) return;
    obj.set({ left: obj.left + dx, top: obj.top + dy });
    obj.setCoords();
    c.requestRenderAll();
  }

  function setBackground(color: string): void {
    const c = canvas.value;
    c.backgroundColor = color;
    c.requestRenderAll();
  }

  function selectObjectById(id: string): void {
    const c = canvas.value;
    if (!c) return;
    const target = c.getObjects().find((obj: any) => obj.customId === id);
    if (!target) return;
    c.setActiveObject(target);
    target.setCoords();
    c.requestRenderAll();
    syncSelectionFromCanvas();
  }

  function removeObjectById(id: string): void {
    const c = canvas.value;
    if (!c) return;
    const target = c.getObjects().find((obj: any) => obj.customId === id);
    if (!target || target === uvBackgroundImage) return;
    c.remove(target);
    c.discardActiveObject();
    c.requestRenderAll();
    refreshLayers();
  }

  function removeActiveObject(): boolean {
    const active = canvas.value?.getActiveObject();
    if (!active || active === uvBackgroundImage) return false;
    removeObjectById(active.customId);
    return true;
  }

  function getElement(): HTMLCanvasElement | null {
    return canvas.value?.getElement() ?? null;
  }

  function setOnUpdate(fn: () => void): void {
    onUpdate = fn;
  }

  function getCanvasJSON(): any {
    return canvas.value?.toJSON(['customId', 'customType', 'displayName']) ?? null;
  }

  function loadCanvasJSON(json: any): void {
    canvas.value?.loadFromJSON(json, () => {
      ensureObjectMetadata();
      refreshLayers();
      canvas.value.requestRenderAll();
    });
  }

  function decorateObject(obj: any, type: string, label: string): any {
    obj.customId = `layer-${nextObjectId++}`;
    obj.customType = type;
    obj.displayName = `${label} ${nextObjectId - 1}`;
    return obj;
  }

  function ensureObjectMetadata(): void {
    const c = canvas.value;
    if (!c) return;

    c.getObjects().forEach((obj: any) => {
      if (obj === uvBackgroundImage || obj.selectable === false) return;
      if (!obj.customId) obj.customId = `layer-${nextObjectId++}`;
      if (!obj.customType) obj.customType = inferObjectType(obj);
      if (!obj.displayName) obj.displayName = `${getTypeLabel(obj.customType)} ${nextObjectId - 1}`;
    });
  }

  function refreshLayers(): void {
    const c = canvas.value;
    if (!c) return;

    ensureObjectMetadata();
    layerItems.value = c
      .getObjects()
      .filter((obj: any) => obj !== uvBackgroundImage && obj.selectable !== false)
      .map((obj: any) => ({
        id: obj.customId,
        type: obj.customType,
        name: obj.displayName,
      }))
      .reverse();

    syncSelectionFromCanvas();
  }

  function syncSelectionFromCanvas(): void {
    const active = canvas.value?.getActiveObject();
    selectedObjectId.value = active?.customId || '';
  }

  function clearSelection(): void {
    selectedObjectId.value = '';
  }

  function onDeleteKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;
    if (removeActiveObject()) event.preventDefault();
  }

  /**
   * Sync 3D decal overlays onto the 2D canvas (read-only visual indicators).
   * Called when decals change in 3D mode so the user can see the flat UV mapping.
   */
  function syncDecalOverlays(decals: DecalOverlay[]): void {
    const c = canvas.value;
    if (!c) return;

    // Remove existing synced overlays
    const existing = c.getObjects().filter((o: any) => o._syncedDecal);
    existing.forEach((o: any) => c.remove(o));

    if (!decals || !decals.length) {
      c.requestRenderAll();
      return;
    }

    decals.forEach((d: DecalOverlay) => {
      fabric.Image.fromURL(
        d.dataUrl,
        (img: any) => {
          if (!img || !img.width) return;
          // Scale the decal image to a reasonable size on the 1024 canvas
          const displayWidth = (d.scale || 4.8) * 28;
          const scaleRatio = displayWidth / img.width;
          img.set({
            left: d.canvasX - (img.width * scaleRatio) / 2,
            top: d.canvasY - (img.height * scaleRatio) / 2,
            scaleX: scaleRatio,
            scaleY: scaleRatio,
            selectable: false,
            evented: false,
            opacity: 0.75,
            _syncedDecal: true,
            _syncedDecalId: d.id,
          });
          c.add(img);
          c.requestRenderAll();
        },
        { crossOrigin: 'anonymous' },
      );
    });
  }

  function clearDecalOverlays(): void {
    const c = canvas.value;
    if (!c) return;
    const existing = c.getObjects().filter((o: any) => o._syncedDecal);
    existing.forEach((o: any) => c.remove(o));
    c.requestRenderAll();
  }

  function inferObjectType(obj: any): string {
    if (obj.type === 'image') return 'image';
    if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') return 'text';
    return obj.type || 'shape';
  }

  function getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      image: '图片',
      text: '文字',
      rect: '矩形',
      circle: '圆形',
      triangle: '三角形',
      line: '线条',
      shape: '图形',
    };
    return map[type] || '素材';
  }

  // ── Lifecycle ───────────────────────────────────
  onMounted(() => init());
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onDeleteKeyDown);
    if (cleanupPanZoom) cleanupPanZoom();
    canvas.value?.dispose();
  });

  return {
    canvas,
    addText,
    addRect,
    addCircle,
    addTriangle,
    addLine,
    addImage,
    addImageAt,
    setBackground,
    setUVBackground,
    getElement,
    setOnUpdate,
    getCanvasJSON,
    loadCanvasJSON,
    layerItems,
    selectedObjectId,
    selectObjectById,
    removeObjectById,
    removeActiveObject,
    getObjectAtPoint,
    moveObjectBy,
    syncDecalOverlays,
    clearDecalOverlays,
  };
}
