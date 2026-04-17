<template>
  <transition name="slide">
    <aside v-if="activePanel" class="tool-drawer">
      <div class="drawer-header">
        <span class="drawer-title">{{ panelTitle }}</span>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>

      <!-- Uploads panel -->
      <div v-if="activePanel === 'uploads'" class="drawer-body">
        <label class="upload-zone">
          <input type="file" accept="image/*" multiple @change="onFileChange" />
          <div class="upload-placeholder">
            <span class="upload-icon">📤</span>
            <span>{{ props.editorMode === '3d' ? '选择图片后点击 3D 模型放置贴花' : '点击或拖入上传图片' }}</span>
          </div>
        </label>
        <div v-if="props.editorMode === '3d' && props.pending3DAssetLabel" class="pending-asset-tip">
          待放置: {{ props.pending3DAssetLabel }}
        </div>
        <div class="section-divider" />
        <label class="upload-zone small">
          <input type="file" accept=".glb,.gltf" @change="onModelUpload" />
          <div class="upload-placeholder">
            <span class="upload-icon">📦</span>
            <span>上传 3D 模型 (.glb)</span>
          </div>
        </label>
      </div>

      <!-- Text panel -->
      <div v-if="activePanel === 'text'" class="drawer-body">
        <button class="action-btn" @click="emitTextPreset('标题')">
          <span class="action-icon">𝐓</span>
          {{ props.editorMode === '3d' ? '创建 3D 标题贴花' : '添加标题文字' }}
        </button>
        <button class="action-btn outline" @click="emitTextPreset('正文')">
          <span class="action-icon" style="font-size:14px">𝐓</span>
          {{ props.editorMode === '3d' ? '创建 3D 正文贴花' : '添加正文文字' }}
        </button>
      </div>

      <!-- Shapes panel -->
      <div v-if="activePanel === 'shapes'" class="drawer-body">
        <div class="shape-grid">
          <button class="shape-btn" @click="emitShapePreset('rect')" title="矩形">
            <svg viewBox="0 0 40 40" width="40" height="40"><rect x="4" y="4" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="shape-btn" @click="emitShapePreset('circle')" title="圆形">
            <svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="shape-btn" @click="emitShapePreset('triangle')" title="三角形">
            <svg viewBox="0 0 40 40" width="40" height="40"><polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="shape-btn" @click="emitShapePreset('line')" title="线条">
            <svg viewBox="0 0 40 40" width="40" height="40"><line x1="4" y1="36" x2="36" y2="4" stroke="currentColor" stroke-width="2"/></svg>
          </button>
        </div>
        <p v-if="props.editorMode === '3d'" class="panel-tip">创建后会进入待放置状态，在右侧 3D 模型上点击即可贴上。</p>
      </div>

      <!-- Fill panel -->
      <div v-if="activePanel === 'fill'" class="drawer-body">
        <label class="field-label">{{ props.editorMode === '3d' ? '3D 产品底色' : '产品底色' }}</label>
        <div class="color-row">
          <input type="color" :value="bgColor" @input="onColorChange" class="color-input" />
          <span class="color-hex">{{ bgColor }}</span>
        </div>
        <div class="preset-colors">
          <button
            v-for="c in presetColors" :key="c"
            class="color-dot"
            :style="{ background: c }"
            :class="{ active: bgColor === c }"
            @click="onPresetColor(c)"
          />
        </div>
      </div>

      <!-- Layers panel -->
      <div v-if="activePanel === 'layers'" class="drawer-body">
        <div class="mode-hint-card">
          <span class="mode-hint-badge">{{ props.editorMode === '3d' ? '3D 驱动' : 'UV / 2D' }}</span>
          <p>{{ props.editorMode === '3d' ? '当前显示的是 3D 贴花记录，与 2D 图层隔离。' : '当前显示的是 UV / 2D 素材记录。' }}</p>
        </div>
        <div v-if="layerItems.length" class="layer-list">
          <div
            v-for="item in layerItems"
            :key="item.id"
            class="layer-item"
            :class="{ active: selectedObjectId === item.id }"
            role="button"
            tabindex="0"
            @click="$emit('select-layer', item.id)"
            @keydown.enter="$emit('select-layer', item.id)"
            @keydown.space.prevent="$emit('select-layer', item.id)"
          >
            <div class="layer-item-main">
              <span class="layer-item-type">{{ getTypeIcon(item.type) }}</span>
              <div class="layer-item-meta">
                <span class="layer-item-name">{{ item.name }}</span>
                <span class="layer-item-kind">{{ getTypeLabel(item.type) }}</span>
              </div>
            </div>
            <button
              class="layer-delete-btn"
              title="删除素材"
              @click.stop="$emit('remove-layer', item.id)"
            >
              删除
            </button>
          </div>
        </div>
        <div v-else class="empty-state">
          <p class="hint-text">{{ props.editorMode === '3d' ? '还没有 3D 贴花记录。先创建文字、图形或上传图片，然后到 3D 模型上点击放置。' : '还没有素材记录。添加图片、文字或图形后会显示在这里。' }}</p>
        </div>
        <button v-if="selectedObjectId" class="danger-btn" @click="$emit('remove-active-layer')">
          删除当前选中素材
        </button>
      </div>
    </aside>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface LayerItem {
  id: string;
  type: string;
  name: string;
}

const props = defineProps<{
  activePanel: string;
  layerItems: LayerItem[];
  selectedObjectId: string;
  editorMode: string;
  pending3DAssetLabel: string;
}>();

const emit = defineEmits<{
  close: [];
  'add-text': [];
  'add-rect': [];
  'add-circle': [];
  'add-triangle': [];
  'add-line': [];
  'add-image': [dataUrl: string];
  'set-background': [color: string];
  'upload-model': [file: File];
  'save-design': [];
  'select-layer': [id: string];
  'remove-layer': [id: string];
  'remove-active-layer': [];
  'prepare-3d-text': [text: string];
  'prepare-3d-shape': [shape: string];
  'prepare-3d-image': [asset: { dataUrl: string; type: string; label: string }];
  'set-3d-base-color': [color: string];
}>();

const bgColor = ref('#ffffff');

const presetColors = [
  '#ffffff', '#000000', '#1a1a2e', '#16213e', '#0f3460',
  '#e94560', '#f39c12', '#2ecc71', '#3498db', '#9b59b6',
  '#ecf0f1', '#bdc3c7', '#95a5a6', '#7f8c8d', '#f5e6ca',
];

const panelTitle = computed(() => {
  const map: Record<string, string> = { uploads: '上传', text: '文字', shapes: '图形', fill: '填充', layers: '图层' };
  return map[props.activePanel] || '';
});

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (!files || !files.length) return;
  Array.from(files).forEach((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev: ProgressEvent<FileReader>) => {
      const result = ev.target!.result as string;
      if (props.editorMode === '3d') {
        emit('prepare-3d-image', { dataUrl: result, type: 'image', label: file.name.replace(/\.[^.]+$/, '') || '图片贴花' });
      } else {
        emit('add-image', result);
      }
    };
    reader.readAsDataURL(file);
  });
}

function onColorChange(e: Event): void {
  const value = (e.target as HTMLInputElement).value;
  bgColor.value = value;
  if (props.editorMode === '3d') {
    emit('set-3d-base-color', value);
  } else {
    emit('set-background', value);
  }
}

function onPresetColor(c: string): void {
  bgColor.value = c;
  if (props.editorMode === '3d') {
    emit('set-3d-base-color', c);
  } else {
    emit('set-background', c);
  }
}

function emitTextPreset(kind: string): void {
  if (props.editorMode === '3d') {
    emit('prepare-3d-text', kind === '标题' ? '3D Title' : '3D Text');
    return;
  }
  emit('add-text');
}

function emitShapePreset(shape: string): void {
  if (props.editorMode === '3d') {
    emit('prepare-3d-shape', shape);
    return;
  }

  switch (shape) {
    case 'rect': emit('add-rect'); break;
    case 'circle': emit('add-circle'); break;
    case 'triangle': emit('add-triangle'); break;
    case 'line': emit('add-line'); break;
  }
}

function onModelUpload(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) emit('upload-model', file);
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    image: '图片素材',
    text: '文字素材',
    rect: '矩形',
    circle: '圆形',
    triangle: '三角形',
    line: '线条',
    shape: '图形',
  };
  return map[type] || '素材';
}

function getTypeIcon(type: string): string {
  const map: Record<string, string> = {
    image: '🖼',
    text: '𝐓',
    rect: '▭',
    circle: '◯',
    triangle: '△',
    line: '／',
    shape: '⬠',
  };
  return map[type] || '•';
}
</script>
