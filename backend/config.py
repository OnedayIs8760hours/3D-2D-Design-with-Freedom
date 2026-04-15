from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
MODELS_DIR = UPLOAD_DIR / "models"
TEXTURES_DIR = UPLOAD_DIR / "textures"
DESIGNS_DIR = UPLOAD_DIR / "designs"

# Ensure directories exist
for d in (MODELS_DIR, TEXTURES_DIR, DESIGNS_DIR):
    d.mkdir(parents=True, exist_ok=True)

ALLOWED_MODEL_EXTENSIONS = {".glb", ".gltf"}
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
