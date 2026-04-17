/**
 * Composable that bridges the 2D editor and 3D viewer.
 * Listens to editor canvas changes and pushes them to the 3D texture.
 */

interface EditorInstance {
  setOnUpdate: (fn: () => void) => void;
  getElement: () => HTMLCanvasElement | null;
}

interface ViewerInstance {
  updateTexture: (el: HTMLCanvasElement) => void;
}

export function useBridge(editor: EditorInstance, viewer: ViewerInstance): void {
  let isUpdatePending = false;

  editor.setOnUpdate(() => {
    if (!isUpdatePending) {
      isUpdatePending = true;
      requestAnimationFrame(() => {
        viewer.updateTexture(editor.getElement()!);
        isUpdatePending = false;
      });
    }
  });

  // Initial sync after a short delay
  setTimeout(() => {
    const el = editor.getElement();
    if (el) viewer.updateTexture(el);
  }, 200);
}
