import { fabric } from 'fabric';

export class Editor2D {
    constructor(canvasId) {
        // 1. 初始化高清画布 (1024x1024)
        this.canvas = new fabric.Canvas(canvasId, {
            backgroundColor: '#ffffff',
            preserveObjectStacking: true,
            width: 1024,
            height: 1024,
            selection: true // 允许框选
        });
        
        this.onUpdate = null;
        this.uvBackgroundImage = null;
        this.canvas.on('after:render', () => {
            if (this.onUpdate) this.onUpdate();
        });

        // 2. 初始化视口控制 (缩放/平移)
        this.initPanZoom();
    }

    getElement() {
        return this.canvas.getElement();
    }

    // ===============================================
    // 🆕 修复版：视口控制逻辑 (Pan & Zoom)
    // ===============================================
    initPanZoom() {
        const wrapper = document.getElementById('canvas-wrapper');
        const container = wrapper.querySelector('.canvas-container');

        // 状态变量
        let scale = 0.35; 
        let panX = (wrapper.clientWidth - 1024 * scale) / 2;
        let panY = (wrapper.clientHeight - 1024 * scale) / 2;
        
        let isSpacePressed = false; // 记录空格键状态
        let isDragging = false;     // 记录是否正在拖拽
        let lastX = 0;
        let lastY = 0;

        // 应用变换
        const updateTransform = () => {
            container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        };

        // 初始化位置
        updateTransform();

        // --- 1. 切换模式：当按下空格时，禁用 Fabric 对象选择，启用平移 ---
        const setPanMode = (enabled) => {
            isSpacePressed = enabled;
            // 改变 Fabric 的选择模式
            this.canvas.selection = !enabled; 
            // 改变所有对象的交互状态 (核心：防止点到文字上拖不动)
            this.canvas.forEachObject((o) => {
                o.selectable = !enabled; 
                o.evented = !enabled; 
            });
            
            // 改变光标样式
            if (enabled) {
                wrapper.style.cursor = 'grab';
                this.canvas.defaultCursor = 'grab';
            } else {
                wrapper.style.cursor = 'default';
                this.canvas.defaultCursor = 'default';
            }
            this.canvas.requestRenderAll();
        };

        // --- 2. 键盘事件 (绑定到 document 以便全局响应) ---
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !isSpacePressed) {
                e.preventDefault(); // 防止网页滚动
                setPanMode(true);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                setPanMode(false);
                isDragging = false; // 松开空格也强制停止拖拽
            }
        });

        // --- 3. 鼠标滚轮缩放 ---
        wrapper.addEventListener('wheel', (e) => {
            if (e.ctrlKey) { // 如果你想按住Ctrl缩放，或者直接缩放
                // 现在的逻辑是直接缩放
            }
            e.preventDefault();
            const zoomSpeed = 0.001;
            const newScale = scale - e.deltaY * zoomSpeed;
            
            if (newScale > 0.1 && newScale < 3.0) {
                scale = newScale;
                updateTransform();
            }
        }, { passive: false });

        // --- 4. 鼠标拖拽逻辑 ---
        
        // 鼠标按下：如果按住了空格，就开始拖拽
        wrapper.addEventListener('mousedown', (e) => {
            // 支持空格键 或 中键(button 1) 拖拽
            if (isSpacePressed || e.button === 1) {
                isDragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
                wrapper.style.cursor = 'grabbing';
                this.canvas.defaultCursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation(); // 阻止事件传给 Fabric
            }
        });

        // 鼠标移动 (绑定到 window 防止拖出框外失效)
        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                const deltaX = e.clientX - lastX;
                const deltaY = e.clientY - lastY;
                
                panX += deltaX;
                panY += deltaY;
                
                lastX = e.clientX;
                lastY = e.clientY;
                updateTransform();
            }
        });

        // 鼠标松开
        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                // 恢复抓手光标 (如果空格还按着)
                if (isSpacePressed) {
                    wrapper.style.cursor = 'grab';
                    this.canvas.defaultCursor = 'grab';
                }
            }
        });
    }

    loadUVBackground(url) {
        this.setUVBackground(url);
    }

    setUVBackground(url) {
        fabric.Image.fromURL(url, (img) => {
            img.scaleToWidth(this.canvas.width);
            img.scaleToHeight(this.canvas.height);
            img.set({
                left: 0,
                top: 0,
                selectable: false,
                evented: false,
                opacity: 0.45,
                excludeFromExport: true
            });

            if (this.uvBackgroundImage) {
                this.canvas.remove(this.uvBackgroundImage);
            }

            this.uvBackgroundImage = img;
            this.canvas.add(img);
            this.canvas.sendToBack(img);
            this.canvas.requestRenderAll();
        }, { crossOrigin: 'anonymous' });
    }

    addText() {
        const text = new fabric.Text('Design', {
            left: 300, top: 300,
            fontSize: 60, fill: '#333'
        });
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
    }

    addRect() {
        const rect = new fabric.Rect({
            left: 200, top: 200,
            fill: 'orange', width: 100, height: 100
        });
        this.canvas.add(rect);
    }

    addImage(url) {
        fabric.Image.fromURL(url, (img) => {
            img.scaleToWidth(200);
            this.canvas.add(img);
            this.canvas.centerObject(img);
        });
    }

    setBackground(color) {
        this.canvas.backgroundColor = color;
        this.canvas.requestRenderAll();
    }
}