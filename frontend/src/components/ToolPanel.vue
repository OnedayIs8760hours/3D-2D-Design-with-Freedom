<template>
  <div class="panel">
    <div class="panel-header">🎨 设计定制器</div>

    <!-- Basic tools -->
    <div class="tool-section">
      <label>基础操作</label>
      <button class="tool-btn" @click="$emit('add-text')">➕ 添加文字</button>
      <button class="tool-btn" @click="$emit('add-rect')">⬜ 添加图形</button>

      <label style="margin-top: 10px">上传 Logo / 图片</label>
      <input type="file" accept="image/*" @change="onFileChange" />
    </div>

    <!-- Background color -->
    <div class="tool-section">
      <label>底色</label>
      <input type="color" :value="bgColor" @input="onColorChange" />
    </div>

    <!-- Model upload -->
    <div class="tool-section">
      <label>上传 3D 模型 (.glb)</label>
      <input type="file" accept=".glb,.gltf" @change="onModelUpload" />
    </div>

    <!-- Save design -->
    <div class="tool-section">
      <button class="tool-btn" @click="$emit('save-design')">💾 保存设计</button>
    </div>

    <!-- 2D preview -->
    <div class="tool-section">
      <label>设计预览 (高清缩略图)</label>
      <div id="canvas-wrapper">
        <canvas id="texture-canvas"></canvas>
      </div>
      <p class="hint">* 此处为缩小显示，实际导出为 1024px 高清图</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['add-text', 'add-rect', 'add-image', 'set-background', 'upload-model', 'save-design']);

const bgColor = ref('#ffffff');

function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => emit('add-image', ev.target.result);
  reader.readAsDataURL(file);
}

function onColorChange(e) {
  bgColor.value = e.target.value;
  emit('set-background', e.target.value);
}

function onModelUpload(e) {
  const file = e.target.files[0];
  if (file) emit('upload-model', file);
}
</script>
