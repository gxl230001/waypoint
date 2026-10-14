# Waypoint — Development Setup

A mobile navigation assistance MVP for blind and low-vision users.

The current demo includes a React Native mobile app built with Expo and a FastAPI backend. It supports demo navigation controls, basic speech and haptic feedback, labeled IMU data collection (saved as CSV on the phone, optionally uploaded to the backend), and backend health checks.

**Note:** Real route guidance, obstacle detection, and trained IMU model inference are not implemented yet.

## 1. Project Structure

```text
waypoint/
├── apps/
│   └── mobile/          # React Native + Expo app
│       ├── App.tsx
│       ├── app.json
│       ├── .env.example
│       └── src/
│           ├── components/ActionButton.tsx
│           └── imu/         # IMU recording: recorder hook, CSV, storage, upload, UI panel
├── backend/             # FastAPI backend
│   ├── main.py
│   ├── imu.py           # POST /api/v1/imu/recordings
│   ├── tests/           # pytest suite for the upload endpoint
│   ├── requirements.txt
│   └── requirements-dev.txt
├── ml/
│   └── data/
│       ├── raw/         # uploaded recordings (git-ignored, append-only)
│       └── processed/   # your preprocessing output (git-ignored)
└── .gitignore
```

## 2. Prerequisites

Install the following before starting:

- **Node.js:** current supported LTS release
- **npm:** included with Node.js
- **Python:** 3.11 or 3.12
- **Git**
- **Expo Go:** install from the iOS App Store for iPhone testing
- **Expo account:** sign in on both the development computer and Expo Go if prompted

Verify your installations:

```bash
node -v
npm -v
python3 --version
git --version
```

## 3. Clone the Repository

Clone the repository URL shared by the project owner:

```bash
git clone <REPOSITORY_URL>
cd waypoint
```

Replace `<REPOSITORY_URL>` with the actual Git repository URL.

## 4. Set Up the Mobile App

From the repository root:

```bash
cd apps/mobile
npm install
npx expo install
```

Install the Expo packages used by the application:

```bash
npx expo install expo-haptics expo-sensors expo-speech expo-file-system expo-sharing expo-keep-awake
```

`expo-file-system`, `expo-sharing` and `expo-keep-awake` are used by IMU data
collection. The file code uses the `File` / `Directory` / `Paths` API of
`expo-file-system`, which is the default API in Expo SDK 54 and newer. Check
your SDK with `npx expo --version` or the `expo` entry in `package.json`.

### Configure Environment Variables

Create a local environment file:

```bash
cp .env.example .env
```

Edit `apps/mobile/.env` and set the API URL to your own development computer's local network IP address:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:8000
```

For example:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.25:8000
```

Replace the example IP with the actual address of your computer.

On macOS, you can usually find your Wi-Fi IP with:

```bash
ipconfig getifaddr en0
```

**Important:**

- Do not use `localhost` or `127.0.0.1` for the API URL on your iPhone. Those addresses refer to the phone itself.
- Your phone and computer should be on the same reachable Wi-Fi network.
- The computer's firewall must allow incoming connections on port `8000`.
- If your IP address changes, update `.env` and restart Expo.
- Variables prefixed with `EXPO_PUBLIC_` are included in the client bundle. Never put passwords, private API keys, or other secrets in them.
- Keep `.env` local and untracked. Commit `.env.example`, not `.env`.

## 5. Set Up the FastAPI Backend

Open a second terminal window. From the repository root:

```bash
cd backend
```

Create and activate a virtual environment.

**macOS / Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows PowerShell:**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the dependencies:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If `requirements.txt` does not exist in the repository yet, install FastAPI directly:

```bash
pip install "fastapi[standard]"
```

Start the backend:

```bash
fastapi dev main.py --host 0.0.0.0 --port 8000
```

Keep this terminal running while using the mobile application.

### Verify the Backend

Open these URLs on your development computer:

- Health check: http://127.0.0.1:8000/health
- Interactive API documentation: http://127.0.0.1:8000/docs

The health check should return:

```json
{"status": "ok"}
```

## 6. Run the Demo on an iPhone

Open a third terminal window and navigate to the mobile app:

```bash
cd waypoint/apps/mobile
```

Sign in to Expo if necessary:

```bash
npx expo login
```

Start the development server:

```bash
npx expo start --lan
```

Then:

1. Ensure your iPhone and development computer are on the same reachable Wi-Fi network.
2. Open Expo Go on the iPhone.
3. Scan the newly generated QR code.
4. Wait for the app to load.

If the local connection fails, try:

```bash
npx expo start --tunnel
```

The tunnel may help with the Expo development server connection. The FastAPI backend still needs to be reachable from the phone using the configured API URL.

## 7. Demo Features

| Feature | Current behavior |
|---|---|
| Start Demo Navigation | Announces that the demo has started |
| Stop Navigation | Stops the demo and announces that navigation has stopped |
| Activity selector | Chooses the label for the next IMU recording (locked while recording) |
| Start / Stop Recording | Records accelerometer and gyroscope at a 20 ms target interval, then saves a CSV on the phone |
| Share CSV File | Opens the iOS share sheet (Save to Files, AirDrop, ...) |
| Upload to Backend | Optional. Sends one recording to the backend. Never automatic |
| Test Haptic Feedback | Triggers a haptic response |
| Check Backend Connection | Calls the FastAPI `/health` endpoint |
| Read Current Status Aloud | Speaks the latest status message |

See section 8 for the full IMU data collection workflow.

## 8. IMU Data Collection

This collects labeled accelerometer and gyroscope data so you can train your own
activity classifier later. It is an **experimental research tool**. It does not
provide navigation, and nothing here is safety-validated.

Activities: `stationary`, `walking`, `running`, `hazard` (for simulated falls, trips, dropping or tossing the phone).

### Record, export, and (optionally) upload a session

1. Open the app and scroll to **IMU data collection**.
2. Pick an activity. The banner confirms it. It is locked while recording.
3. Tap **Start Recording**. The phone vibrates and says "Recording ... started."
4. Do the activity. The screen is kept awake so auto-lock does not interrupt the
   session. Leave the app in the foreground.
5. Tap **Stop Recording**. The recording is written to the phone and the app
   announces the result. **Last recording** shows `SAVED to this device`, the
   session ID, duration, sample counts, observed sampling rate per sensor, and
   any warnings.
6. Tap **Share CSV File**, then choose **Save to Files** or **AirDrop**, to move
   it to your computer. The file also stays on the phone.
7. Optional: tap **Upload to Backend**. This is the only thing that ever sends
   data to the backend.
8. Pick another activity (or the same one) and record another session. Collect
   many independent sessions per activity.

If saving fails, the screen says `NOT SAVED`, the data stays in memory, and
**Retry Save** is offered. You cannot start a new recording until you save or
explicitly discard it.

### Where files are stored

On the phone, in the app's own document folder under `imu_recordings/`:
`<session_id>.csv`, `<session_id>.meta.json`, and `<session_id>.upload.json`
(only after a successful upload). The app never overwrites or deletes a saved
CSV or metadata file (the only exception is rolling back its own half-written
files if a save fails part-way). The small upload receipt is the one file that
can be rewritten. Under Expo Go this folder is not browsable from the Files app, so use
**Share CSV File** to get recordings off the phone.

On the computer, uploads go to `ml/data/raw/` (override with the
`WAYPOINT_RAW_DATA_DIR` environment variable).

### CSV schema (raw, long format, one row per sensor reading)

| Column | Meaning |
|---|---|
| `session_id` | Unique per recording, e.g. `20261013T224200Z_walking_k3j9x2` |
| `timestamp_ms` | Epoch ms: session start wall clock + `elapsed_ms`. Anchored to one wall-clock reading, so it cannot jump if the clock changes mid-session |
| `elapsed_ms` | Monotonic ms since the session started (`performance.now()`), taken when the JS callback ran. Use this for timing analysis |
| `sensor` | `accelerometer` or `gyroscope` |
| `x`, `y`, `z` | Raw values exactly as `expo-sensors` reports them, not rounded or converted |
| `activity` | One of the four labels |
| `sensor_timestamp_s` | Native event time in seconds (empty if the platform omitted it). Clock since boot, only meaningful as differences. Less affected by JS-thread delays than `elapsed_ms` |

Units: **accelerometer is in g** (1 g = 9.81 m/s², gravity included);
**gyroscope is in rad/s**. Header row included, `\n` line endings, UTF-8.
Rows stay in the order the callbacks arrived, so the two sensors are
interleaved and **asynchronous**. Nothing is merged, resampled, or filled in.
Resample or align them in preprocessing.

Example:

```csv
session_id,timestamp_ms,elapsed_ms,sensor,x,y,z,activity,sensor_timestamp_s
20261013T224200Z_walking_k3j9x2,1791000000012.481,12.481,accelerometer,0.0312,-0.9871,0.1604,walking,41873.204511
20261013T224200Z_walking_k3j9x2,1791000000015.730,15.730,gyroscope,0.0124,-0.0408,0.0097,walking,41873.207102
20261013T224200Z_walking_k3j9x2,1791000000032.855,32.855,accelerometer,0.0405,-0.9922,0.1551,walking,41873.224498
```

`<session_id>.meta.json` holds the activity, start/end time, monotonic
duration, per-sensor sample counts, observed Hz (from callback time and from
the native clock), mean/median interval, largest gap, status
(`completed` or `interrupted`), and warnings.

### Loading it in Python

```python
import pandas as pd

df = pd.read_csv("ml/data/raw/<session_id>.csv")
acc = df[df.sensor == "accelerometer"].sort_values("elapsed_ms")
```

When you split data for training, split by `session_id`, not by window. Windows
from the same session are highly correlated, and splitting them across train and
test inflates accuracy. Plan to trim a few seconds from the start and end of
each session (picking up the phone, putting it in a pocket).

### Data quality behavior

- Every reading is kept. Non-finite values are excluded but counted and reported.
- Observed rates are measured, never assumed. The 20 ms request is a target.
  Android's `expo-sensors` throttles with a strict `>` on a millisecond clock, so
  Android can deliver well under 50 Hz. iPhone is normally close to 50 Hz.
  Check `observed_hz` before trusting a session.
- Warnings are shown for: empty sessions, a sensor with no samples, fewer than
  128 samples (one model window), under 10 seconds, a rate under 40 Hz, and gaps
  over 250 ms.
- If the app moves to the background (for example, the lock button), the session
  ends and is saved as `interrupted` with a warning. iOS pauses sensor delivery
  in the background, so continuing would silently create a gap.
- Samples are held in memory until you stop. If iOS kills the app mid-recording,
  that session is lost. Keep recordings to a few minutes.

### Upload endpoint

`POST /api/v1/imu/recordings` with JSON `{"metadata": {...}, "csv": "<csv text>"}`.

- Validates the activity against the four labels, the exact CSV header, every
  row (finite numbers, plausible range, sensor name, session and activity
  matching the metadata, non-decreasing `elapsed_ms` per sensor), and that the
  metadata counts equal the rows in the file.
- `session_id` must match `^[A-Za-z0-9_-]{8,80}$` and becomes the file name, so a
  client can never choose a path. Files are created exclusively and never
  overwritten.
- Responses: `201` stored, `409` this `session_id` already exists, `413` request
  over 32 MB, `422` validation failed (the `detail` list says why).
- Stored files: `ml/data/raw/<session_id>.csv` (byte-for-byte as uploaded) and
  `<session_id>.meta.json` (includes a SHA-256 of the CSV).

No new backend dependencies are needed. For tests:

```bash
cd backend
pip install -r requirements-dev.txt
pytest -q
```

Mobile unit tests for the CSV and statistics code (no phone needed):

```bash
cd apps/mobile
npx tsx --test src/imu/__tests__/core.test.ts
```

If the CSV format changes, regenerate the backend contract fixture with
`npx tsx src/imu/__tests__/make-fixture.ts`.

## 9. Troubleshooting

### Expo Go says you must sign in

Sign in to Expo on the development computer and in Expo Go. Restart the development server and scan the newly generated QR code.

### The app loads, but the backend says Unavailable

Check the following:

1. FastAPI is running on port `8000`.
2. `apps/mobile/.env` contains the correct computer LAN IP.
3. Your phone can reach your computer over the network.
4. The firewall allows incoming connections on port `8000`.
5. Expo was restarted after editing `.env`.

### Expo cannot connect over Wi-Fi

Try restarting Expo:

```bash
npx expo start --clear --lan
```

If necessary, try the tunnel option:

```bash
npx expo start --tunnel
```

### The IMU recording is interrupted or shows a warning

- Keep the app in the foreground. Locking the phone or switching apps ends the
  session as `interrupted`.
- "Accelerometer averaged N Hz": the platform delivered fewer samples than the
  50 Hz target. Re-record, or account for the real rate in preprocessing.
- "No gyroscope data received yet": the sensor is unavailable or blocked. Restart
  the app and try again.

### Share CSV File does nothing useful, or the file is not where I expect

The share sheet does not report whether you saved or cancelled, so the app only
says it closed. Check Files or your AirDrop destination. The CSV stays on the
phone either way.

### Upload fails

- `Cannot reach the backend`: same checks as "Backend says Unavailable" above.
- `HTTP 422`: the message says which row or field failed validation.
- `HTTP 409`: the backend already has that session. Nothing was overwritten.

### Dependencies are missing

From `apps/mobile/`:

```bash
npm install
npx expo install expo-haptics expo-sensors expo-speech expo-file-system expo-sharing expo-keep-awake
```

From `backend/`, with the virtual environment activated:

```bash
pip install -r requirements.txt
```

### Python virtual environment is not activated

From `backend/` on macOS or Linux:

```bash
source .venv/bin/activate
```

## 10. Development Guidelines

- Keep mobile code under `apps/mobile/`.
- Keep API endpoints and backend logic under `backend/`.
- Keep local environment files and secrets out of Git.
- Update `.env.example` when new environment variables are required.
- Update `requirements.txt` when backend dependencies change.
- Do not commit virtual environments, `node_modules`, personal datasets (`ml/data/` is git-ignored), or generated model files.
- Never edit files in `ml/data/raw/`. Write preprocessing output to `ml/data/processed/`.
- Test changes on a physical iPhone when they depend on device sensors, speech, or haptics.
- Clearly distinguish implemented features from simulated features in the demo.

## 11. Current Development Roadmap

1. ~~Persist and export labeled IMU recordings.~~ Done (see section 8).
2. Build the Python data preprocessing and model training pipeline.
3. Integrate trained model inference on the iPhone.
4. Implement pedestrian map data and route planning.
5. Combine position estimates, route progress, speech, and haptics.
6. Evaluate localization reliability and accessibility in controlled testing.

---

For setup issues, share the terminal error, the command that produced it, and your operating system with the project team. Never share passwords, access tokens, or private credentials.
