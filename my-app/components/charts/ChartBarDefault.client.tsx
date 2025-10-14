"use client"
import React, { Suspense } from 'react'
import Card from '../Card'

const Bar = React.lazy(() => import('./_BarInner'))

export default function ChartBarDefault({className = ''}:{className?:string}){
  return (
    <Card className={className} center={false}>
      <Suspense fallback={<div style={{height:140}} />}>
        <Bar />
      </Suspense>
    </Card>
  )
}
