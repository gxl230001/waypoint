from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.imu import router as imu_router

app = FastAPI(
    title="Waypoint API",
    description="Backend for the low-vision navigation MVP.",
    version="0.1.0",
)

# Development configuration only.
# Restrict origins before deploying publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(imu_router)


@app.get("/")
def root():
    return {
        "name": "Waypoint API",
        "status": "running",
        "version": "0.1.0",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/navigation/status")
def navigation_status():
    return {
        "navigation_available": False,
        "message": "Navigation engine not implemented yet.",
    }