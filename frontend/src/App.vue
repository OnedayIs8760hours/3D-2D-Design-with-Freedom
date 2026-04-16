<template>
  <div class="app-layout">
    <!-- Top bar -->
    <TopBar
      product-name="自定义服装"
      :show3D="show3D"
      :editor-mode="editorMode"
      @update:show3D="show3D = $event"
      @update:editorMode="onSwitchEditorMode"
      @save-design="onSaveDesign"
      @undo="editorMode === 'uv2d' ? editor.canvas.value?.undo?.() : null"
      @redo="editorMode === 'uv2d' ? editor.canvas.value?.redo?.() : null"
    />

    <!-- Body: sidebar + drawer + canvas + 3D -->
    <div class="app-body">
      <!-- Icon sidebar -->
      <IconSidebar v-model="activePanel" />

      <!-- Tool drawer (slides out) -->
      <ToolPanel
        :active-panel="activePanel"
        :editor-mode="editorMode"
        :layer-items="activeLayerItems"
        :selected-object-id="activeSelectedObjectId"
        :pending3-d-asset-label="pending3DAssetLabel"
        @close="activePanel = ''"
        @add-text="editor.addText"
        @add-rect="editor.addRect"
        @add-circle="editor.addCircle"
        @add-triangle="editor.addTriangle"
        @add-line="editor.addLine"
        @add-image="editor.addImage"
        @set-background="editor.setBackground"
        @set-3d-base-color="onSet3DBaseColor"
        @upload-model="onUploadModel"
        @select-layer="onSelectLayer"
        @remove-layer="onRemoveLayer"
        @remove-active-layer="onRemoveActiveLayer"
        @prepare-3d-text="onPrepare3DText"
        @prepare-3d-shape="onPrepare3DShape"
        @prepare-3d-image="onPrepare3DImage"
      />

      <div ref="workspaceRef" class="workspace-split" :class="{ resizing: isResizing }">
        <!-- Center: 2D design canvas (always visible, 3D mode shows synced overlays) -->
        <div class="design-area">
          <div class="design-canvas-zone">
            <div id="canvas-wrapper">
              <canvas id="texture-canvas"></canvas>
            </div>
            <span v-if="editorMode === '3d'" class="canvas-mode-badge">3D 同步预览</span>
          </div>
          <p class="canvas-hint">{{ editorMode === 'uv2d' ? '一体化板片 · 滚轮缩放 · 空格+拖拽平移 · 实际导出 1024×1024' : '3D 贴花同步预览 · 素材位置自动映射到板片' }}</p>
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
          :class="{ hidden: !show3D, 'edit-active': isViewerEditActive }"
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
            @click="toggleViewerEditMode"
          >
            {{ isViewerEditActive ? '✋ 旋转模式' : (editorMode === '3d' ? '✏️ 3D贴花编辑' : '✏️ 3D编辑') }}
          </button>
          <p v-if="isViewerEditActive || pending3DAssetLabel" class="edit-hint">
            {{ editorMode === '3d' ? (pending3DAssetLabel ? `点击模型放置: ${pending3DAssetLabel}` : '点击选中贴花 · 拖拽移动贴花') : '点击拖拽素材 · 拖入图片到模型' }}
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
import { use3DDecalInteraction } from './composables/use3DDecalInteraction.js';
import { createShapeDecalAsset, createTextDecalAsset } from './utils/decalAssetFactory.js';
import { uploadModel, saveDesign as apiSaveDesign } from './api/index.js';

const viewerRef = ref(null);
const modelUrl = ref('/api/models/2.glb');
const uvGuideUrl = ref('/api/textures/2_diffuse_1001.png');
const activePanel = ref('');
const show3D = ref(true);
const editorMode = ref('uv2d');
const workspaceRef = ref(null);
const viewerWidthPercent = ref(40);
const isResizing = ref(false);
const pending3DAsset = ref(null);

const editor = useEditor2D('texture-canvas');
const interaction = use3DInteraction(editorMode);
const decalInteraction = use3DDecalInteraction(editorMode, pending3DAsset);
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
const activeLayerItems = computed(() => (
  editorMode.value === '3d'
    ? (viewerRef.value?.decalItems?.value ?? [])
    : editor.layerItems.value
));
const activeSelectedObjectId = computed(() => (
  editorMode.value === '3d'
    ? (viewerRef.value?.selectedDecalId?.value ?? '')
    : editor.selectedObjectId.value
));
const pending3DAssetLabel = computed(() => pending3DAsset.value?.label || '');
const isViewerEditActive = computed(() => (
  editorMode.value === '3d' ? decalInteraction.editMode.value : interaction.editMode.value
));

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
  decalInteraction.init(viewer);
  viewer.setEditorMode(editorMode.value);
  viewer.setDecalChangeCallback((decals) => {
    if (editorMode.value === '3d') {
      editor.syncDecalOverlays(decals);
    }
  });
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

function onSwitchEditorMode(mode) {
  editorMode.value = mode;
  pending3DAsset.value = null;
  interaction.editMode.value = false;
  decalInteraction.editMode.value = false;
  viewerRef.value?.setEditorMode(mode);
  if (mode !== '3d') {
    editor.clearDecalOverlays();
  }
}

function onSelectLayer(id) {
  if (editorMode.value === '3d') {
    viewerRef.value?.selectDecalById(id);
    return;
  }
  editor.selectObjectById(id);
}

function onRemoveLayer(id) {
  if (editorMode.value === '3d') {
    viewerRef.value?.removeDecalById(id);
    return;
  }
  editor.removeObjectById(id);
}

function onRemoveActiveLayer() {
  if (editorMode.value === '3d') {
    viewerRef.value?.removeSelectedDecal();
    return;
  }
  editor.removeActiveObject();
}

function toggleViewerEditMode() {
  if (editorMode.value === '3d') {
    decalInteraction.editMode.value = !decalInteraction.editMode.value;
    return;
  }
  interaction.editMode.value = !interaction.editMode.value;
}

function onSet3DBaseColor(color) {
  viewerRef.value?.setBaseColor(color);
}

function onPrepare3DText(text) {
  pending3DAsset.value = createTextDecalAsset(text, {
    fill: '#111827',
    stroke: 'rgba(255,255,255,0.92)',
  });
  decalInteraction.editMode.value = true;
}

function onPrepare3DShape(shape) {
  pending3DAsset.value = createShapeDecalAsset(shape);
  decalInteraction.editMode.value = true;
}

function onPrepare3DImage(asset) {
  pending3DAsset.value = asset;
  decalInteraction.editMode.value = true;
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
      editorMode: editorMode.value,
      modelUrl: modelUrl.value,
      uvGuideUrl: uvGuideUrl.value,
      decals: viewerRef.value?.getDecalState?.() ?? [],
    };
    const result = await apiSaveDesign(designData);
    alert(`设计已保存！ID: ${result.id}`);
  } catch (err) {
    console.error('Save failed:', err);
    alert('保存失败');
  }
}
</script>
