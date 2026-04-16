import { onMounted, onBeforeUnmount, shallowRef } from 'vue';
import { fabric } from 'fabric';

/**
 * Composable wrapping the Fabric.js 2D texture editor.
 * Returns reactive refs and methods for the parent component.
 */
export function useEditor2D(canvasId) {
  const canvas = shallowRef(null);
  let uvBackgroundImage = null;
  let onUpdate = null;
  let cleanupPanZoom = null;

  function init() {
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

    canvas.value = c;
    cleanupPanZoom = initPanZoom(c);
  }

  // ── Pan / Zoom ──────────────────────────────────
  function initPanZoom(c) {
    const wrapper = document.getElementById('canvas-wrapper');
    const container = wrapper.querySelector('.canvas-container');

    let scale = 0.35;
    let panX = (wrapper.clientWidth - 1024 * scale) / 2;
    let panY = (wrapper.clientHeight - 1024 * scale) / 2;
    let isSpacePressed = false;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const updateTransform = () => {
      container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    };
    updateTransform();

    const setPanMode = (enabled) => {
      isSpacePressed = enabled;
      c.selection = !enabled;
      c.forEachObject((o) => {
        o.selectable = !enabled;
        o.evented = !enabled;
      });
      const cursor = enabled ? 'grab' : 'default';
      wrapper.style.cursor = cursor;
      c.defaultCursor = cursor;
      c.requestRenderAll();
    };

    const onKeyDown = (e) => {
      if (e.code === 'Space' && !isSpacePressed) {
        e.preventDefault();
        setPanMode(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        setPanMode(false);
        isDragging = false;
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const newScale = scale - e.deltaY * 0.001;
      if (newScale > 0.1 && newScale < 3.0) {
        scale = newScale;
        updateTransform();
      }
    };

    const onMouseDown = (e) => {
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

    const onMouseMove = (e) => {
      if (isDragging) {
        e.preventDefault();
        panX += e.clientX - lastX;
        panY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        updateTransform();
      }
    };

    const onMouseUp = () => {
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

  function setUVBackground(url) {
    const c = canvas.value;
    if (!c) return;
    fabric.Image.fromURL(
      url,
      (img) => {
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
      },
      { crossOrigin: 'anonymous' },
    );
  }

  function addText() {
    const c = canvas.value;
    const text = new fabric.Text('Design', { left: 300, top: 300, fontSize: 60, fill: '#333' });
    c.add(text);
    c.setActiveObject(text);
  }

  function addRect() {
    const c = canvas.value;
    c.add(new fabric.Rect({ left: 200, top: 200, fill: 'orange', width: 100, height: 100 }));
  }

  function addCircle() {
    const c = canvas.value;
    c.add(new fabric.Circle({ left: 250, top: 250, radius: 50, fill: '#3498db' }));
  }

  function addTriangle() {
    const c = canvas.value;
    c.add(new fabric.Triangle({ left: 300, top: 200, width: 100, height: 100, fill: '#2ecc71' }));
  }

  function addLine() {
    const c = canvas.value;
    c.add(new fabric.Line([200, 300, 400, 300], { stroke: '#333', strokeWidth: 3 }));
  }

  function addImage(dataUrl) {
    const c = canvas.value;
    fabric.Image.fromURL(dataUrl, (img) => {
      img.scaleToWidth(200);
      c.add(img);
      c.centerObject(img);
    });
  }

  function addImageAt(dataUrl, x, y) {
    const c = canvas.value;
    fabric.Image.fromURL(dataUrl, (img) => {
      img.scaleToWidth(200);
      img.set({
        left: x - img.getScaledWidth() / 2,
        top: y - img.getScaledHeight() / 2,
      });
      c.add(img);
      c.setActiveObject(img);
      c.requestRenderAll();
    });
  }

  function getObjectAtPoint(x, y) {
    const c = canvas.value;
    if (!c) return null;
    const point = new fabric.Point(x, y);
    const objects = c.getObjects().filter((o) => o !== uvBackgroundImage && o.selectable !== false);
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].containsPoint(point)) {
        c.setActiveObject(objects[i]);
        c.requestRenderAll();
        return objects[i];
      }
    }
    return null;
  }

  function moveObjectBy(obj, dx, dy) {
    const c = canvas.value;
    if (!c || !obj) return;
    obj.set({ left: obj.left + dx, top: obj.top + dy });
    obj.setCoords();
    c.requestRenderAll();
  }

  function setBackground(color) {
    const c = canvas.value;
    c.backgroundColor = color;
    c.requestRenderAll();
  }

  function getElement() {
    return canvas.value?.getElement() ?? null;
  }

  function setOnUpdate(fn) {
    onUpdate = fn;
  }

  function getCanvasJSON() {
    return canvas.value?.toJSON() ?? null;
  }

  function loadCanvasJSON(json) {
    canvas.value?.loadFromJSON(json, () => canvas.value.requestRenderAll());
  }

  // ── Lifecycle ───────────────────────────────────
  onMounted(() => init());
  onBeforeUnmount(() => {
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
    getObjectAtPoint,
    moveObjectBy,
  };
}
