"""IMU recording upload: POST /api/v1/imu/recordings

Receives one completed recording (metadata + CSV text), validates every row,
and stores it under the raw dataset directory without ever overwriting.

Stored layout (default ml/data/raw/, override with WAYPOINT_RAW_DATA_DIR):
    <session_id>.csv        exactly the CSV text that was uploaded
    <session_id>.meta.json  client metadata + server-side validation summary

Raw files are append-only. Preprocessing must write somewhere else
(for example ml/data/processed/) and never modify these.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

router = APIRouter(prefix="/api/v1/imu", tags=["imu"])

# Keep in sync with apps/mobile/src/imu/csv.ts (CSV_COLUMNS).
EXPECTED_COLUMNS = [
    "session_id",
    "timestamp_ms",
    "elapsed_ms",
    "sensor",
    "x",
    "y",
    "z",
    "activity",
    "sensor_timestamp_s",
]
SENSORS = {"accelerometer", "gyroscope"}
Activity = Literal["stationary", "walking", "running", "hazard"]

MAX_REQUEST_BYTES = 32 * 1024 * 1024  # whole HTTP body
MAX_ROWS = 600_000  # about 1 hour of two 50 Hz streams
MAX_ABS_VALUE = 1000.0  # g for the accelerometer, rad/s for the gyroscope
MAX_REPORTED_ERRORS = 10

# Allowlist used for file names. Client ids that do not match are rejected,
# so a client can never smuggle in a path component.
SESSION_ID_PATTERN = r"^[A-Za-z0-9_-]{8,80}$"


def raw_data_dir() -> Path:
    override = os.environ.get("WAYPOINT_RAW_DATA_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "ml" / "data" / "raw"


class SensorStatsIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    samples: int = Field(ge=0)
    observed_hz: float | None = None
    observed_hz_sensor_clock: float | None = None
    mean_interval_ms: float | None = None
    median_interval_ms: float | None = None
    max_gap_ms: float | None = None


class SessionMetadataIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    schema_version: Literal[1]
    session_id: str = Field(pattern=SESSION_ID_PATTERN)
    activity: Activity
    status: Literal["completed", "interrupted"]
    end_reason: str = Field(max_length=64)
    started_at_ms: float = Field(gt=0)
    ended_at_ms: float = Field(gt=0)
    duration_ms: float = Field(ge=0)
    requested_interval_ms: float = Field(gt=0)
    accelerometer: SensorStatsIn
    gyroscope: SensorStatsIn
    total_samples: int = Field(ge=0)
    invalid_readings: int = Field(ge=0, default=0)
    platform_os: str = Field(max_length=32)
    warnings: list[str] = Field(default_factory=list, max_length=50)


class UploadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metadata: SessionMetadataIn
    csv: str = Field(min_length=1)


class CsvSummary(BaseModel):
    rows: int
    accelerometer_samples: int
    gyroscope_samples: int
    observed_hz: dict[str, float | None]
    warnings: list[str]


class CsvValidationError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _finite(text: str) -> float | None:
    try:
        value = float(text)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def validate_csv(text: str, meta: SessionMetadataIn) -> CsvSummary:
    """Parse and check every row. Raises CsvValidationError listing problems."""
    if "\x00" in text:
        raise CsvValidationError(["CSV contains NUL bytes."])

    errors: list[str] = []

    def add(msg: str) -> bool:
        errors.append(msg)
        return len(errors) >= MAX_REPORTED_ERRORS

    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        header = next(reader)
    except StopIteration:
        raise CsvValidationError(["CSV is empty."])
    except csv.Error as e:
        raise CsvValidationError([f"CSV is malformed: {e}"])

    if header != EXPECTED_COLUMNS:
        raise CsvValidationError(
            [f"Header must be exactly: {','.join(EXPECTED_COLUMNS)}"]
        )

    counts = {"accelerometer": 0, "gyroscope": 0}
    first_elapsed: dict[str, float] = {}
    last_elapsed: dict[str, float] = {}
    rows = 0

    try:
        for line_no, row in enumerate(reader, start=2):
            rows += 1
            if rows > MAX_ROWS:
                raise CsvValidationError([f"CSV has more than {MAX_ROWS} rows."])

            if len(row) != len(EXPECTED_COLUMNS):
                if add(f"Line {line_no}: expected {len(EXPECTED_COLUMNS)} fields, got {len(row)}."):
                    break
                continue

            session_id, ts, elapsed, sensor, x, y, z, activity, native_ts = row

            if session_id != meta.session_id:
                if add(f"Line {line_no}: session_id does not match the metadata."):
                    break
                continue
            if activity != meta.activity:
                if add(f"Line {line_no}: activity '{activity}' does not match metadata '{meta.activity}'."):
                    break
                continue
            if sensor not in SENSORS:
                if add(f"Line {line_no}: unknown sensor '{sensor}'."):
                    break
                continue

            ts_v, el_v = _finite(ts), _finite(elapsed)
            axes = [_finite(x), _finite(y), _finite(z)]
            if ts_v is None or el_v is None or any(a is None for a in axes):
                if add(f"Line {line_no}: timestamp or axis value is not a finite number."):
                    break
                continue
            if any(abs(a) > MAX_ABS_VALUE for a in axes if a is not None):
                if add(f"Line {line_no}: axis value outside +/-{MAX_ABS_VALUE:g}."):
                    break
                continue
            if el_v < 0:
                if add(f"Line {line_no}: elapsed_ms is negative."):
                    break
                continue
            if native_ts != "" and _finite(native_ts) is None:
                if add(f"Line {line_no}: sensor_timestamp_s is not a finite number."):
                    break
                continue

            previous = last_elapsed.get(sensor)
            if previous is not None and el_v < previous:
                if add(f"Line {line_no}: elapsed_ms goes backwards for {sensor}."):
                    break
                continue

            counts[sensor] += 1
            first_elapsed.setdefault(sensor, el_v)
            last_elapsed[sensor] = el_v
    except csv.Error as e:
        raise CsvValidationError([f"CSV is malformed near line {reader.line_num}: {e}"])

    if errors:
        raise CsvValidationError(errors)
    if rows == 0:
        raise CsvValidationError(["CSV has a header but no data rows."])

    # The client's claimed counts must match what is actually in the file.
    mismatches = []
    if counts["accelerometer"] != meta.accelerometer.samples:
        mismatches.append(
            f"accelerometer count {counts['accelerometer']} != metadata {meta.accelerometer.samples}"
        )
    if counts["gyroscope"] != meta.gyroscope.samples:
        mismatches.append(
            f"gyroscope count {counts['gyroscope']} != metadata {meta.gyroscope.samples}"
        )
    if rows != meta.total_samples:
        mismatches.append(f"row count {rows} != metadata total_samples {meta.total_samples}")
    if mismatches:
        raise CsvValidationError(["Metadata does not match CSV: " + "; ".join(mismatches)])

    observed: dict[str, float | None] = {}
    for sensor, n in counts.items():
        span = last_elapsed.get(sensor, 0.0) - first_elapsed.get(sensor, 0.0)
        observed[sensor] = round((n - 1) / span * 1000, 3) if n >= 2 and span > 0 else None

    warnings: list[str] = []
    for sensor, n in counts.items():
        if n == 0:
            warnings.append(f"No {sensor} samples.")
    if meta.status == "interrupted":
        warnings.append("Recording was interrupted and may be incomplete.")

    return CsvSummary(
        rows=rows,
        accelerometer_samples=counts["accelerometer"],
        gyroscope_samples=counts["gyroscope"],
        observed_hz=observed,
        warnings=warnings,
    )


async def _read_limited_body(request: Request) -> bytes:
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > MAX_REQUEST_BYTES:
                raise HTTPException(413, f"Request larger than {MAX_REQUEST_BYTES} bytes.")
        except ValueError:
            raise HTTPException(400, "Invalid Content-Length header.")

    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():  # also covers chunked uploads
        total += len(chunk)
        if total > MAX_REQUEST_BYTES:
            raise HTTPException(413, f"Request larger than {MAX_REQUEST_BYTES} bytes.")
        chunks.append(chunk)
    return b"".join(chunks)


def _write_new(path: Path, data: bytes) -> None:
    """Create-only write. Raises FileExistsError instead of overwriting."""
    with open(path, "xb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())


@router.post("/recordings", status_code=201)
async def upload_recording(request: Request):
    """Body: JSON {"metadata": {...session metadata...}, "csv": "<csv text>"}."""
    body = await _read_limited_body(request)

    try:
        payload = UploadRequest.model_validate_json(body)
    except ValidationError as e:
        raise HTTPException(
            422,
            detail=[
                f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors()[:MAX_REPORTED_ERRORS]
            ],
        )

    meta = payload.metadata
    try:
        summary = validate_csv(payload.csv, meta)
    except CsvValidationError as e:
        raise HTTPException(422, detail=e.errors)

    csv_bytes = payload.csv.encode("utf-8")
    recording_id = meta.session_id  # validated against SESSION_ID_PATTERN above

    directory = raw_data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    csv_path = directory / f"{recording_id}.csv"
    meta_path = directory / f"{recording_id}.meta.json"

    # Defense in depth: the resolved path must stay inside the data directory.
    root = directory.resolve()
    for p in (csv_path, meta_path):
        if p.resolve().parent != root:
            raise HTTPException(400, "Invalid recording id.")

    record = {
        "recording_id": recording_id,
        "received_at_utc": datetime.now(timezone.utc).isoformat(),
        "csv_sha256": hashlib.sha256(csv_bytes).hexdigest(),
        "csv_bytes": len(csv_bytes),
        "client_metadata": meta.model_dump(),
        "server_validation": summary.model_dump(),
    }

    try:
        _write_new(csv_path, csv_bytes)
    except FileExistsError:
        raise HTTPException(409, "A recording with this session_id already exists.")
    except OSError as e:
        raise HTTPException(500, f"Could not store the recording: {e.strerror or e}")

    try:
        _write_new(meta_path, json.dumps(record, indent=2).encode("utf-8"))
    except FileExistsError:
        csv_path.unlink(missing_ok=True)  # our own half-finished write only
        raise HTTPException(409, "A recording with this session_id already exists.")
    except OSError as e:
        csv_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Could not store the recording: {e.strerror or e}")

    return {
        "recording_id": recording_id,
        "session_id": meta.session_id,
        "activity": meta.activity,
        "rows": summary.rows,
        "accelerometer_samples": summary.accelerometer_samples,
        "gyroscope_samples": summary.gyroscope_samples,
        "observed_hz": summary.observed_hz,
        "csv_sha256": record["csv_sha256"],
        "stored_as": csv_path.name,
        "warnings": summary.warnings,
    }
