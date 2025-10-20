"use client"
import React from 'react'
import Card from '../Card'
import AreaInner from './_AreaInner'

export default function ChartAreaInteractive({className = '', title='Soil Moisture and Water Levels in Time'}:{className?:string, title?:string}){
  return (
    <Card className={`card-large ${className}`} center={false}>
      <AreaInner title={title} />
    </Card>
  )
}
