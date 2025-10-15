"use client"

import React from 'react'
import { RadialBarChart, RadialBar, PolarRadiusAxis } from 'recharts'

const chartData = [{ month: 'january', desktop: 1260, mobile: 570 }]

export default function RadialInner({title = 'Water Level'}:{title?:string}){
  const total = chartData[0].desktop + chartData[0].mobile
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
      <div style={{fontWeight:700,color:'var(--fg)'}}>{total.toLocaleString()}</div>
      <div style={{color:'var(--muted)'}}>{title}</div>
      <div style={{height:160,width:220,marginTop:8}}>
        <RadialBarChart width={220} height={160} cx="50%" cy="100%" innerRadius={40} outerRadius={80} data={chartData} startAngle={180} endAngle={0}>
          <PolarRadiusAxis tick={false} axisLine={false} />
          <RadialBar dataKey="desktop" fill="var(--graph-1)" />
          <RadialBar dataKey="mobile" fill="var(--graph-2)" />
        </RadialBarChart>
      </div>
    </div>
  )
}
