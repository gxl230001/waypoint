"""Run from backend/:  pytest -q"""

import hashlib
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routers import imu  # noqa: E402
from main import app  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "ts_generated_session.json"
URL = "/api/v1/imu/recordings"
HEADER = ",".join(imu.EXPECTED_COLUMNS)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WAYPOINT_RAW_DATA_DIR", str(tmp_path / "raw"))
    return TestClient(app)


@pytest.fixture()
def raw_dir(tmp_path):
    return tmp_path / "raw"


def sensor_stats(n):
    return {"samples": n}


def make_payload(rows=None, **meta_overrides):
    """Small valid payload: 3 accelerometer + 2 gyroscope rows."""
    sid = "20261013T224200Z_walking_abc123"
    activity = meta_overrides.get("activity", "walking")
    if rows is None:
        rows = [
            f"{sid},1000.000,0.000,accelerometer,0.1,-0.98,0.05,{activity},100.0",
            f"{sid},1004.000,4.000,gyroscope,0.01,0.02,0.03,{activity},100.004",
            f"{sid},1020.000,20.000,accelerometer,0.2,-0.97,0.05,{activity},100.02",
            f"{sid},1024.000,24.000,gyroscope,0.01,0.02,0.04,{activity},",
            f"{sid},1040.000,40.000,accelerometer,0.3,-0.96,0.06,{activity},100.04",
        ]
    csv_text = HEADER + "\n" + "\n".join(rows) + "\n"
    meta = {
        "schema_version": 1,
        "session_id": sid,
        "activity": "walking",
        "status": "completed",
        "end_reason": "user_stopped",
        "started_at_ms": 1000,
        "ended_at_ms": 1100,
        "duration_ms": 100,
        "requested_interval_ms": 20,
        "accelerometer": sensor_stats(3),
        "gyroscope": sensor_stats(2),
        "total_samples": 5,
        "invalid_readings": 0,
        "platform_os": "ios",
        "warnings": [],
    }
    meta.update(meta_overrides)
    return {"metadata": meta, "csv": csv_text}


def with_row(row):
    p = make_payload()
    lines = p["csv"].rstrip("\n").split("\n")
    lines[1] = row
    p["csv"] = "\n".join(lines) + "\n"
    return p


# ---------- existing routes keep working ----------

def test_existing_routes_still_work(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/").json()["status"] == "running"
    assert client.get("/api/v1/navigation/status").json()["navigation_available"] is False


# ---------- happy path ----------

def test_valid_upload_is_stored_exactly(client, raw_dir):
    payload = make_payload()
    r = client.post(URL, json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["recording_id"] == payload["metadata"]["session_id"]
    assert body["rows"] == 5
    assert body["accelerometer_samples"] == 3 and body["gyroscope_samples"] == 2

    csv_path = raw_dir / f"{body['recording_id']}.csv"
    assert csv_path.read_text() == payload["csv"]  # stored byte-for-byte
    assert body["csv_sha256"] == hashlib.sha256(payload["csv"].encode()).hexdigest()

    meta = json.loads((raw_dir / f"{body['recording_id']}.meta.json").read_text())
    assert meta["client_metadata"]["activity"] == "walking"
    assert meta["server_validation"]["rows"] == 5
    assert "path" not in r.text.lower()  # no server paths leaked in the response


def test_contract_with_typescript_generated_payload(client, raw_dir):
    """Payload produced by the app's own csv.ts / stats.ts."""
    payload = json.loads(FIXTURE.read_text())
    r = client.post(URL, json=payload)
    assert r.status_code == 201, r.text
    assert r.json()["rows"] == 1400
    assert 45 < r.json()["observed_hz"]["accelerometer"] < 55


def test_interrupted_upload_accepted_and_flagged(client):
    r = client.post(
        URL, json=make_payload(status="interrupted", end_reason="app_backgrounded")
    )
    assert r.status_code == 201
    assert any("interrupted" in w for w in r.json()["warnings"])


# ---------- never overwrite ----------

def test_duplicate_session_is_rejected_and_original_kept(client, raw_dir):
    payload = make_payload()
    assert client.post(URL, json=payload).status_code == 201
    original = (raw_dir / f"{payload['metadata']['session_id']}.csv").read_text()

    tampered = make_payload()
    tampered["csv"] = tampered["csv"].replace("0.1,-0.98", "9.9,-0.98")
    r = client.post(URL, json=tampered)
    assert r.status_code == 409
    assert (raw_dir / f"{payload['metadata']['session_id']}.csv").read_text() == original


# ---------- validation ----------

@pytest.mark.parametrize(
    "activity", ["swimming", "Walking", "", "walking ", "../walking", "other_movement"]
)
def test_invalid_activity_label_rejected(client, activity):
    assert client.post(URL, json=make_payload(activity=activity)).status_code == 422


def test_hazard_activity_accepted(client):
    payload = make_payload(activity="hazard")
    r = client.post(URL, json=payload)
    assert r.status_code == 201, r.text
    assert r.json()["activity"] == "hazard"


def test_row_activity_must_match_metadata(client):
    sid = "20261013T224200Z_walking_abc123"
    p = with_row(f"{sid},1000.000,0.000,accelerometer,0.1,-0.98,0.05,running,100.0")
    r = client.post(URL, json=p)
    assert r.status_code == 422 and "activity" in json.dumps(r.json())


def test_row_session_id_must_match_metadata(client):
    p = with_row("20261013T224200Z_walking_other99,1000.0,0.0,accelerometer,0.1,0.1,0.1,walking,")
    assert client.post(URL, json=p).status_code == 422


def test_bad_header_rejected(client):
    p = make_payload()
    p["csv"] = p["csv"].replace("elapsed_ms", "elapsed")
    assert client.post(URL, json=p).status_code == 422


def test_header_only_csv_rejected(client):
    p = make_payload(total_samples=0, accelerometer=sensor_stats(0), gyroscope=sensor_stats(0))
    p["csv"] = HEADER + "\n"  # a real header-only file
    r = client.post(URL, json=p)
    assert r.status_code == 422 and "no data rows" in json.dumps(r.json())


def test_blank_line_inside_csv_rejected(client):
    p = make_payload()
    p["csv"] = p["csv"] + "\n"  # stray empty line at the end
    assert client.post(URL, json=p).status_code == 422


@pytest.mark.parametrize("bad", ["nan", "inf", "-inf", "abc", ""])
def test_non_finite_or_non_numeric_axis_rejected(client, bad):
    sid = "20261013T224200Z_walking_abc123"
    p = with_row(f"{sid},1000.0,0.0,accelerometer,{bad},-0.98,0.05,walking,")
    assert client.post(URL, json=p).status_code == 422


def test_absurd_axis_value_rejected(client):
    sid = "20261013T224200Z_walking_abc123"
    p = with_row(f"{sid},1000.0,0.0,accelerometer,1e9,-0.98,0.05,walking,")
    assert client.post(URL, json=p).status_code == 422


def test_unknown_sensor_rejected(client):
    sid = "20261013T224200Z_walking_abc123"
    p = with_row(f"{sid},1000.0,0.0,magnetometer,0.1,0.1,0.1,walking,")
    assert client.post(URL, json=p).status_code == 422


def test_wrong_field_count_rejected(client):
    sid = "20261013T224200Z_walking_abc123"
    p = with_row(f"{sid},1000.0,0.0,accelerometer,0.1,0.1")
    assert client.post(URL, json=p).status_code == 422


def test_elapsed_going_backwards_rejected(client):
    sid = "20261013T224200Z_walking_abc123"
    rows = [
        f"{sid},1040.0,40.0,accelerometer,0.1,0.1,0.1,walking,",
        f"{sid},1020.0,20.0,accelerometer,0.1,0.1,0.1,walking,",
        f"{sid},1000.0,0.0,accelerometer,0.1,0.1,0.1,walking,",
    ]
    p = make_payload(
        rows=rows, total_samples=3, accelerometer=sensor_stats(3), gyroscope=sensor_stats(0)
    )
    r = client.post(URL, json=p)
    assert r.status_code == 422 and "backwards" in json.dumps(r.json())


def test_metadata_counts_must_match_csv(client):
    r = client.post(URL, json=make_payload(accelerometer=sensor_stats(99)))
    assert r.status_code == 422 and "does not match" in json.dumps(r.json())


def test_malformed_json_and_missing_fields(client):
    r = client.post(URL, content=b"{not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422
    assert client.post(URL, json={"csv": "x"}).status_code == 422
    assert client.post(URL, json={"metadata": make_payload()["metadata"]}).status_code == 422
    assert client.post(URL, json={**make_payload(), "extra": 1}).status_code == 422


# ---------- path traversal / unsafe writes ----------

@pytest.mark.parametrize(
    "sid",
    [
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "a/b/c/d/e/f/g/h",
        "/absolute/path/name",
        "name with spaces",
        "short",
        "x" * 200,
        "20261013T224200Z_walking_abc123.csv",
        "20261013T224200Z_walking_abc123\x00.csv",
    ],
)
def test_unsafe_session_ids_rejected_and_nothing_written(client, tmp_path, sid):
    p = make_payload(session_id=sid)
    p["csv"] = p["csv"].replace("20261013T224200Z_walking_abc123", sid)
    r = client.post(URL, json=p)
    assert r.status_code == 422
    written = [f for f in tmp_path.rglob("*") if f.is_file()]
    assert written == []


# ---------- size limits ----------

def test_oversized_request_rejected_413(client, monkeypatch):
    monkeypatch.setattr(imu, "MAX_REQUEST_BYTES", 500)
    r = client.post(URL, json=make_payload())
    assert r.status_code == 413


def test_oversized_chunked_request_rejected_413(client, monkeypatch):
    monkeypatch.setattr(imu, "MAX_REQUEST_BYTES", 500)

    def gen():
        yield b'{"metadata": {}, "csv": "'
        yield b"a" * 2000
        yield b'"}'

    r = client.post(URL, content=gen(), headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_too_many_rows_rejected(client, monkeypatch):
    monkeypatch.setattr(imu, "MAX_ROWS", 3)
    assert client.post(URL, json=make_payload()).status_code == 422
