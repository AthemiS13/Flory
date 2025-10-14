"use client"
import React, { Suspense } from 'react'
import Card from '../Card'

const Area = React.lazy(() => import('./_AreaInner'))

export default function ChartAreaInteractive({className = '', title='Soil Moisture and Water Levels in Time'}:{className?:string, title?:string}){
  return (
    <Card className={`card-large ${className}`} center={false}>
      <Suspense fallback={<div style={{height:180}} />}> 
        <Area />
      </Suspense>
    </Card>
  )
}
