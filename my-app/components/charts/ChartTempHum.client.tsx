"use client"
import React from 'react'
import Card from '../Card'
import TempHumInner from './_TempHumInner'

export default function ChartTempHum({className = '', title='Temperature and Humidity in Time'}:{className?:string, title?:string}){
  return (
    <Card className={`card-large ${className}`} center={false}>
      <TempHumInner title={title} />
    </Card>
  )
}
