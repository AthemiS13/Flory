# Flory Uploader

A minimal Next.js app to upload your exported `out/` folder to the device SD card (`/app`).

- Drag-and-drop the `out` folder, or click “Select out folder” and pick it
- Uploads files sequentially to `/sd/upload` using multipart/form-data
- Waits for an ACK per file (HTTP 200) and retries on failure
- Configurable delay between files and request timeouts
- Optional wipe of `/app` before upload via `/sd/wipe?force=1`
- Device URL is fixed to `http://flory.local`
- Automatically wipes `/app` at start and restarts device after a successful full upload

## Quick start

1. Build your main app (in `my-app/`) and export to `out/`.
2. In this folder (`uploader-app/`):

```bash
npm install
npm run dev
```

3. Open the uploader in your browser, drag-and-drop the `out/` folder (or click “Select out folder”), and click Start Upload.

Notes:
- If your folder selection or drop doesn’t have `out/` at the root, keep the “Ensure paths prefixed with out/” option enabled and the uploader will add it.
- The device must expose these endpoints:
  - `POST /sd/upload` – receives a single file via multipart (field name `file`, filename includes relative path)
  - `POST /sd/wipe?force=1` – wipes the `/app` directory contents

## Verification and reliability

- Each file is sent in its own HTTP POST and considered successful only on HTTP 200.
- If a request times out or fails, it is retried up to N times with a small backoff.
- A small delay between files helps the ESP32 flush SD writes.

For deeper verification (e.g., size checks), we can extend the firmware to include a JSON body like `{ ok: true, path: "...", size: <bytes> }` and optionally expose a `HEAD /sd/file?path=...` to query stored size. For now, HTTP 200 is used as the basic ACK.
