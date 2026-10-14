# Contracts

Shared definitions that more than one part of the project depends on. A change
here can break the mobile app, the backend, or the ML pipeline, so:

- Change these files in their own small pull request.
- Get review from the owner of every side that consumes the contract.
- Update every implementation in the same PR, or in a PR that lands right after.

| Contract | Producer | Consumers |
|---|---|---|
| [`imu_session.md`](imu_session.md) | `apps/mobile/src/imu/` | `backend/routers/imu.py`, `ml/` |
