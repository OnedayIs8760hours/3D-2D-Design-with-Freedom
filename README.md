# 3D 设计定制器 (3D Design Customizer)

一个前后端分离的 3D 服装/包装定制应用，支持 2D 贴图编辑并实时映射到 3D 模型上。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Three.js + Fabric.js |
| 后端 | Python FastAPI |
| 3D 渲染 | Three.js (GLB 模型加载、CanvasTexture 映射) |
| 2D 编辑 | Fabric.js (1024×1024 高清画布) |

## 项目结构

```
├── frontend/             # Vue 3 前端
│   ├── src/
│   │   ├── api/          # Axios API 客户端
│   │   ├── components/   # Vue 组件
│   │   ├── composables/  # 组合式函数 (Editor2D, Viewer3D, Bridge)
│   │   └── styles/       # 全局样式
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/              # FastAPI 后端
│   ├── main.py           # 应用入口
│   ├── config.py         # 配置
│   ├── routers/
│   │   └── assets.py     # 模型/贴图/设计 API
│   ├── uploads/          # 上传文件存储
│   │   ├── models/       # GLB 模型
│   │   ├── textures/     # 贴图
│   │   └── designs/      # 保存的设计 JSON
│   └── requirements.txt
│
└── README.md
```

## 快速开始

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`，通过 Vite 代理将 `/api` 请求转发到后端 `http://127.0.0.1:8000`。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 列出所有 3D 模型 |
| GET | `/api/models/{filename}` | 获取模型文件 |
| POST | `/api/models/upload` | 上传 3D 模型 (.glb/.gltf) |
| GET | `/api/textures` | 列出所有贴图 |
| GET | `/api/textures/{filename}` | 获取贴图文件 |
| POST | `/api/textures/upload` | 上传贴图 |
| GET | `/api/designs` | 列出所有保存的设计 |
| GET | `/api/designs/{id}` | 获取设计详情 |
| POST | `/api/designs` | 保存设计 |

## 功能

- 2D 画布编辑：添加文字、图形、上传图片
- 3D 实时预览：编辑内容实时映射到 3D 模型
- 模型管理：上传和切换 GLB 模型
- 设计保存/加载
- 画布缩放/平移：滚轮缩放，空格+拖拽平移
