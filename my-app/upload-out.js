#!/usr/bin/env node
// upload-out.js
// Upload the entire `out` directory to the device's /sd/upload endpoint as individual POST requests.
// Usage: node upload-out.js [--host http://flory.local]

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const FormData = require('form-data')
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); // Dynamically import node-fetch

const DEFAULT_HOST = 'http://flory.local'
const UPLOAD_DELAY = 500; // Delay in milliseconds between uploads

function walk(dir, base) {
  const files = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      files.push(...walk(full, base))
    } else {
      files.push({ full, rel: path.relative(base, full).replace(/\\/g, '/') })
    }
  }
  return files
}

function calculateMD5(filePath) {
  const hash = crypto.createHash('md5')
  const fileBuffer = fs.readFileSync(filePath)
  hash.update(fileBuffer)
  return hash.digest('hex')
}

async function uploadFile(host, file) {
  const form = new FormData()
  const fileStream = fs.createReadStream(file.full)
  const md5Checksum = calculateMD5(file.full)
  form.append('file', fileStream, file.rel)
  console.log(`Uploading ${file.rel} (MD5: ${md5Checksum})`)

  const url = `${host.replace(/\/$/, '')}/sd/upload`
  try {
    const headers = form.getHeaders()
    const res = await fetch(url, { method: 'POST', body: form, headers })
    const text = await res.text()
    console.log(`Response for ${file.rel}:`, res.status, text)
  } catch (err) {
    console.error(`Upload failed for ${file.rel}:`, err.message)
  }
}

async function main() {
  const args = process.argv.slice(2)
  let host = DEFAULT_HOST
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i+1]) { host = args[i+1]; i++ }
  }
  const outDir = path.join(__dirname, 'out')
  if (!fs.existsSync(outDir)) {
    console.error('out directory not found. Run `npm run build` in my-app first')
    process.exit(1)
  }
  const files = walk(outDir, outDir)
  if (files.length === 0) {
    console.error('no files found in out/')
    process.exit(1)
  }

  for (const file of files) {
    await uploadFile(host, file)
    await new Promise(resolve => setTimeout(resolve, UPLOAD_DELAY)) // Add delay between uploads
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
