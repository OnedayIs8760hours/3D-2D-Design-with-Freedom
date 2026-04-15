from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.assets import router as assets_router

app = FastAPI(title="3D Design Customizer API")

# CORS – allow the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
