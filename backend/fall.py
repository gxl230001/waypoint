"""POST /api/v1/fall/predict — scores one 100x6 IMU window."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import numpy as np

import fall_model

router = APIRouter(prefix="/api/v1/fall", tags=["fall"])


class WindowIn(BaseModel):
    # 100 rows of [ax, ay, az, gx, gy, gz]
    window: list[list[float]]


@router.post("/predict")
def predict(body: WindowIn):
    try:
        p = fall_model.predict_window(np.array(body.window))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"probability": p, "fall": p >= fall_model.THRESHOLD, "threshold": fall_model.THRESHOLD}
