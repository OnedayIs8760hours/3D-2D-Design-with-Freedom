import fs from 'node:fs';
import path from 'node:path';

const glbPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve('public/2.glb');

const glbBuffer = fs.readFileSync(glbPath);
const { json, binChunk } = parseGlb(glbBuffer);

const report = analyzeDocument(json, binChunk);

console.log(`GLB: ${glbPath}`);
console.log(`Meshes: ${report.length}`);

report.forEach((entry) => {
    console.log('\n----------------------------------------');
    console.log(`Mesh: ${entry.meshName}`);
    console.log(`Primitive: ${entry.primitiveIndex}`);
    console.log(`Triangles: ${entry.triangleCount}`);
    console.log(`Vertices: ${entry.vertexCount}`);
    console.log(`UV bounds: U ${entry.uvBounds.minU.toFixed(4)} -> ${entry.uvBounds.maxU.toFixed(4)}, V ${entry.uvBounds.minV.toFixed(4)} -> ${entry.uvBounds.maxV.toFixed(4)}`);
    console.log(`UV aspect: ${entry.uvBounds.aspect.toFixed(3)}`);
    console.log(`3D bounds: X ${entry.positionBounds.minX.toFixed(4)} -> ${entry.positionBounds.maxX.toFixed(4)}, Y ${entry.positionBounds.minY.toFixed(4)} -> ${entry.positionBounds.maxY.toFixed(4)}, Z ${entry.positionBounds.minZ.toFixed(4)} -> ${entry.positionBounds.maxZ.toFixed(4)}`);
    console.log(`Stretch ratio p10/p50/p90: ${entry.stretch.p10.toFixed(3)} / ${entry.stretch.p50.toFixed(3)} / ${entry.stretch.p90.toFixed(3)}`);
    console.log(`Stretch min/max: ${entry.stretch.min.toFixed(3)} / ${entry.stretch.max.toFixed(3)}`);
    console.log(`Stretch variation max/min: ${entry.stretch.spread.toFixed(3)}`);
    console.log(`Problematic triangles (>2x median): ${entry.problemTriangles}`);
});

function parseGlb(buffer) {
    const magic = buffer.toString('utf8', 0, 4);
    if (magic !== 'glTF') {
        throw new Error('Invalid GLB header');
    }

    const version = buffer.readUInt32LE(4);
    if (version !== 2) {
        throw new Error(`Unsupported GLB version: ${version}`);
    }

    let offset = 12;
    let jsonChunk = null;
    let binChunk = null;

    while (offset < buffer.length) {
        const chunkLength = buffer.readUInt32LE(offset);
        const chunkType = buffer.readUInt32LE(offset + 4);
        offset += 8;

        const chunkData = buffer.subarray(offset, offset + chunkLength);
        offset += chunkLength;

        if (chunkType === 0x4e4f534a) {
            jsonChunk = JSON.parse(chunkData.toString('utf8'));
        } else if (chunkType === 0x004e4942) {
            binChunk = chunkData;
        }
    }

    if (!jsonChunk || !binChunk) {
        throw new Error('GLB is missing JSON or BIN chunk');
    }

    return { json: jsonChunk, binChunk };
}

function analyzeDocument(documentJson, binChunk) {
    const meshes = documentJson.meshes || [];

    return meshes.flatMap((mesh, meshIndex) => {
        return mesh.primitives.map((primitive, primitiveIndex) => {
            const positionAccessor = documentJson.accessors[primitive.attributes.POSITION];
            const uvAccessorIndex = primitive.attributes.TEXCOORD_0 ?? primitive.attributes.TEXCOORD_1;
            if (uvAccessorIndex === undefined) {
                throw new Error(`Mesh ${mesh.name || meshIndex} has no UV accessor`);
            }

            const uvAccessor = documentJson.accessors[uvAccessorIndex];
            const indicesAccessor = primitive.indices !== undefined
                ? documentJson.accessors[primitive.indices]
                : null;

            const positions = readAccessor(documentJson, binChunk, positionAccessor);
            const uvs = readAccessor(documentJson, binChunk, uvAccessor);
            const indices = indicesAccessor ? readAccessor(documentJson, binChunk, indicesAccessor) : null;

            return analyzePrimitive({
                meshName: mesh.name || `mesh_${meshIndex}`,
                primitiveIndex,
                positions,
                uvs,
                indices
            });
        });
    });
}

function readAccessor(documentJson, binChunk, accessor) {
    const bufferView = documentJson.bufferViews[accessor.bufferView];
    const componentCount = getTypeComponentCount(accessor.type);
    const componentSize = getComponentSize(accessor.componentType);
    const byteStride = bufferView.byteStride || componentCount * componentSize;
    const accessorOffset = accessor.byteOffset || 0;
    const bufferOffset = bufferView.byteOffset || 0;
    const values = [];

    for (let i = 0; i < accessor.count; i += 1) {
        const elementOffset = bufferOffset + accessorOffset + i * byteStride;
        values.push(readElement(binChunk, elementOffset, accessor.componentType, componentCount, accessor.normalized));
    }

    return values;
}

function readElement(buffer, offset, componentType, componentCount, normalized) {
    const values = [];
    const readers = {
        5120: (byteOffset) => buffer.readInt8(byteOffset),
        5121: (byteOffset) => buffer.readUInt8(byteOffset),
        5122: (byteOffset) => buffer.readInt16LE(byteOffset),
        5123: (byteOffset) => buffer.readUInt16LE(byteOffset),
        5125: (byteOffset) => buffer.readUInt32LE(byteOffset),
        5126: (byteOffset) => buffer.readFloatLE(byteOffset)
    };

    const normalizers = {
        5120: (value) => Math.max(value / 127, -1),
        5121: (value) => value / 255,
        5122: (value) => Math.max(value / 32767, -1),
        5123: (value) => value / 65535,
        5125: (value) => value / 4294967295,
        5126: (value) => value
    };

    const step = getComponentSize(componentType);

    for (let i = 0; i < componentCount; i += 1) {
        const rawValue = readers[componentType](offset + i * step);
        values.push(normalized ? normalizers[componentType](rawValue) : rawValue);
    }

    return values;
}

function analyzePrimitive({ meshName, primitiveIndex, positions, uvs, indices }) {
    const triangleIndices = [];

    if (indices) {
        indices.forEach((value) => triangleIndices.push(value[0]));
    } else {
        for (let i = 0; i < positions.length; i += 1) {
            triangleIndices.push(i);
        }
    }

    const stretchRatios = [];

    for (let i = 0; i < triangleIndices.length; i += 3) {
        const ia = triangleIndices[i];
        const ib = triangleIndices[i + 1];
        const ic = triangleIndices[i + 2];
        if (ic === undefined) break;

        const area3d = triangleArea3D(positions[ia], positions[ib], positions[ic]);
        const areaUv = triangleArea2D(uvs[ia], uvs[ib], uvs[ic]);
        if (area3d <= 1e-12 || areaUv <= 1e-12) continue;

        stretchRatios.push(areaUv / area3d);
    }

    stretchRatios.sort((left, right) => left - right);
    const median = percentile(stretchRatios, 0.5);
    const stretch = {
        min: stretchRatios[0] ?? 0,
        p10: percentile(stretchRatios, 0.1),
        p50: median,
        p90: percentile(stretchRatios, 0.9),
        max: stretchRatios[stretchRatios.length - 1] ?? 0,
        spread: median > 0 ? (stretchRatios[stretchRatios.length - 1] ?? 0) / Math.max(stretchRatios[0] ?? 1, 1e-9) : 0
    };

    return {
        meshName,
        primitiveIndex,
        triangleCount: Math.floor(triangleIndices.length / 3),
        vertexCount: positions.length,
        uvBounds: computeUvBounds(uvs),
        positionBounds: computePositionBounds(positions),
        stretch,
        problemTriangles: stretchRatios.filter((value) => median > 0 && value > median * 2).length
    };
}

function computeUvBounds(uvs) {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;

    uvs.forEach(([u, v]) => {
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
    });

    const width = maxU - minU;
    const height = maxV - minV;

    return {
        minU,
        maxU,
        minV,
        maxV,
        aspect: height > 1e-9 ? width / height : 0
    };
}

function computePositionBounds(positions) {
    const initial = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity
    };

    return positions.reduce((bounds, [x, y, z]) => {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
        bounds.minZ = Math.min(bounds.minZ, z);
        bounds.maxZ = Math.max(bounds.maxZ, z);
        return bounds;
    }, initial);
}

function triangleArea2D(a, b, c) {
    return Math.abs(
        a[0] * (b[1] - c[1]) +
        b[0] * (c[1] - a[1]) +
        c[0] * (a[1] - b[1])
    ) * 0.5;
}

function triangleArea3D(a, b, c) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0]
    ];

    return 0.5 * Math.hypot(cross[0], cross[1], cross[2]);
}

function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return 0;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(ratio * (sortedValues.length - 1))));
    return sortedValues[index];
}

function getTypeComponentCount(type) {
    const counts = {
        SCALAR: 1,
        VEC2: 2,
        VEC3: 3,
        VEC4: 4,
        MAT2: 4,
        MAT3: 9,
        MAT4: 16
    };

    return counts[type];
}

function getComponentSize(componentType) {
    const sizes = {
        5120: 1,
        5121: 1,
        5122: 2,
        5123: 2,
        5125: 4,
        5126: 4
    };

    return sizes[componentType];
}