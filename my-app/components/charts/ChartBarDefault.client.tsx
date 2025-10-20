"use client"
import React from 'react'
import Card from '../Card'
import BarInner from './_BarInner'

export default function ChartBarDefault({className = ''}:{className?:string}){
  return (
    <Card className={className} center={false}>
      <BarInner />
    </Card>
  )
}
