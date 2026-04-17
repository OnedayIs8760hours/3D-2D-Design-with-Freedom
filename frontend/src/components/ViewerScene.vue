<template>
  <div id="viewer-container" class="viewer-panel">
    <div v-if="loading" class="loading-overlay">
      <div class="spinner" />
      <span>加载模型中...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useViewer3D } from '../composables/useViewer3D';

const props = defineProps({
  modelUrl: { type: String, default: '/api/models/2.glb' },
  uvGuideUrl: { type: String, default: '' },
  useDirectUvSpace: { type: Boolean, default: true },
  visible: { type: Boolean, default: true },
});

const {
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
} = useViewer3D('viewer-container', {
  modelUrl: props.modelUrl,
  uvGuideUrl: props.uvGuideUrl,
  useDirectUvSpace: props.useDirectUvSpace,
});

defineExpose({
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
});
</script>
