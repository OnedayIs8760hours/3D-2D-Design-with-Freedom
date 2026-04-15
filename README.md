# Pacdora Clothing Lite

A lightweight 3D clothing customization app built with Vite, Three.js, and Fabric.js.

## Features

- **2D Texture Editor**: Fabric.js-powered canvas (1024×1024) for designing custom clothing textures
  - Add text and shapes
  - Upload images / logos
  - Change background colors
  - Pan and zoom viewport controls
- **3D Live Preview**: Three.js viewer that applies the 2D canvas directly onto a 3D T-shirt model as a texture
- **Real-time Sync**: Changes in the 2D editor instantly reflect on the 3D model

## Tech Stack

- [Vite](https://vitejs.dev/) — build tool and dev server
- [Three.js](https://threejs.org/) — 3D rendering
- [Fabric.js](http://fabricjs.com/) — 2D canvas manipulation

## Getting Started

```bash
npm install
npm run dev
```

The dev server runs with `host: true` enabled, so it is accessible on the local network.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the app for production into `dist/` |
| `npm run preview` | Preview the production build locally |

## Project Structure

```
├── public/
│   ├── 2.glb                    # 3D T-shirt model
│   └── 2_diffuse_1001.png       # UV guide background
├── src/
│   ├── core/
│   │   ├── Editor2D.js          # Fabric.js canvas editor
│   │   ├── Viewer3D.js          # Three.js 3D viewer
│   │   └── Bridge.js            # Sync layer between 2D and 3D
│   └── main.js                  # App entry point
├── index.html
├── package.json
└── vite.config.js
```

## Usage

1. Open the app in your browser.
2. Use the left panel to design your clothing texture:
   - **Add Text / Shapes**: click the tool buttons
   - **Upload Image**: select an image file from your device
   - **Change Color**: pick a background color for the clothing
3. The 3D model on the right updates automatically as you edit.

### Canvas Viewport Controls

| Action | Control |
|--------|---------|
| Zoom | Mouse wheel |
| Pan | Hold `Space` and drag, or middle-click and drag |

While panning, object selection is temporarily disabled so you can move the viewport freely.

## License

Private — not licensed for public distribution.
