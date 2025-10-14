"use client"
import React from 'react'

export default function Gauge({value=20}:{value?:number}){
  const angle = (value/100) * 180
  const transform = `rotate(${angle - 90} 50 50)`
  return (
    <div style={{width:180,height:120,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column'}}>
      <svg viewBox="0 0 100 60" width={140} height={80}>
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--graph-1)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--graph-1)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path d="M10,50 A40,40 0 0,1 90,50" stroke="var(--graph-2)" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d="M10,50 A40,40 0 0,1 90,50" stroke="url(#g)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="251" strokeDashoffset={`${251 - (251*(value/100))}`} />
        <text x="50" y="39" textAnchor="middle" fill="var(--fg)" fontSize="12" fontWeight={700}>{value}%</text>
      </svg>
      <div style={{textAlign:'center', marginTop:-6}}>
        <div style={{color:'var(--muted)',fontSize:12}}>Soil Moisture</div>
      </div>
    </div>
  )
}
