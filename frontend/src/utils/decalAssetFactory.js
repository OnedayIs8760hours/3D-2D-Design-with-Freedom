function createCanvas(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function createTextDecalAsset(text = '3D', options = {}) {
  const canvas = createCanvas(options.size || 512);
  const ctx = canvas.getContext('2d');
  const fontSize = options.fontSize || 136;
  const fill = options.fill || '#111827';
  const stroke = options.stroke || 'rgba(255,255,255,0.95)';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 18;
  ctx.font = `700 ${fontSize}px Segoe UI`;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = fill;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return {
    type: 'text',
    label: text,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

export function createShapeDecalAsset(shape = 'rect', options = {}) {
  const canvas = createCanvas(options.size || 512);
  const ctx = canvas.getContext('2d');
  const fill = options.fill || '#2563eb';
  const stroke = options.stroke || 'rgba(255,255,255,0.9)';
  const lineWidth = options.lineWidth || 16;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;

  const center = canvas.width / 2;
  const half = 150;

  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(center, center, half, 0, Math.PI * 2);
  } else if (shape === 'triangle') {
    ctx.moveTo(center, center - half);
    ctx.lineTo(center + half, center + half * 0.85);
    ctx.lineTo(center - half, center + half * 0.85);
    ctx.closePath();
  } else if (shape === 'line') {
    ctx.lineWidth = 34;
    ctx.moveTo(center - half, center + half * 0.4);
    ctx.lineTo(center + half, center - half * 0.4);
  } else {
    const radius = 44;
    ctx.moveTo(center - half + radius, center - half);
    ctx.lineTo(center + half - radius, center - half);
    ctx.quadraticCurveTo(center + half, center - half, center + half, center - half + radius);
    ctx.lineTo(center + half, center + half - radius);
    ctx.quadraticCurveTo(center + half, center + half, center + half - radius, center + half);
    ctx.lineTo(center - half + radius, center + half);
    ctx.quadraticCurveTo(center - half, center + half, center - half, center + half - radius);
    ctx.lineTo(center - half, center - half + radius);
    ctx.quadraticCurveTo(center - half, center - half, center - half + radius, center - half);
  }

  if (shape === 'line') {
    ctx.stroke();
  } else {
    ctx.fill();
    ctx.stroke();
  }

  const labelMap = {
    rect: '矩形贴花',
    circle: '圆形贴花',
    triangle: '三角贴花',
    line: '线条贴花',
  };

  return {
    type: shape,
    label: labelMap[shape] || '图形贴花',
    dataUrl: canvas.toDataURL('image/png'),
  };
}
