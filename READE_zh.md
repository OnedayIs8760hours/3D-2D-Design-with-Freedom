# Pacdora Clothing Lite

一款基于 Vite、Three.js 和 Fabric.js 的轻量级 3D 服装定制应用。

## 功能特性

- **2D 纹理编辑器**：基于 Fabric.js 的画布（1024×1024），用于设计自定义服装纹理
  - 添加文字和图形
  - 上传图片 / Logo
  - 更改背景颜色
  - 平移和缩放视口控制
- **3D 实时预览**：Three.js 查看器，可将 2D 画布直接作为纹理应用到 3D T 恤模型上
- **实时同步**：在 2D 编辑器中的修改会即时反映在 3D 模型上

## 技术栈

- [Vite](https://vitejs.dev/) — 构建工具和开发服务器
- [Three.js](https://threejs.org/) — 3D 渲染
- [Fabric.js](http://fabricjs.com/) — 2D 画布操作

## 快速开始

```bash
npm install
npm run dev
```

开发服务器默认启用了 `host: true`，因此可以在局域网内访问。

## 可用脚本

| 命令 | 说明 |
|---------|-------------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建生产版本到 `dist/` 目录 |
| `npm run preview` | 在本地预览生产构建 |

## 项目结构

```
├── public/
│   ├── 2.glb                    # 3D T 恤模型
│   └── 2_diffuse_1001.png       # UV 导览背景图
├── src/
│   ├── core/
│   │   ├── Editor2D.js          # Fabric.js 画布编辑器
│   │   ├── Viewer3D.js          # Three.js 3D 查看器
│   │   └── Bridge.js            # 2D 与 3D 之间的同步层
│   └── main.js                  # 应用入口
├── index.html
├── package.json
└── vite.config.js
```

## 使用说明

1. 在浏览器中打开应用。
2. 使用左侧面板设计你的服装纹理：
   - **添加文字 / 图形**：点击工具按钮
   - **上传图片**：从设备中选择图片文件
   - **更改颜色**：为服装选择背景色
3. 编辑时右侧的 3D 模型会自动更新。

### 画布视口控制

| 操作 | 控制方式 |
|--------|---------|
| 缩放 | 鼠标滚轮 |
| 平移 | 按住 `空格` 拖动，或按住鼠标中键拖动 |

平移时，对象选择会暂时禁用，以便自由移动视口。

## 许可证

私有项目 — 未授权公开发布。
