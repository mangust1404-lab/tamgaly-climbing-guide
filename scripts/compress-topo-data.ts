/**
 * Compress base64 photos inside data/topo-data.json
 * Resizes to max 2000px, JPEG quality 75.
 * Also scales topoRoute SVG coordinates to match new dimensions.
 * Run: npx tsx scripts/compress-topo-data.ts
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const FILE = join(import.meta.dirname, '..', 'data', 'topo-data.json')
const MAX = 2000
const QUALITY = 75

const data = JSON.parse(readFileSync(FILE, 'utf-8'))

let totalBefore = 0
let totalAfter = 0

// Track scale ratios per topo for route coordinate scaling
const scaleMap = new Map<string, { rx: number; ry: number }>()

for (const topo of data.topos) {
  if (!topo.imageUrl?.startsWith('data:image')) continue

  const match = topo.imageUrl.match(/^data:image\/\w+;base64,(.+)$/)
  if (!match) continue

  const buf = Buffer.from(match[1], 'base64')
  totalBefore += buf.length

  const meta = await sharp(buf).metadata()
  const w = meta.width || 0
  const h = meta.height || 0

  let newW = w
  let newH = h
  let resized = sharp(buf)
  if (w > MAX || h > MAX) {
    const ratio = Math.min(MAX / w, MAX / h)
    newW = Math.round(w * ratio)
    newH = Math.round(h * ratio)
    resized = resized.resize(newW, newH)
  }

  const out = await resized.jpeg({ quality: QUALITY }).toBuffer()
  totalAfter += out.length

  topo.imageUrl = `data:image/jpeg;base64,${out.toString('base64')}`

  // Track scale if dimensions changed
  if (newW !== (topo.imageWidth || w) || newH !== (topo.imageHeight || h)) {
    const rx = newW / (topo.imageWidth || w)
    const ry = newH / (topo.imageHeight || h)
    scaleMap.set(topo.id, { rx, ry })
  }

  topo.imageWidth = newW
  topo.imageHeight = newH

  const pct = ((1 - out.length / buf.length) * 100).toFixed(0)
  console.log(`  ${topo.id}: ${(buf.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB (-${pct}%) ${w}x${h} → ${newW}x${newH}`)
}

// Scale topoRoute coordinates to match resized images
if (data.topoRoutes && scaleMap.size > 0) {
  for (const tr of data.topoRoutes) {
    const s = scaleMap.get(tr.topoId)
    if (!s) continue

    if (tr.startX) tr.startX = Math.round(tr.startX * s.rx)
    if (tr.startY) tr.startY = Math.round(tr.startY * s.ry)
    if (tr.anchorX) tr.anchorX = Math.round(tr.anchorX * s.rx)
    if (tr.anchorY) tr.anchorY = Math.round(tr.anchorY * s.ry)

    if (tr.svgPath) {
      tr.svgPath = tr.svgPath.replace(/([0-9.]+),([0-9.]+)/g, (_m: string, x: string, y: string) => {
        return Math.round(parseFloat(x) * s.rx) + ',' + Math.round(parseFloat(y) * s.ry)
      })
    }
    console.log(`  Scaled routes for ${tr.id}`)
  }
}

// Also compress sectorCovers
if (data.sectorCovers) {
  for (const [key, url] of Object.entries(data.sectorCovers)) {
    if (!(url as string).startsWith('data:image')) continue
    const match = (url as string).match(/^data:image\/\w+;base64,(.+)$/)
    if (!match) continue

    const buf = Buffer.from(match[1], 'base64')
    const meta = await sharp(buf).metadata()
    const w = meta.width || 0
    const h = meta.height || 0

    let resized = sharp(buf)
    if (w > MAX || h > MAX) {
      const ratio = Math.min(MAX / w, MAX / h)
      resized = resized.resize(Math.round(w * ratio), Math.round(h * ratio))
    }

    const out = await resized.jpeg({ quality: QUALITY }).toBuffer()
    data.sectorCovers[key] = `data:image/jpeg;base64,${out.toString('base64')}`
    console.log(`  cover ${key}: ${(buf.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB`)
  }
}

writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8')

const fileSizeMB = (readFileSync(FILE).length / 1024 / 1024).toFixed(1)
console.log(`\nPhotos: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024 / 1024).toFixed(1)}MB`)
console.log(`File size: ${fileSizeMB}MB`)
