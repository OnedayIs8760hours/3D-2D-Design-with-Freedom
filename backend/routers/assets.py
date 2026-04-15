import uuid
import json
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from config import (
    MODELS_DIR, TEXTURES_DIR, DESIGNS_DIR,
    ALLOWED_MODEL_EXTENSIONS, ALLOWED_IMAGE_EXTENSIONS, MAX_UPLOAD_SIZE,
)

router = APIRouter(prefix="/api", tags=["assets"])


# ── Models ──────────────────────────────────────────────────

@router.get("/models")
async def list_models():
    """List all uploaded 3D models."""
    files = [
        {"name": f.name, "url": f"/api/models/{f.name}"}
        for f in MODELS_DIR.iterdir()
        if f.suffix.lower() in ALLOWED_MODEL_EXTENSIONS
    ]
    return files


@router.get("/models/{filename}")
async def get_model(filename: str):
    filepath = MODELS_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(404, "Model not found")
    # Prevent path traversal
    if filepath.resolve().parent != MODELS_DIR.resolve():
        raise HTTPException(400, "Invalid filename")
    return FileResponse(filepath, media_type="model/gltf-binary")


@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_MODEL_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Allowed: {ALLOWED_MODEL_EXTENSIONS}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(400, "File too large")

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = MODELS_DIR / safe_name
    dest.write_bytes(content)

    return {"name": safe_name, "url": f"/api/models/{safe_name}"}


# ── Textures ────────────────────────────────────────────────

@router.get("/textures")
async def list_textures():
    files = [
        {"name": f.name, "url": f"/api/textures/{f.name}"}
        for f in TEXTURES_DIR.iterdir()
        if f.suffix.lower() in ALLOWED_IMAGE_EXTENSIONS
    ]
    return files


@router.get("/textures/{filename}")
async def get_texture(filename: str):
    filepath = TEXTURES_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(404, "Texture not found")
    if filepath.resolve().parent != TEXTURES_DIR.resolve():
        raise HTTPException(400, "Invalid filename")
    return FileResponse(filepath)


@router.post("/textures/upload")
async def upload_texture(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format. Allowed: {ALLOWED_IMAGE_EXTENSIONS}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(400, "File too large")

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = TEXTURES_DIR / safe_name
    dest.write_bytes(content)

    return {"name": safe_name, "url": f"/api/textures/{safe_name}"}


# ── Designs (save/load JSON) ───────────────────────────────

@router.get("/designs")
async def list_designs():
    files = [
        {"id": f.stem, "name": f.stem, "url": f"/api/designs/{f.stem}"}
        for f in DESIGNS_DIR.iterdir()
        if f.suffix == ".json"
    ]
    return files


@router.get("/designs/{design_id}")
async def get_design(design_id: str):
    filepath = DESIGNS_DIR / f"{design_id}.json"
    if not filepath.exists():
        raise HTTPException(404, "Design not found")
    if filepath.resolve().parent != DESIGNS_DIR.resolve():
        raise HTTPException(400, "Invalid design id")
    return json.loads(filepath.read_text(encoding="utf-8"))


@router.post("/designs")
async def save_design(design: dict):
    design_id = uuid.uuid4().hex[:12]
    filepath = DESIGNS_DIR / f"{design_id}.json"
    filepath.write_text(json.dumps(design, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"id": design_id, "url": f"/api/designs/{design_id}"}
