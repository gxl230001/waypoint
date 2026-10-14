# Waypoint — Development Setup

A mobile navigation assistance MVP for blind and low-vision users.

The current demo includes a React Native mobile app built with Expo and a FastAPI backend. It supports demo navigation controls, basic speech and haptic feedback, live IMU sensor recording, and backend health checks.

**Note:** Real route guidance, obstacle detection, and trained IMU model inference are not implemented yet.

## 1. Project Structure

```text
blind-nav/
├── apps/
│   └── mobile/          # React Native + Expo app
│       ├── App.tsx
│       ├── app.json
│       └── .env.example
├── backend/             # FastAPI backend
│   ├── main.py
│   └── requirements.txt
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
cd blind-nav
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
npx expo install expo-haptics expo-sensors expo-speech
```

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
cd blind-nav/apps/mobile
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
| Start Sensor Recording | Collects accelerometer and gyroscope readings in memory |
| Stop Sensor Recording | Stops recording and displays the sample count |
| Test Haptic Feedback | Triggers a haptic response |
| Check Backend Connection | Calls the FastAPI `/health` endpoint |
| Read Current Status Aloud | Speaks the latest status message |

**Sensor data is temporary.** Recordings are held in memory and printed to the mobile JavaScript console when recording stops. They are not currently saved to files or uploaded to the backend.

## 8. Troubleshooting

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

### Dependencies are missing

From `apps/mobile/`:

```bash
npm install
npx expo install expo-haptics expo-sensors expo-speech
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

## 9. Development Guidelines

- Keep mobile code under `apps/mobile/`.
- Keep API endpoints and backend logic under `backend/`.
- Keep local environment files and secrets out of Git.
- Update `.env.example` when new environment variables are required.
- Update `requirements.txt` when backend dependencies change.
- Do not commit virtual environments, `node_modules`, personal datasets, or generated model files.
- Test changes on a physical iPhone when they depend on device sensors, speech, or haptics.
- Clearly distinguish implemented features from simulated features in the demo.

## 10. Current Development Roadmap

1. Persist and export labeled IMU recordings.
2. Build the Python data preprocessing and model training pipeline.
3. Integrate trained model inference on the iPhone.
4. Implement pedestrian map data and route planning.
5. Combine position estimates, route progress, speech, and haptics.
6. Evaluate localization reliability and accessibility in controlled testing.

---

For setup issues, share the terminal error, the command that produced it, and your operating system with the project team. Never share passwords, access tokens, or private credentials.
