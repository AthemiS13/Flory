import Head from 'next/head'
import Button from '../src/components/Button'
import Card from '../src/components/Card'

export default function Home() {
  return (
    <>
      <Head>
        <title>SmartPot — Next.js SD</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{padding:20,fontFamily:'Inter, system-ui, -apple-system, Roboto'}}>
        <h1>SmartPot (Next.js export)</h1>
        <Card>
          <p>This is a static export built with Next.js. Place the contents of the `out/` folder onto your SD card root.</p>
          <div style={{marginTop:12}}>
            <Button onClick={() => fetch('/api/status').then(r=>r.json()).then(j=>alert(JSON.stringify(j)))}>Get Status</Button>
          </div>
        </Card>
      </main>
    </>
  )
}
