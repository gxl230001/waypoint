"""Fall-detector inference: loads the trained Keras model once and scores IMU windows."""
import os
from pathlib import Path

import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
import keras  # noqa: E402

MODEL_DIR = Path(__file__).parent / "models"
WINDOW = 100  # samples, 2 s at 50 Hz
CHANNELS = 6  # ax, ay, az, gx, gy, gz (accel in g, gyro in rad/s)

# The saved threshold in the .npz was 1.0, which a sigmoid can never reach.
# Override with FALL_THRESHOLD once tuned on validation data.
THRESHOLD = float(os.environ.get("FALL_THRESHOLD", "0.5"))

_model = keras.models.load_model(MODEL_DIR / "best_fall_detector.keras")
_pre = np.load(MODEL_DIR / "fall_detector_preprocessing.npz")
_mean = _pre["channel_mean"].astype("float32")  # (1, 1, 6)
_std = _pre["channel_std"].astype("float32")


def predict_window(window: np.ndarray) -> float:
    """window: (100, 6) raw sensor values. Returns fall probability in [0, 1]."""
    x = np.asarray(window, dtype="float32")
    if x.shape != (WINDOW, CHANNELS):
        raise ValueError(f"expected ({WINDOW}, {CHANNELS}), got {x.shape}")
    x = (x[None, ...] - _mean) / _std
    return float(_model(x, training=False).numpy().ravel()[0])
