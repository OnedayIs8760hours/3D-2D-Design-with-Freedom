<template>
  <nav class="icon-sidebar">
    <div
      v-for="item in tools"
      :key="item.id"
      class="sidebar-item"
      :class="{ active: modelValue === item.id }"
      @click="toggle(item.id)"
    >
      <span class="sidebar-icon">{{ item.icon }}</span>
      <span class="sidebar-label">{{ item.label }}</span>
    </div>
  </nav>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const tools = [
  { id: 'uploads', icon: '📤', label: '上传' },
  { id: 'text', icon: '𝐓', label: '文字' },
  { id: 'shapes', icon: '⬜', label: '图形' },
  { id: 'fill', icon: '🎨', label: '填充' },
  { id: 'layers', icon: '📑', label: '图层' },
];

function toggle(id) {
  emit('update:modelValue', props.modelValue === id ? '' : id);
}
</script>
