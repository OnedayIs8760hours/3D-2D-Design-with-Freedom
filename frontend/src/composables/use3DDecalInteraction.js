import { ref, watch, onBeforeUnmount } from 'vue';

/**
 * Interaction layer for the isolated 3D-driven decal editor.
 * Assets are placed directly onto the 3D model and managed independently
 * from the UV/2D workflow.
 */
export function use3DDecalInteraction(modeRef, pendingAssetRef) {
  const editMode = ref(false);
  let viewer = null;
  let containerEl = null;
  let isDragging = false;

  function init(viewerInstance) {
    viewer = viewerInstance;
    containerEl = document.getElementById('viewer-container');
    if (!containerEl) return;

    containerEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    containerEl.addEventListener('dragover', onDragOver);
    containerEl.addEventListener('drop', onDrop);
  }

  function destroy() {
    if (!containerEl) return;
    containerEl.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    containerEl.removeEventListener('dragover', onDragOver);
    containerEl.removeEventListener('drop', onDrop);
  }

  watch(
    () => [modeRef.value, editMode.value, Boolean(pendingAssetRef.value)],
    ([mode, canEdit, hasPending]) => {
      if (!viewer) return;
      const shouldCaptureSurface = mode === '3d' && (canEdit || hasPending);
      viewer.setOrbitEnabled(!shouldCaptureSurface);
      if (containerEl) {
        containerEl.style.cursor = shouldCaptureSurface
          ? (hasPending ? 'copy' : 'crosshair')
          : '';
      }
    },
    { immediate: true },
  );

  function onPointerDown(event) {
    if (modeRef.value !== '3d' || !viewer) return;

    if (pendingAssetRef.value) {
      placePendingAsset(event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!editMode.value) return;

    const picked = viewer.selectDecalAt(event.clientX, event.clientY);
    if (!picked) {
      viewer.clearSelectedDecal();
      return;
    }

    isDragging = true;
    if (containerEl) containerEl.style.cursor = 'grabbing';
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event) {
    if (modeRef.value !== '3d' || !editMode.value || !isDragging || !viewer) return;
    viewer.moveSelectedDecalTo(event.clientX, event.clientY);
    event.preventDefault();
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    if (containerEl) {
      containerEl.style.cursor = pendingAssetRef.value ? 'copy' : 'crosshair';
    }
  }

  function onDragOver(event) {
    if (modeRef.value !== '3d') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onDrop(event) {
    if (modeRef.value !== '3d' || !viewer) return;
    event.preventDefault();

    const files = event.dataTransfer.files;
    if (!files?.length) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        await viewer.addDecalAtClient(loadEvent.target.result, event.clientX, event.clientY, {
          type: 'image',
          label: file.name.replace(/\.[^.]+$/, '') || '图片贴花',
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function onKeyDown(event) {
    if (modeRef.value !== '3d') return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const target = event.target;
    const tagName = target?.tagName?.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;
    if (viewer?.removeSelectedDecal?.()) {
      event.preventDefault();
    }
  }

  async function placePendingAsset(clientX, clientY) {
    if (!viewer || !pendingAssetRef.value) return;

    const asset = pendingAssetRef.value;
    const placed = await viewer.addDecalAtClient(asset.dataUrl, clientX, clientY, {
      type: asset.type,
      label: asset.label,
      scale: asset.scale,
      rotation: asset.rotation,
    });

    if (placed) pendingAssetRef.value = null;
  }

  onBeforeUnmount(() => destroy());

  return {
    editMode,
    init,
    destroy,
  };
}
