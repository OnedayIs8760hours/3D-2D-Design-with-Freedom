/**
 * Composable that bridges the 2D editor and 3D viewer.
 * Listens to editor canvas changes and pushes them to the 3D texture.
 */
export function useBridge(editor, viewer) {
  let isUpdatePending = false;

  editor.setOnUpdate(() => {
    if (!isUpdatePending) {
      isUpdatePending = true;
      requestAnimationFrame(() => {
        viewer.updateTexture(editor.getElement());
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
