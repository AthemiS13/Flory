Emergency SD drag-and-drop — short instructions for web devs

Follow these short, explicit steps when you need to push a new web build to the device. This is an emergency, destructive feature: it wipes everything under `/app` on the SD card and writes the dropped files. Use only when necessary.

- Prepare the build
  - Build your site locally (the final files you want on the device).
  - Put the exact files and folders you want served into a single upload operation; the uploader will recreate folder structure on the SD.

- Use the web uploader (drag & drop)
  - Open the device’s web uploader page in a browser.
  - Drag-and-drop the output files and folders (for example `index.html`, `_next/`, static assets) into the upload area.
  - Ensure you drop everything at once so the server receives all files in the same upload session.

- What the uploader does
  - On the first file received, the device will wipe all existing contents under `/app` (it keeps the `/app` folder itself).
  - Then it writes each uploaded file to the SD using the same relative paths you dropped.
  - The operation is streaming — files are written as they arrive.

- After the upload
  - Wait for the upload to finish and the server to respond (success message).
  - Refresh the device’s site (e.g., visit the device IP) to verify the new site is served.

- Important warnings
  - This is destructive: all previous files under `/app` will be removed. Don’t use casually.
  - If upload fails partway, `/app` may be left partially populated; re-upload to replace.
  - There is no handshake or atomic swap — it’s an emergency quick-replace only.
  - Ensure you upload the correct files (including any `_next` folder and assets) in one go.

- Troubleshooting tips
  - If pages 404 after upload, confirm `index.html` is present at the root of `/app` (or that your routes exist).
  - If assets are missing, re-run the drag-and-drop and make sure you include the `_next` folder and any static folders.
  - If behavior is inconsistent, retry the upload once; a second complete upload usually fixes partial writes.

If you want, I can convert these into a one-page README or add a short warning banner in the uploader UI. Which would you prefer?
