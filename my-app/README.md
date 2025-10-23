This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Testing against a real device

The frontend talks to the device HTTP endpoints (for example `http://DEVICE_IP/api/status`). By default the client uses relative paths (`/api/...`). For local development or testing against a device at a fixed IP you have two easy options:

1) Environment variable (build-time)

Set NEXT_PUBLIC_DEVICE_BASE_URL when starting dev or building. Example:

```bash
# macOS / zsh
# Use the mDNS name provided by the device (requires the device advertising mDNS as flory.local)
NEXT_PUBLIC_DEVICE_BASE_URL="http://flory.local" npm run dev
```

2) Runtime override (browser)

Open the browser DevTools console and run:

```js
// set for this session and store in localStorage (use mDNS name)
localStorage.setItem('DEVICE_BASE_URL', 'http://flory.local')
// or via the API helper (if imported in client code)
import api from './lib/api'
api.setDeviceBaseUrl('http://flory.local')
```

Notes:
- The code will strip trailing slashes from the base URL.
- If you run the UI from a different origin you may need to enable CORS on the device or run a proxy to avoid cross-origin issues.
