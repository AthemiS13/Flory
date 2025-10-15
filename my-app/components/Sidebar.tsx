"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const icons = [
  { src: '/dashboard.svg', alt: 'dashboard', route: '/', key: 'dashboard' },
  { src: '/settings.svg', alt: 'settings', route: '/settings', key: 'settings' },
  { src: '/calibration.svg', alt: 'calib', route: '/calibration', key: 'calib' },
  { src: '/files.svg', alt: 'files', route: '/files', key: 'files' },
]

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="sidebar" style={{paddingTop:20, paddingBottom:20, justifyContent:'center'}}>
      <div style={{display:'flex',flexDirection:'column',gap:22,alignItems:'center'}}>
        {icons.map(icon => (
          <Link
            key={icon.key}
            href={icon.route}
            aria-label={icon.alt}
            data-route={icon.route}
            className={`round-btn ${pathname === icon.route ? 'active' : ''}`}
            style={{
              width:56,
              height:56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 120ms ease, border 120ms ease, background 120ms ease',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
            onClick={() => console.debug('nav click', icon.route)}
          >
            <img src={icon.src} alt={icon.alt} width={24} height={24} />
          </Link>
        ))}
      </div>
    </aside>
  )
}
