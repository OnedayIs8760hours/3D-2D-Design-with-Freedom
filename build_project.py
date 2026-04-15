import os

# 定义项目结构和文件内容
project_structure = {
    "package.json": """
{
  "name": "pacdora-clothing-lite",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^4.0.0"
  },
  "dependencies": {
    "three": "^0.150.0",
    "fabric": "^5.3.0",
    "lil-gui": "^0.17.0"
  }
}
""",
    "index.html": """
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>3D Clothing/Packaging Customizer</title>
    <style>
      body { margin: 0; overflow: hidden; font-family: sans-serif; display: flex; }
      
      /* 左侧 UI 面板 */
      #ui-panel {
        width: 400px;
        background: #f5f5f5;
        border-right: 1px solid #ccc;
        display: flex;
        flex-direction: column;
        padding: 10px;
        z-index: 10;
        box-shadow: 2px 0 10px rgba(0,0,0,0.1);
      }
      
      .panel-header { font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }
      
      .tool-section { margin-bottom: 20px; background: white; padding: 10px; border-radius: 8px; }
      .tool-btn { 
        display: block; width: 100%; margin: 5px 0; padding: 8px; 
        background: #333; color: white; border: none; cursor: pointer; border-radius: 4px;
      }
      .tool-btn:hover { background: #555; }
      
      /* 隐藏的纹理生成画布 (实际上 Fabric 在这里工作) */
      .canvas-container {
        border: 1px dashed #999;
        margin-top: 10px;
        background: #fff;
        display: flex;
        justify-content: center;
      }

      /* 右侧 3D 容器 */
      #three-container {
        flex-grow: 1;
        background: #222;
        position: relative;
      }
      
      #loading {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        color: white; pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="ui-panel">
      <div class="panel-header">🎨 定制编辑器 (Pacdora Lite)</div>
      
      <div class="tool-section">
        <label>基础操作</label>
        <button class="tool-btn" id="btnAddText">添加文字</button>
        <button class="tool-btn" id="btnAddRect">添加图形</button>
        <input type="file" id="inpUpload" accept="image/*" style="margin-top:5px; width:100%">
      </div>

      <div class="tool-section">
        <label>颜色控制</label>
        <input type="color" id="inpColor" value="#ffffff" style="width:100%; height: 30px;">
      </div>

      <div class="canvas-container">
        <canvas id="texture-canvas" width="512" height="512"></canvas>
      </div>
      <p style="font-size:12px; color:#666">提示：这是展开图 (UV Map)，修改它会实时同步到右侧。</p>
    </div>

    <div id="three-container">
        <div id="loading">加载模型中...</div>
    </div>

    <script type="module" src="/src/main.js"></script>
  </body>
</html>
""",
    "vite.config.js": """
import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    host: true
  }
});
""",
    "src/main.js": """
import { Viewer3D } from './core/Viewer3D.js';
import { Editor2D } from './core/Editor2D.js';
import { Bridge } from './core/Bridge.js';

// 初始化
const init = async () => {
    // 1. 启动 2D 编辑器
    const editor = new Editor2D('texture-canvas');
    
    // 2. 启动 3D 查看器
    const viewer = new Viewer3D('three-container');
    
    // 3. 建立桥梁 (将 2D 的 Canvas 传给 3D 的材质)
    // 注意：Pacdora 的核心就在这里，将 Canvas 视为 Texture
    const bridge = new Bridge(editor, viewer);
    
    // 4. 启动渲染循环
    viewer.start();

    // 5. 绑定 UI 事件 (简单的 DOM 操作)
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
    document.getElementById('loading').style.display = 'none';
};

init();
""",
    "src/core/Editor2D.js": """
import { fabric } from 'fabric';

export class Editor2D {
    constructor(canvasId) {
        this.canvas = new fabric.Canvas(canvasId, {
            backgroundColor: '#ffffff',
            preserveObjectStacking: true
        });
        
        // 外部回调，用于通知 3D 更新
        this.onUpdate = null;

        // 监听所有可能改变画面的事件
        this.canvas.on('after:render', () => {
            if (this.onUpdate) this.onUpdate();
        });
    }

    // 获取原生 Canvas DOM 元素 (传给 Three.js 用)
    getElement() {
        return this.canvas.getElement();
    }

    addText() {
        const text = new fabric.Text('Design', {
            left: 100, top: 100,
            fontSize: 40, fill: '#333'
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
""",
    "src/core/Viewer3D.js": """
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class Viewer3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        // 场景基础
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);

        // 相机
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 50);

        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.container.appendChild(this.renderer.domElement);

        // 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        // 灯光
        this.addLights();
        
        // 初始化模型
        this.mainMesh = null;
        this.initPlaceholderModel();

        // 响应窗口大小
        window.addEventListener('resize', this.onResize.bind(this));
    }

    addLights() {
        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(amb);
        
        const dir = new THREE.DirectionalLight(0xffffff, 1);
        dir.position.set(10, 10, 10);
        this.scene.add(dir);
        
        const back = new THREE.DirectionalLight(0xffffff, 0.5);
        back.position.set(-10, -5, -10);
        this.scene.add(back);
    }

    // 初始化一个占位模型 (T恤或盒子)
    initPlaceholderModel() {
        // 在真实项目中，这里应该加载 .gltf 模型
        // 例如: new GLTFLoader().load('shirt.glb', ...)
        
        // 这里我们要模拟衣服的 UV 映射，使用一个平面几何体做演示会更直观，
        // 或者使用 Box 模拟包装盒
        
        const geometry = new THREE.BoxGeometry(10, 14, 10);
        
        // 初始材质 (白色)
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            roughness: 0.5,
            metalness: 0.1
        });

        this.mainMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mainMesh);
    }

    // 核心功能：更新材质纹理
    updateTexture(canvasElement) {
        if (!this.mainMesh) return;

        // 如果还没有纹理，创建一个
        if (!this.mainMesh.material.map) {
            const texture = new THREE.CanvasTexture(canvasElement);
            texture.colorSpace = THREE.SRGBColorSpace;
            this.mainMesh.material.map = texture;
            this.mainMesh.material.needsUpdate = true;
        } else {
            // 如果已有纹理，通知 GPU 更新
            this.mainMesh.material.map.needsUpdate = true;
        }
    }

    start() {
        this.animate();
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
        if(this.mainMesh) {
            this.mainMesh.rotation.y += 0.002; // 自动旋转展示
        }
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}
""",
    "src/core/Bridge.js": """
// 连接 2D 和 3D 的桥梁
export class Bridge {
    constructor(editor, viewer) {
        this.editor = editor;
        this.viewer = viewer;

        // 绑定回调：
        // 当 Editor2D 发生变化时，调用 Viewer3D 的更新方法
        this.editor.onUpdate = () => {
            this.viewer.updateTexture(this.editor.getElement());
        };

        // 初始同步一次
        setTimeout(() => {
            this.viewer.updateTexture(this.editor.getElement());
        }, 100);
    }
}
"""
}

def create_project():
    base_dir = "pacdora-clone"
    
    if not os.path.exists(base_dir):
        os.makedirs(base_dir)
        print(f"Created directory: {base_dir}")

    for file_path, content in project_structure.items():
        full_path = os.path.join(base_dir, file_path)
        
        # 确保子目录存在
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content.strip())
            print(f"Created file: {file_path}")

    print("\n✅ 项目生成成功！")
    print("---------------------------------------")
    print("请按照以下步骤运行项目：")
    print(f"1. cd {base_dir}")
    print("2. npm install  (安装依赖)")
    print("3. npm run dev  (启动开发服务器)")
    print("---------------------------------------")

if __name__ == "__main__":
    create_project()