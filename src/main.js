import { Viewer3D } from './core/Viewer3D.js';
import { Editor2D } from './core/Editor2D.js';
// 确保你有 Bridge 类来处理实时同步，否则 3D 模型不会跟着变
import { Bridge } from './core/Bridge.js'; 

const ASSET_CONFIG = {
    modelUrl: '/2.glb',
    uvGuideUrl: '/2_diffuse_1001.png',
    useDirectUvSpace: true
};

// 初始化
const init = async () => {
    // 1. 启动 2D 编辑器
    const editor = new Editor2D('texture-canvas');
    if (ASSET_CONFIG.uvGuideUrl) {
        editor.setUVBackground(ASSET_CONFIG.uvGuideUrl);
    }

    // 2. 启动 3D 查看器
    const viewer = new Viewer3D('three-container', ASSET_CONFIG);
    if (!ASSET_CONFIG.uvGuideUrl) {
        viewer.setUVTemplateListener((templateUrl) => {
            editor.setUVBackground(templateUrl);
        });
    }
    
    // 3. 建立桥梁 (关键步骤)
    // 👇 把这行注释打开！我们需要它来监听 editor 的变化并通知 viewer
    const bridge = new Bridge(editor, viewer);
    
    // 4. 启动渲染循环
    viewer.start();

    // 5. 绑定 UI 事件
    document.getElementById('btnAddText').onclick = () => editor.addText();
    document.getElementById('btnAddRect').onclick = () => editor.addRect();
    document.getElementById('inpColor').oninput = (e) => editor.setBackground(e.target.value);
    
    document.getElementById('inpUpload').onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (f) => editor.addImage(f.target.result);
        reader.readAsDataURL(file);
    };

    // 隐藏加载文字
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
};

init();