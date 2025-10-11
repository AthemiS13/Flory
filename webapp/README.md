This folder contains a minimal Next.js app scaffold you can build and export as static files to serve from the ESP SD card.

Quick start (macOS):

1. Install dependencies

   cd webapp
   npm install

2. Build and export static files

   npm run build
   npm run export

   This produces an `out/` directory containing static HTML/CSS/JS.

3. Copy exported files onto the SD card root (index.html will be at `/index.html`):

   # assuming /Volumes/ESP is where your SD mounts
   cp -R out/* /Volumes/ESP/

Notes
- This scaffold uses the pages router for static export compatibility.
- For shadcn components, you can copy their style patterns into `components/` here. The minimal scaffold includes a simple Button and Card component.
- The exported site is client-side JS + static HTML. The ESP's static server will serve these files from the SD card.
