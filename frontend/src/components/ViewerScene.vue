<template>
  <div id="viewer-container" class="viewer-container">
    <div v-if="loading" class="loading-overlay">🚀 加载模型中...</div>
  </div>
</template>

<script setup>
import { defineExpose } from 'vue';
import { useViewer3D } from '../composables/useViewer3D.js';

const props = defineProps({
  modelUrl: { type: String, default: '/api/models/2.glb' },
  uvGuideUrl: { type: String, default: '' },
  useDirectUvSpace: { type: Boolean, default: true },
});

const { loading, updateTexture, setUVTemplateListener, start } = useViewer3D('viewer-container', {
  modelUrl: props.modelUrl,
  uvGuideUrl: props.uvGuideUrl,
  useDirectUvSpace: props.useDirectUvSpace,
});

defineExpose({ updateTexture, setUVTemplateListener, start });
</script>
