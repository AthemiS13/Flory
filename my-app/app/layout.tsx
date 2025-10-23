import type { Metadata } from 'next'
import './globals.css'
import { inter } from './fonts'

export const metadata: Metadata = {
  title: 'Flory Dashboard',
  description: 'Smart-Pot dashboard',
}

import Sidebar from '../components/Sidebar';
import DeviceIpInitializer from '../components/DeviceIpInitializer.client'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-bg text-fg`}>
        <DeviceIpInitializer />
        <div className="container-dashboard">
          <Sidebar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
