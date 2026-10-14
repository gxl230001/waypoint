# IMU datasets

```text
ml/data/
├── raw/         # written by the backend upload endpoint. Append-only.
└── processed/   # created by your preprocessing code. Safe to delete and rebuild.
```

- `raw/<session_id>.csv` is exactly the CSV the phone uploaded.
- `raw/<session_id>.meta.json` holds the session metadata plus the backend's
  validation summary and a SHA-256 of the CSV.
- Never edit or overwrite files in `raw/`. Preprocessing reads from `raw/` and
  writes only to `processed/`.
- This folder is git-ignored. Do not commit recordings.
- The CSV schema is documented in the project README ("IMU data collection").
