/# IMU session contract (schema_version 1)

One recording session is a CSV plus a metadata object. The phone produces it;
the backend validates and stores it unchanged under `ml/data/raw/`.

Implementations that must stay in sync:

- `apps/mobile/src/imu/csv.ts` (`CSV_COLUMNS`) and `types.ts`
- `backend/routers/imu.py` (`EXPECTED_COLUMNS`, `SessionMetadataIn`)

## CSV

Header, in this exact order:

```text
session_id,timestamp_ms,elapsed_ms,sensor,x,y,z,activity,sensor_timestamp_s
```

| Column | Meaning |
|---|---|
| `session_id` | Matches `^[A-Za-z0-9_-]{8,80}$`, constant for the file, equals `metadata.session_id` |
| `timestamp_ms` | Epoch milliseconds, `session start + elapsed_ms` |
| `elapsed_ms` | Monotonic milliseconds since the session started, never negative, non-decreasing per sensor |
| `sensor` | `accelerometer` or `gyroscope` |
| `x`, `y`, `z` | Finite numbers, absolute value at most 1000. Accelerometer in g (includes gravity), gyroscope in rad/s |
| `activity` | One of the activities below, constant for the file, equals `metadata.activity` |
| `sensor_timestamp_s` | Native sensor clock in seconds, or empty. Only differences are meaningful |

Rows are long-form and kept in callback order, so the two sensor streams are
interleaved. Nothing is merged or resampled.

## Activities

`stationary`, `walking`, `running`, `hazard`

## Metadata

| Field | Type | Notes |
|---|---|---|
| `schema_version` | `1` | Bump when any rule here changes incompatibly |
| `session_id` | string | See CSV |
| `activity` | activity | |
| `status` | `completed` or `interrupted` | |
| `end_reason` | string, at most 64 chars | e.g. `user_stopped`, `app_backgrounded`, `app_unmounted` |
| `started_at_ms`, `ended_at_ms` | number | Epoch ms |
| `duration_ms` | number, at least 0 | Monotonic |
| `requested_interval_ms` | number, above 0 | |
| `accelerometer`, `gyroscope` | sensor stats | `samples` plus observed rate and interval figures |
| `total_samples` | integer | Must equal the CSV data row count |
| `invalid_readings` | integer | Default 0 |
| `platform_os` | string, at most 32 chars | |
| `warnings` | list of strings, at most 50 | |

The per-sensor `samples` and `total_samples` must match the CSV exactly, or the
backend rejects the upload with 422.

## Upload

`POST /api/v1/imu/recordings` with JSON `{"metadata": {...}, "csv": "<csv text>"}`.

| Status | Meaning |
|---|---|
| 201 | Stored. Body echoes counts, observed rates and the CSV SHA-256 |
| 409 | A recording with this `session_id` already exists. Raw files are never overwritten |
| 413 | Body larger than 32 MiB |
| 422 | Metadata or CSV failed validation. Body lists up to 10 problems |

Limits: 600,000 rows per recording.
