"use client"
import React from 'react'
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  { month: 'Jan', value: 186 },
  { month: 'Feb', value: 305 },
  { month: 'Mar', value: 237 },
  { month: 'Apr', value: 73 },
  { month: 'May', value: 209 },
  { month: 'Jun', value: 214 },
]

export default function BarInner(){
  return (
    <div style={{width:'100%'}}>
      <div style={{display:'flex',justifyContent:'flex-start',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:13,color:'var(--muted)'}}>Pump ON last 7 days</div>
      </div>
      <div style={{height:140}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid vertical={false} strokeOpacity={0.06} />
            <XAxis dataKey="month" tick={{fill:'var(--muted)'}} axisLine={false} tickLine={false} />
            <Tooltip cursor={false} contentStyle={{background:'var(--card)',border:'1px solid var(--card-stroke)'}} itemStyle={{color:'var(--fg)'}}/>
            <Bar dataKey="value" fill="var(--graph-1)" radius={[8,8,8,8]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
