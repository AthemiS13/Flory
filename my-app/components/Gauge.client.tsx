"use client"
import React from 'react'

export default function Gauge({value=20}:{value?:number}){
  const angle = (value/100) * 180
  const transform = `rotate(${angle - 90} 50 50)`
  return (
    <div style={{width:180,height:120,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column'}}>
      {/* SVG made larger while container stays the same */}
      <svg viewBox="0 0 100 60" width={180} height={120}>
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--graph-1)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--graph-1)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path d="M10,50 A40,40 0 0,1 90,50" stroke="var(--graph-2)" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d="M10,50 A40,40 0 0,1 90,50" stroke="url(#g)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="251" strokeDashoffset={`${251 - (251*(value/100))}`} />
        <text x="50" y="40" textAnchor="middle" fill="var(--fg)" fontSize="14" fontWeight={700}>{value}%</text>
        <text x="50" y="52" textAnchor="middle" fill="var(--muted)" fontSize={7}>Soil Moisture</text>
      </svg>
    </div>
  )
}
