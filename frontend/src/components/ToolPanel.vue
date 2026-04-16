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
            <span>点击或拖入上传图片</span>
          </div>
        </label>
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
        <button class="action-btn" @click="$emit('add-text')">
          <span class="action-icon">𝐓</span>
          添加标题文字
        </button>
        <button class="action-btn outline" @click="$emit('add-text')">
          <span class="action-icon" style="font-size:14px">𝐓</span>
          添加正文文字
        </button>
      </div>

      <!-- Shapes panel -->
      <div v-if="activePanel === 'shapes'" class="drawer-body">
        <div class="shape-grid">
          <button class="shape-btn" @click="$emit('add-rect')" title="矩形">
            <svg viewBox="0 0 40 40" width="40" height="40"><rect x="4" y="4" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="shape-btn" @click="$emit('add-circle')" title="圆形">
            <svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="shape-btn" @click="$emit('add-triangle')" title="三角形">
            <svg viewBox="0 0 40 40" width="40" height="40"><polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          <button class="shape-btn" @click="$emit('add-line')" title="线条">
            <svg viewBox="0 0 40 40" width="40" height="40"><line x1="4" y1="36" x2="36" y2="4" stroke="currentColor" stroke-width="2"/></svg>
          </button>
        </div>
      </div>

      <!-- Fill panel -->
      <div v-if="activePanel === 'fill'" class="drawer-body">
        <label class="field-label">产品底色</label>
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
        <p class="hint-text">画布中的对象将显示在此处。<br/>拖拽可调整图层顺序。</p>
      </div>
    </aside>
  </transition>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  activePanel: { type: String, default: '' },
});

const emit = defineEmits([
  'close', 'add-text', 'add-rect', 'add-circle', 'add-triangle', 'add-line',
  'add-image', 'set-background', 'upload-model', 'save-design',
]);

const bgColor = ref('#ffffff');

const presetColors = [
  '#ffffff', '#000000', '#1a1a2e', '#16213e', '#0f3460',
  '#e94560', '#f39c12', '#2ecc71', '#3498db', '#9b59b6',
  '#ecf0f1', '#bdc3c7', '#95a5a6', '#7f8c8d', '#f5e6ca',
];

const panelTitle = computed(() => {
  const map = { uploads: '上传', text: '文字', shapes: '图形', fill: '填充', layers: '图层' };
  return map[props.activePanel] || '';
});

function onFileChange(e) {
  const files = e.target.files;
  if (!files.length) return;
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (ev) => emit('add-image', ev.target.result);
    reader.readAsDataURL(file);
  });
}

function onColorChange(e) {
  bgColor.value = e.target.value;
  emit('set-background', e.target.value);
}

function onPresetColor(c) {
  bgColor.value = c;
  emit('set-background', c);
}

function onModelUpload(e) {
  const file = e.target.files[0];
  if (file) emit('upload-model', file);
}
</script>
