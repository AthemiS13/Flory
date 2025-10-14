import type { Metadata } from 'next'
import './globals.css'
import { inter } from './fonts'

export const metadata: Metadata = {
  title: 'Flory Dashboard',
  description: 'Smart-Pot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-bg text-fg`}>{children}</body>
    </html>
  )
}
