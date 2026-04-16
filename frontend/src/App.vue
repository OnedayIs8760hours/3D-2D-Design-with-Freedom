<template>
  <div class="app-layout">
    <!-- Top bar -->
    <TopBar
      product-name="自定义服装"
      :show3D="show3D"
      @update:show3D="show3D = $event"
      @save-design="onSaveDesign"
      @undo="editor.canvas.value?.undo?.()"
      @redo="editor.canvas.value?.redo?.()"
    />

    <!-- Body: sidebar + drawer + canvas + 3D -->
    <div class="app-body">
      <!-- Icon sidebar -->
      <IconSidebar v-model="activePanel" />

      <!-- Tool drawer (slides out) -->
      <ToolPanel
        :active-panel="activePanel"
        @close="activePanel = ''"
        @add-text="editor.addText"
        @add-rect="editor.addRect"
        @add-circle="editor.addCircle"
        @add-triangle="editor.addTriangle"
        @add-line="editor.addLine"
        @add-image="editor.addImage"
        @set-background="editor.setBackground"
        @upload-model="onUploadModel"
      />

      <div ref="workspaceRef" class="workspace-split" :class="{ resizing: isResizing }">
        <!-- Center: 2D design canvas -->
        <div class="design-area">
          <div class="design-canvas-zone">
            <div id="canvas-wrapper">
              <canvas id="texture-canvas"></canvas>
            </div>
          </div>
          <p class="canvas-hint">一体化板片 · 滚轮缩放 · 空格+拖拽平移 · 实际导出 1024×1024</p>
        </div>

        <div
          v-if="show3D"
          class="pane-resizer"
          :class="{ active: isResizing }"
          role="separator"
          aria-label="调整 2D 和 3D 区域宽度"
          aria-orientation="vertical"
          @pointerdown="startResize"
        >
          <span class="pane-resizer-grip" />
        </div>

        <!-- Right: 3D preview -->
        <div
          class="viewer-area"
          :class="{ hidden: !show3D, 'edit-active': interaction.editMode.value }"
          :style="viewerAreaStyle"
        >
          <ViewerScene
            ref="viewerRef"
            :model-url="modelUrl"
            :uv-guide-url="uvGuideUrl"
            :use-direct-uv-space="true"
            :visible="show3D"
          />
          <button
            class="edit-3d-btn"
            @click="interaction.editMode.value = !interaction.editMode.value"
          >
            {{ interaction.editMode.value ? '✋ 旋转模式' : '✏️ 3D编辑' }}
          </button>
          <p v-if="interaction.editMode.value" class="edit-hint">
            点击拖拽素材 · 拖入图片到模型
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, nextTick, ref } from 'vue';
import TopBar from './components/TopBar.vue';
import IconSidebar from './components/IconSidebar.vue';
import ToolPanel from './components/ToolPanel.vue';
import ViewerScene from './components/ViewerScene.vue';
import { useEditor2D } from './composables/useEditor2D.js';
import { useBridge } from './composables/useBridge.js';
import { use3DInteraction } from './composables/use3DInteraction.js';
import { uploadModel, saveDesign as apiSaveDesign } from './api/index.js';

const viewerRef = ref(null);
const modelUrl = ref('/api/models/2.glb');
const uvGuideUrl = ref('/api/textures/2_diffuse_1001.png');
const activePanel = ref('');
const show3D = ref(true);
const workspaceRef = ref(null);
const viewerWidthPercent = ref(40);
const isResizing = ref(false);

const editor = useEditor2D('texture-canvas');
const interaction = use3DInteraction();
const viewerAreaStyle = computed(() => {
  if (!show3D.value) {
    return { width: '0px', flexBasis: '0px' };
  }

  const basis = `${viewerWidthPercent.value}%`;
  return {
    width: basis,
    flexBasis: basis,
  };
});

onMounted(async () => {
  await nextTick();

  const viewer = viewerRef.value;
  if (!viewer) return;

  if (uvGuideUrl.value) {
    editor.setUVBackground(uvGuideUrl.value);
  } else {
    viewer.setUVTemplateListener((templateUrl) => {
      editor.setUVBackground(templateUrl);
    });
  }

  useBridge(editor, viewer);
  interaction.init(viewer, editor);
  viewer.start();
});

onBeforeUnmount(() => {
  stopResize();
});

function startResize(event) {
  if (!workspaceRef.value) return;

  isResizing.value = true;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  document.body.classList.add('app-is-resizing');
  window.addEventListener('pointermove', onResizePointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
}

function onResizePointerMove(event) {
  if (!isResizing.value || !workspaceRef.value) return;

  const rect = workspaceRef.value.getBoundingClientRect();
  const nextPercent = ((rect.right - event.clientX) / rect.width) * 100;
  viewerWidthPercent.value = clamp(nextPercent, 24, 68);
  window.dispatchEvent(new Event('resize'));
}

function stopResize() {
  if (!isResizing.value) return;

  isResizing.value = false;
  document.body.classList.remove('app-is-resizing');
  window.removeEventListener('pointermove', onResizePointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
  window.dispatchEvent(new Event('resize'));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function onUploadModel(file) {
  try {
    const result = await uploadModel(file);
    modelUrl.value = result.url;
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
