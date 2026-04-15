import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Viewer3D {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.textureCanvasSize = 1024;
        this.uvTemplatePaddingRatio = 0.06;
        this.modelUrl = options.modelUrl || '/shirt.glb';
        this.useDirectUvSpace = options.useDirectUvSpace || false;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xeeeeee); // 改回亮色背景

        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 40);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace; 
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.addLights();
        
        this.allMeshes = [];
        this.cachedCanvasSource = null;
        this.uvConfig = null;
        this.cachedUVTemplateUrl = null;
        this.onUVTemplateReady = null;

        this.initPlaceholderModel();
        this.loadModel();

        window.addEventListener('resize', this.onResize.bind(this));
    }

    addLights() {
        const amb = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(amb);
        const dir = new THREE.DirectionalLight(0xffffff, 1.5);
        dir.position.set(5, 10, 7);
        this.scene.add(dir);
        const back = new THREE.DirectionalLight(0xffffff, 0.5);
        back.position.set(-5, 5, -10);
        this.scene.add(back);
    }

    initPlaceholderModel() {
        const geometry = new THREE.BoxGeometry(10, 14, 10);
        const material = new THREE.MeshStandardMaterial({ color: 0xdddddd });
        const box = new THREE.Mesh(geometry, material);
        box.name = "PlaceholderBox";
        this.scene.add(box);
        this.allMeshes.push(box); 
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load(this.modelUrl, (gltf) => {
            const model = gltf.scene;

            // 清理占位符
            const placeholder = this.scene.getObjectByName("PlaceholderBox");
            if (placeholder) {
                this.scene.remove(placeholder);
                this.allMeshes = [];
            }

            model.traverse((child) => {
                if (child.isMesh) {
                    // 恢复正常材质
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        roughness: 0.5,
                        metalness: 0.1,
                        side: THREE.DoubleSide
                    });
                    this.allMeshes.push(child);
                }
            });

            this.uvConfig = analyzeUVBounds(
                this.allMeshes,
                this.textureCanvasSize,
                this.uvTemplatePaddingRatio
            );

            // 缩放居中
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 20 / maxDim;
            model.scale.set(scale, scale, scale);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center.multiplyScalar(scale));

            this.scene.add(model);
            console.log("✅ 模型加载完毕");
            if (this.uvConfig) {
                console.log("📐 当前模型 UV 范围:", this.uvConfig);
                this.publishUVTemplate();
            } else {
                console.warn("⚠️ 当前模型没有可用 UV，无法生成映射模板");
            }

            // 立即应用纹理
            if (this.cachedCanvasSource) {
                this.updateTexture(this.cachedCanvasSource);
            }

            const exportButton = document.getElementById('btn-export-uv');
            if (exportButton) {
                exportButton.remove();
            }

        }, undefined, (err) => console.error(err));
    }

    setUVTemplateListener(listener) {
        this.onUVTemplateReady = listener;
        if (listener && this.cachedUVTemplateUrl) {
            listener(this.cachedUVTemplateUrl);
        }
    }

    publishUVTemplate() {
        const canvas = createCombinedUVCanvas(
            this.allMeshes,
            this.textureCanvasSize,
            this.uvTemplatePaddingRatio,
            this.uvConfig
        );
        if (!canvas) return;

        this.cachedUVTemplateUrl = canvas.toDataURL('image/png');
        if (this.onUVTemplateReady) {
            this.onUVTemplateReady(this.cachedUVTemplateUrl);
        }
    }

    updateTexture(canvasElement) {
        this.cachedCanvasSource = canvasElement;
        if (this.allMeshes.length === 0) return;
        if (!this.uvConfig) return;

        this.allMeshes.forEach(mesh => {
            if (mesh.name === "PlaceholderBox") return;

            const uv = getMeshUVAttribute(mesh);
            if (!uv) return;

            const material = mesh.material;
            
            // 创建或更新纹理
            if (!material.map || material.map.source.data !== canvasElement) {
                const texture = new THREE.CanvasTexture(canvasElement);
                texture.outputColorSpace = THREE.SRGBColorSpace;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                
                // ========================================================
                // 🛠️ 重点修复：应用 UV 变换
                // 公式：Texture_Coord = UV * repeat + offset
                // 我们要达成：(UV - min) / range
                // 所以：repeat = 1 / range, offset = -min / range
                // ========================================================
                
                texture.center.set(0, 0);
                texture.rotation = 0;

                if (this.useDirectUvSpace) {
                    texture.repeat.set(1, 1);
                    texture.offset.set(0, 0);
                } else {
                    texture.repeat.set(this.uvConfig.textureScale, this.uvConfig.textureScale);
                    texture.offset.set(this.uvConfig.textureOffsetX, this.uvConfig.textureOffsetY);
                }

                // 注意：这里可能不需要 flipY = false 了，因为我们要严格遵循数值计算
                // 如果发现上下颠倒，请尝试把这里改成 true，或者去 Editor2D 里把图片翻转
                texture.flipY = false; 

                material.map = texture;
                material.needsUpdate = true;
            } else {
                material.map.needsUpdate = true;
            }
        });
    }

    start() { this.animate(); }
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
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

// =========================================================
// 👇 导出全局 UV 线框图
// =========================================================
function downloadCombinedUV(meshes) {
    const uvConfig = analyzeUVBounds(meshes, 1024, 0.06);
    const canvas = createCombinedUVCanvas(meshes, 1024, 0.06, uvConfig);
    if (!canvas) {
        alert("❌ 错误：所有部件都没有 UV 数据！");
        return;
    }

    const link = document.createElement('a');
    link.download = `shirt_global_fit.png`;
    link.href = canvas.toDataURL();
    link.click();
    console.log("✅ 全局 UV 图已生成");
}

function getMeshUVAttribute(mesh) {
    if (!mesh.geometry?.attributes) return null;

    let uv = mesh.geometry.attributes.uv;
    if (!uv && mesh.geometry.attributes.uv2) uv = mesh.geometry.attributes.uv2;
    return uv || null;
}

function analyzeUVBounds(meshes, canvasSize = 1024, paddingRatio = 0.06) {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    let validMeshCount = 0;

    meshes.forEach((mesh) => {
        const uv = getMeshUVAttribute(mesh);
        if (!uv) return;

        validMeshCount += 1;

        for (let i = 0; i < uv.count; i++) {
            const u = uv.getX(i);
            const v = uv.getY(i);
            if (u < minU) minU = u;
            if (u > maxU) maxU = u;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }
    });

    if (validMeshCount === 0 || minU === Infinity) {
        return null;
    }

    const rangeU = Math.max(maxU - minU, 1e-6);
    const rangeV = Math.max(maxV - minV, 1e-6);

    console.log(`📊 全局 UV 范围检测:`);
    console.log(`   X: ${minU.toFixed(2)} ~ ${maxU.toFixed(2)} (跨度: ${rangeU})`);
    console.log(`   Y: ${minV.toFixed(2)} ~ ${maxV.toFixed(2)} (跨度: ${rangeV})`);

    const layout = computeUvCanvasLayout({ minU, minV, rangeU, rangeV }, canvasSize, paddingRatio);

    return {
        minU,
        maxU,
        minV,
        maxV,
        rangeU,
        rangeV,
        validMeshCount,
        ...layout
    };
}

function createCombinedUVCanvas(meshes, size = 1024, paddingRatio = 0.06, uvConfig = null) {
    const bounds = uvConfig || analyzeUVBounds(meshes, size, paddingRatio);
    if (!bounds) {
        return null;
    }

    const mapX = (u) => bounds.offsetX + (u - bounds.minU) * bounds.pixelScale;
    const mapY = (v) => bounds.offsetY + (v - bounds.minV) * bounds.pixelScale;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    drawTemplateGrid(ctx, size, bounds);

    meshes.forEach((mesh, index) => {
        const uv = getMeshUVAttribute(mesh);
        if (!uv) return;

        const hue = (index * 137) % 360;
        const meshTriangles = collectMeshTriangles(mesh, uv, mapX, mapY);
        if (meshTriangles.length === 0) return;

        ctx.fillStyle = `hsla(${hue}, 85%, 72%, 0.18)`;
        meshTriangles.forEach((triangle) => {
            ctx.beginPath();
            ctx.moveTo(triangle.points[0].x, triangle.points[0].y);
            ctx.lineTo(triangle.points[1].x, triangle.points[1].y);
            ctx.lineTo(triangle.points[2].x, triangle.points[2].y);
            ctx.closePath();
            ctx.fill();
        });

        ctx.strokeStyle = `hsla(${hue}, 70%, 42%, 0.95)`;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const boundaryEdges = extractBoundaryEdges(meshTriangles);
        boundaryEdges.forEach((edge) => {
            ctx.beginPath();
            ctx.moveTo(edge.start.x, edge.start.y);
            ctx.lineTo(edge.end.x, edge.end.y);
            ctx.stroke();
        });

        drawMeshLabel(ctx, mesh.name, getMeshLabelPosition(meshTriangles));
    });

    return canvas;
}

function collectMeshTriangles(mesh, uv, mapX, mapY) {
    const triangles = [];
    const indexAttr = mesh.geometry.index;
    const loopCount = indexAttr ? indexAttr.count : uv.count;

    for (let i = 0; i < loopCount; i += 3) {
        let a;
        let b;
        let c;

        if (indexAttr) {
            a = indexAttr.getX(i);
            b = indexAttr.getX(i + 1);
            c = indexAttr.getX(i + 2);
        } else {
            a = i;
            b = i + 1;
            c = i + 2;
        }

        const points = [a, b, c].map((vertexIndex) => ({
            u: uv.getX(vertexIndex),
            v: uv.getY(vertexIndex),
            x: mapX(uv.getX(vertexIndex)),
            y: mapY(uv.getY(vertexIndex))
        }));

        triangles.push({
            meshName: mesh.name,
            points
        });
    }

    return triangles;
}

function extractBoundaryEdges(triangles) {
    const edgeMap = new Map();

    triangles.forEach((triangle) => {
        const points = triangle.points;
        const edges = [
            [points[0], points[1]],
            [points[1], points[2]],
            [points[2], points[0]]
        ];

        edges.forEach(([start, end]) => {
            const key = makeEdgeKey(start, end);
            const current = edgeMap.get(key);
            if (current) {
                current.count += 1;
            } else {
                edgeMap.set(key, { start, end, count: 1 });
            }
        });
    });

    return Array.from(edgeMap.values())
        .filter((edge) => edge.count === 1)
        .map(({ start, end }) => ({ start, end }));
}

function makeEdgeKey(pointA, pointB) {
    const keyA = `${pointA.u.toFixed(5)},${pointA.v.toFixed(5)}`;
    const keyB = `${pointB.u.toFixed(5)},${pointB.v.toFixed(5)}`;
    return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

function getMeshLabelPosition(triangles) {
    const aggregate = triangles.reduce((accumulator, triangle) => {
        triangle.points.forEach((point) => {
            accumulator.sumX += point.x;
            accumulator.sumY += point.y;
            accumulator.count += 1;
        });
        return accumulator;
    }, { sumX: 0, sumY: 0, count: 0 });

    return {
        x: aggregate.sumX / Math.max(aggregate.count, 1),
        y: aggregate.sumY / Math.max(aggregate.count, 1)
    };
}

function drawMeshLabel(ctx, text, position) {
    ctx.save();
    ctx.font = 'bold 16px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4;
    ctx.strokeText(text, position.x, position.y);
    ctx.fillStyle = '#1f2937';
    ctx.fillText(text, position.x, position.y);
    ctx.restore();
}

function drawTemplateGrid(ctx, size, bounds) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;

    const innerWidth = bounds.contentWidth;
    const innerHeight = bounds.contentHeight;
    for (let step = 0; step <= 8; step += 1) {
        const offsetX = bounds.offsetX + (innerWidth / 8) * step;
        const offsetY = bounds.offsetY + (innerHeight / 8) * step;

        ctx.beginPath();
        ctx.moveTo(offsetX, bounds.offsetY);
        ctx.lineTo(offsetX, bounds.offsetY + innerHeight);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(bounds.offsetX, offsetY);
        ctx.lineTo(bounds.offsetX + innerWidth, offsetY);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bounds.offsetX, bounds.offsetY, innerWidth, innerHeight);
    ctx.restore();
}

function computeUvCanvasLayout(bounds, canvasSize, paddingRatio) {
    const basePadding = Math.round(canvasSize * paddingRatio);
    const drawableWidth = canvasSize - basePadding * 2;
    const drawableHeight = canvasSize - basePadding * 2;
    const pixelScale = Math.min(drawableWidth / bounds.rangeU, drawableHeight / bounds.rangeV);
    const contentWidth = bounds.rangeU * pixelScale;
    const contentHeight = bounds.rangeV * pixelScale;
    const offsetX = (canvasSize - contentWidth) * 0.5;
    const offsetY = (canvasSize - contentHeight) * 0.5;

    return {
        pixelScale,
        contentWidth,
        contentHeight,
        offsetX,
        offsetY,
        textureScale: pixelScale / canvasSize,
        textureOffsetX: offsetX / canvasSize - bounds.minU * (pixelScale / canvasSize),
        textureOffsetY: offsetY / canvasSize - bounds.minV * (pixelScale / canvasSize)
    };
}