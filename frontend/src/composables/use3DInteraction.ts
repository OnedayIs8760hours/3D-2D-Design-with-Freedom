import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

/**
 * Composable for interacting with design elements via the 3D viewer.
 * - Edit mode: click/drag on 3D surface to select/move Fabric.js objects
 * - File drop: drag image files onto the 3D model to place them at UV position
 */

interface UVHit {
  canvasX: number;
  canvasY: number;
  u: number | null;
  v: number | null;
  point: any;
  normal: any;
  object: any;
}

interface ViewerInstance {
  raycastUV: (clientX: number, clientY: number) => UVHit | null;
  setOrbitEnabled: (enabled: boolean) => void;
}

interface EditorInstance {
  getObjectAtPoint: (x: number, y: number) => any;
  moveObjectBy: (obj: any, dx: number, dy: number) => void;
  addImage: (dataUrl: string) => void;
  addImageAt: (dataUrl: string, x: number, y: number) => void;
}

export function use3DInteraction(modeRef: Ref<string>) {
  const editMode = ref(false);
  let viewer: ViewerInstance | null = null;
  let editor: EditorInstance | null = null;
  let isDragging = false;
  let dragTarget: any = null;
  let lastHit: UVHit | null = null;
  let containerEl: HTMLElement | null = null;

  function init(viewerInstance: ViewerInstance, editorInstance: EditorInstance): void {
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

  function destroy(): void {
    if (!containerEl) return;
    containerEl.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    containerEl.removeEventListener('dragover', onDragOver);
    containerEl.removeEventListener('drop', onDrop);
  }

  // Toggle orbit controls when edit mode changes
  watch(editMode, (val: boolean) => {
    if (viewer) viewer.setOrbitEnabled(!val);
    if (containerEl) containerEl.style.cursor = val ? 'crosshair' : '';
  });

  watch(
    () => modeRef?.value,
    (mode: string) => {
      if (mode !== 'uv2d') {
        editMode.value = false;
      }
    },
  );

  function onMouseDown(e: MouseEvent): void {
    if (modeRef?.value !== 'uv2d' || !editMode.value || !viewer) return;

    const hit = viewer.raycastUV(e.clientX, e.clientY);
    if (!hit) return;

    const obj = editor!.getObjectAtPoint(hit.canvasX, hit.canvasY);
    if (obj) {
      isDragging = true;
      dragTarget = obj;
      lastHit = hit;
      containerEl!.style.cursor = 'grabbing';
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onMouseMove(e: MouseEvent): void {
    if (modeRef?.value !== 'uv2d' || !isDragging || !dragTarget || !viewer) return;

    const hit = viewer.raycastUV(e.clientX, e.clientY);
    if (!hit) return;

    const dx = hit.canvasX - lastHit!.canvasX;
    const dy = hit.canvasY - lastHit!.canvasY;

    editor!.moveObjectBy(dragTarget, dx, dy);
    lastHit = hit;
    e.preventDefault();
  }

  function onMouseUp(): void {
    if (isDragging) {
      isDragging = false;
      dragTarget = null;
      lastHit = null;
      if (containerEl && editMode.value) {
        containerEl.style.cursor = 'crosshair';
      }
    }
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0 || !viewer || !editor) return;

    const hit = viewer.raycastUV(e.clientX, e.clientY);

    Array.from(files).forEach((file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        if (hit) {
          editor!.addImageAt(ev.target!.result as string, hit.canvasX, hit.canvasY);
        } else {
          editor!.addImage(ev.target!.result as string);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  onBeforeUnmount(() => destroy());

  return { editMode, init, destroy };
}
