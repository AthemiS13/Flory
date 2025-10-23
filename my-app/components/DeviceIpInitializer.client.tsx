"use client"

import { useEffect } from 'react'
import api from '../lib/api'

// A small initializer that sets the device base URL for the API client on page load.
// It prefers (in order): localStorage 'DEVICE_BASE_URL', NEXT_PUBLIC_DEVICE_BASE_URL env var.
// You can still override later with api.setDeviceBaseUrl(...).
export default function DeviceIpInitializer() {
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('DEVICE_BASE_URL') : null
      // Prefer explicit stored override. If none, default to the mDNS name
      // only when the page is served over HTTP or on localhost to avoid
      // mixed-content errors when the UI is served over HTTPS. Otherwise
      // leave the base unset so relative paths (and dev proxy) are used.
      let base: string | null = stored || null
      try {
        if (!base && typeof window !== 'undefined') {
          const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          const isHttp = window.location.protocol === 'http:'
          if (isLocalhost || isHttp) base = 'http://flory.local'
        }
      } catch (e) {}
      if (base) {
        try { console.debug('[DeviceIpInitializer] setting base ->', base) } catch (e) {}
        api.setDeviceBaseUrl(base)
        // keep in localStorage so reloads also pick it up
        try { localStorage.setItem('DEVICE_BASE_URL', base) } catch (e) {}
      }
      // quick probe: attempt a single status fetch so we see network activity in console
      try {
        api.getStatus().then(s => {
          try { console.debug('[DeviceIpInitializer] probe status success', s) } catch (e) {}
        }).catch(err => {
          try { console.warn('[DeviceIpInitializer] probe status failed', err) } catch (e) {}
        })
      } catch (e) {
        try { console.warn('[DeviceIpInitializer] probe failed sync', e) } catch (e) {}
      }
    } catch (e) {
      // swallow — initializer must not break the app
      // console.warn('DeviceIpInitializer failed', e)
    }
  }, [])

  return null
}
