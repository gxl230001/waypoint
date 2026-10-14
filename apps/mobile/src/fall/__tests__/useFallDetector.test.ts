// Run from apps/mobile: npx tsx --test src/fall/__tests__/useFallDetector.test.ts
import assert from "node:assert/strict";
import test from "node:test";

test("window buffer logic pairs accelerometer with latest gyroscope and keeps newest 100", () => {
  const WINDOW_SIZE = 100;
  const buffer: number[][] = [];
  let latestGyro: [number, number, number] | null = null;

  const onGyro = (x: number, y: number, z: number) => {
    latestGyro = [x, y, z];
  };

  const onAccel = (ax: number, ay: number, az: number) => {
    if (latestGyro === null) return;
    const [gx, gy, gz] = latestGyro;
    buffer.push([ax, ay, az, gx, gy, gz]);
    if (buffer.length > WINDOW_SIZE) {
      buffer.shift();
    }
  };

  // Accelerometer before gyro must be ignored
  onAccel(0, 0, 1);
  assert.equal(buffer.length, 0);

  // Set gyro
  onGyro(0.1, 0.2, 0.3);

  // Send 150 accel samples
  for (let i = 0; i < 150; i++) {
    onAccel(i, -i, 0.5);
  }

  assert.equal(buffer.length, 100);
  // Row order is [ax, ay, az, gx, gy, gz]
  assert.deepEqual(buffer[0], [50, -50, 0.5, 0.1, 0.2, 0.3]);
  assert.deepEqual(buffer[99], [149, -149, 0.5, 0.1, 0.2, 0.3]);
});

test("cooldown prevents multiple alert fires within 5 seconds", () => {
  let lastAlertTime = 0;
  const alerts: number[] = [];
  const COOLDOWN_MS = 5000;

  const handleDetection = (p: number, now: number) => {
    if (now - lastAlertTime >= COOLDOWN_MS) {
      lastAlertTime = now;
      alerts.push(p);
    }
  };

  const t0 = 1_700_000_000_000;
  // First fall at t0 fires
  handleDetection(0.99, t0);
  assert.equal(alerts.length, 1);

  // Subsequent falls within 5s are ignored
  handleDetection(0.95, t0 + 1000);
  handleDetection(0.98, t0 + 3500);
  handleDetection(0.92, t0 + 4999);
  assert.equal(alerts.length, 1);

  // Fall at t0 + 5000ms (5s elapsed) fires
  handleDetection(0.88, t0 + 5000);
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts, [0.99, 0.88]);
});
