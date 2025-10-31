export const metadata = {
  title: 'Flory Uploader',
  description: 'Upload Next.js out/ build to the device SD card (/app) with per-file verification.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', background: '#0b1020', color: '#e7eaf3' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px' }}>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Flory Web App Uploader</h1>
          <p style={{ opacity: 0.8, marginBottom: 24 }}>Upload a compressed out/ folder to your device. Files are sent one-by-one with basic ACK, retries, and timeouts.</p>
          {children}
        </div>
      </body>
    </html>
  )
}
