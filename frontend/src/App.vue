<template>
  <ToolPanel
    @add-text="editor.addText"
    @add-rect="editor.addRect"
    @add-image="editor.addImage"
    @set-background="editor.setBackground"
    @upload-model="onUploadModel"
    @save-design="onSaveDesign"
  />
  <ViewerScene
    ref="viewerRef"
    :model-url="modelUrl"
    :uv-guide-url="uvGuideUrl"
    :use-direct-uv-space="true"
  />
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import ToolPanel from './components/ToolPanel.vue';
import ViewerScene from './components/ViewerScene.vue';
import { useEditor2D } from './composables/useEditor2D.js';
import { useBridge } from './composables/useBridge.js';
import { uploadModel, saveDesign as apiSaveDesign } from './api/index.js';

const viewerRef = ref(null);
const modelUrl = ref('/api/models/2.glb');
const uvGuideUrl = ref('/api/textures/2_diffuse_1001.png');

const editor = useEditor2D('texture-canvas');

onMounted(async () => {
  await nextTick();

  const viewer = viewerRef.value;
  if (!viewer) return;

  // Set UV background in editor
  if (uvGuideUrl.value) {
    editor.setUVBackground(uvGuideUrl.value);
  } else {
    viewer.setUVTemplateListener((templateUrl) => {
      editor.setUVBackground(templateUrl);
    });
  }

  // Bridge 2D ↔ 3D
  useBridge(editor, viewer);

  // Start render loop
  viewer.start();
});

async function onUploadModel(file) {
  try {
    const result = await uploadModel(file);
    modelUrl.value = result.url;
    // Reload page to apply new model (simplest approach)
    window.location.reload();
  } catch (err) {
    console.error('Upload failed:', err);
    alert('模型上传失败');
  }
}

async function onSaveDesign() {
  try {
    const designData = {
      canvasJSON: editor.getCanvasJSON(),
      modelUrl: modelUrl.value,
      uvGuideUrl: uvGuideUrl.value,
    };
    const result = await apiSaveDesign(designData);
    alert(`设计已保存！ID: ${result.id}`);
  } catch (err) {
    console.error('Save failed:', err);
    alert('保存失败');
  }
}
</script>
