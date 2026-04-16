import { ref, watch, onBeforeUnmount } from 'vue';

/**
 * Composable for interacting with design elements via the 3D viewer.
 * - Edit mode: click/drag on 3D surface to select/move Fabric.js objects
 * - File drop: drag image files onto the 3D model to place them at UV position
 */
export function use3DInteraction() {
  const editMode = ref(false);
  let viewer = null;
  let editor = null;
  let isDragging = false;
  let dragTarget = null;
  let lastHit = null;
  let containerEl = null;

  function init(viewerInstance, editorInstance) {
    viewer = viewerInstance;
    editor = editorInstance;

    containerEl = document.getElementById('viewer-container');
    if (!containerEl) return;

    containerEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    containerEl.addEventListener('dragover', onDragOver);
    containerEl.addEventListener('drop', onDrop);
  }

  function destroy() {
    if (!containerEl) return;
    containerEl.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    containerEl.removeEventListener('dragover', onDragOver);
    containerEl.removeEventListener('drop', onDrop);
  }

  // Toggle orbit controls when edit mode changes
  watch(editMode, (val) => {
    if (viewer) viewer.setOrbitEnabled(!val);
    if (containerEl) containerEl.style.cursor = val ? 'crosshair' : '';
  });

  function onMouseDown(e) {
    if (!editMode.value || !viewer) return;

    const hit = viewer.raycastUV(e.clientX, e.clientY);
    if (!hit) return;

    const obj = editor.getObjectAtPoint(hit.canvasX, hit.canvasY);
    if (obj) {
      isDragging = true;
      dragTarget = obj;
      lastHit = hit;
      containerEl.style.cursor = 'grabbing';
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onMouseMove(e) {
    if (!isDragging || !dragTarget || !viewer) return;

    const hit = viewer.raycastUV(e.clientX, e.clientY);
    if (!hit) return;

    const dx = hit.canvasX - lastHit.canvasX;
    const dy = hit.canvasY - lastHit.canvasY;

    editor.moveObjectBy(dragTarget, dx, dy);
    lastHit = hit;
    e.preventDefault();
  }

  function onMouseUp() {
    if (isDragging) {
      isDragging = false;
      dragTarget = null;
      lastHit = null;
      if (containerEl && editMode.value) {
        containerEl.style.cursor = 'crosshair';
      }
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0 || !viewer || !editor) return;

    const hit = viewer.raycastUV(e.clientX, e.clientY);

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (hit) {
          editor.addImageAt(ev.target.result, hit.canvasX, hit.canvasY);
        } else {
          editor.addImage(ev.target.result);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  onBeforeUnmount(() => destroy());

  return { editMode, init, destroy };
}
