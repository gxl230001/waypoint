"""Step 1 check: score windows from a recorded CSV, plus synthetic sanity windows."""
import sys

import numpy as np
import pandas as pd

import fall_model

df = pd.read_csv(sys.argv[1])
a = df[df.sensor == "accelerometer"].reset_index(drop=True)
g = df[df.sensor == "gyroscope"].reset_index(drop=True)
n = min(len(a), len(g))
data = np.column_stack([a[["x", "y", "z"]].values[:n], g[["x", "y", "z"]].values[:n]])
print(f"{sys.argv[1]}: {n} paired samples, peak |a| = {np.abs(data[:, :3]).max():.2f} g")

for start in range(0, n - fall_model.WINDOW + 1, int(sys.argv[2]) if len(sys.argv) > 2 else 20):
    w = data[start : start + fall_model.WINDOW]
    print(f"  window [{start:3d}:{start+100:3d}]  p(fall) = {fall_model.predict_window(w):.3f}")

rng = np.random.default_rng(0)
still = np.tile([0, 0, -1.0, 0, 0, 0], (100, 1)) + rng.normal(0, 0.01, (100, 6))
print(f"  synthetic phone-at-rest         p(fall) = {fall_model.predict_window(still):.3f}")
