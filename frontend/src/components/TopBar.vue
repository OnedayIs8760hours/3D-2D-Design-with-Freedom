<template>
  <header class="top-bar">
    <!-- Left: product info -->
    <div class="top-left">
      <span class="product-name">{{ productName }}</span>
      <button class="link-btn" @click="$emit('change-product')">更换产品</button>
    </div>

    <!-- Center: context toolbar (shown when object is selected) -->
    <div class="top-center">
      <div class="mode-switch" role="tablist" aria-label="编辑模式切换">
        <button
          class="mode-switch-btn"
          :class="{ active: editorMode === 'uv2d' }"
          @click="$emit('update:editorMode', 'uv2d')"
        >
          UV / 2D
        </button>
        <button
          class="mode-switch-btn"
          :class="{ active: editorMode === '3d' }"
          @click="$emit('update:editorMode', '3d')"
        >
          3D 驱动
        </button>
      </div>
      <slot name="context-toolbar" />
    </div>

    <!-- Right: actions -->
    <div class="top-right">
      <button class="icon-btn" title="撤销" @click="$emit('undo')">↩</button>
      <button class="icon-btn" title="重做" @click="$emit('redo')">↪</button>
      <div class="divider" />
      <label class="toggle-3d">
        <span>3D 预览</span>
        <input type="checkbox" :checked="show3D" @change="$emit('update:show3D', $event.target.checked)" />
        <span class="toggle-slider" />
      </label>
      <div class="divider" />
      <button class="save-btn" @click="$emit('save-design')">
        💾 保存设计
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps({
  productName: { type: String, default: '自定义服装' },
  show3D: { type: Boolean, default: true },
  editorMode: { type: String, default: 'uv2d' },
});

defineEmits(['change-product', 'undo', 'redo', 'update:show3D', 'update:editorMode', 'save-design']);
</script>
