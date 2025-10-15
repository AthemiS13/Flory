"use client"

import React from 'react'
import Card from '../Card'
import { RadialBarChart, RadialBar, PolarRadiusAxis, Tooltip, Label } from 'recharts'

const chartData = [{ month: 'january', desktop: 1260, mobile: 570 }]

export default function ChartRadialStacked({className = '', title = 'Water Level'}:{className?:string, title?:string}){
  const total = chartData[0].desktop + chartData[0].mobile
  return (
    <Card className={className}>
      <div style={{height:160,width:220,marginTop:8}}>
        <RadialBarChart width={220} height={160} cx="50%" cy="100%" innerRadius={40} outerRadius={80} data={chartData} startAngle={180} endAngle={0}>
          <Tooltip cursor={false} contentStyle={{background:'var(--card)',border:'1px solid var(--card-stroke)'}} itemStyle={{color:'var(--fg)'}}/>
          <PolarRadiusAxis tick={false} axisLine={false} tickLine={false}>
            <Label
              content={({ viewBox }) => {
                if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 16}
                        style={{ fontWeight: 700, fontSize: 18, fill: 'var(--fg)' }}
                      >
                        {total.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 4}
                        style={{ fill: 'var(--muted)' }}
                      >
                        {title}
                      </tspan>
                    </text>
                  )
                }
                return null
              }}
            />
          </PolarRadiusAxis>
          <RadialBar dataKey="desktop" fill="var(--graph-1)" isAnimationActive={false} className="stroke-transparent stroke-2" />
          <RadialBar dataKey="mobile" fill="var(--graph-2)" isAnimationActive={false} className="stroke-transparent stroke-2" />
        </RadialBarChart>
      </div>
    </Card>
  )
}
