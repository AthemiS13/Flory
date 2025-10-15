"use client"
import React from 'react'
import { AreaChart, Area, CartesianGrid, XAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const chartData = [
  { date: 'Wed 1', soil: 20, water: 40 },
  { date: 'Thu 2', soil: 22, water: 45 },
  { date: 'Fri 3', soil: 18, water: 50 },
  { date: 'Sat 4', soil: 24, water: 55 },
  { date: 'Sun 5', soil: 19, water: 60 },
  { date: 'Mon 1', soil: 23, water: 58 },
  { date: 'Tue 2', soil: 21, water: 62 },
]

export default function AreaInner({title = 'Soil Moisture and Water Levels in Time'}:{title?:string}){
  return (
  <div style={{width:'100%'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:14,color:'var(--muted)'}}>{title}</div>
        <select style={{background:'transparent',color:'var(--muted)',borderRadius:10,border:'1px solid rgba(255,255,255,0.04)',padding:6}}>
          <option>Last Week</option>
        </select>
      </div>
      <div style={{height:200}}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{left:10,right:10,top:10,bottom:20}}>
            <defs>
              <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--graph-1)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--graph-1)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--graph-2)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--graph-2)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.06} />
            <XAxis dataKey="date" tick={{fill:'var(--muted)'}} axisLine={false} tickLine={false} interval={0} />
            <Tooltip contentStyle={{background:'var(--card)',border:'1px solid var(--card-stroke)'}} itemStyle={{color:'var(--fg)'}}/>
            <Legend verticalAlign="bottom" align="left" wrapperStyle={{bottom:-6,left:8}} formatter={(value) => value === 'soil' ? 'Soil Moisture' : 'Water level'} />
            <Area dataKey="soil" stroke="var(--graph-1)" fill="url(#g1)" type="natural" />
            <Area dataKey="water" stroke="var(--graph-2)" fill="url(#g2)" type="natural" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
