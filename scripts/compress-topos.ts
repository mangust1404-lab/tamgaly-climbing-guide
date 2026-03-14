/**
 * Compress topo photos from public/topos/*.jpg to public/topos/web/*.webp
 * Resizes to max 1600px width, WebP quality 80.
 * Run: npx tsx scripts/compress-topos.ts
 */
import sharp from 'sharp'
import { readdirSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const SRC_DIR = join(import.meta.dirname, '..', 'public', 'topos')
const OUT_DIR = join(SRC_DIR, 'web')

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const MAX_WIDTH = 1600
const QUALITY = 80

const files = readdirSync(SRC_DIR).filter(f => /\.(jpg|jpeg|png)$/i.test(f))

console.log(`Compressing ${files.length} photos...`)

let totalOriginal = 0
let totalCompressed = 0

for (const file of files) {
  const src = join(SRC_DIR, file)
  const outName = file.replace(/\.(jpg|jpeg|png)$/i, '.webp')
  const dst = join(OUT_DIR, outName)

  const info = await sharp(src).metadata()
  const origSize = info.size || 0
  totalOriginal += origSize

  await sharp(src)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(dst)

  const outInfo = await sharp(dst).metadata()
  const outSize = outInfo.size || 0
  totalCompressed += outSize

  const ratio = origSize > 0 ? ((1 - outSize / origSize) * 100).toFixed(0) : '?'
  console.log(`  ${file} → ${outName} (${(origSize / 1024).toFixed(0)}KB → ${(outSize / 1024).toFixed(0)}KB, -${ratio}%)`)
}

console.log(`\nDone! ${(totalOriginal / 1024 / 1024).toFixed(1)}MB → ${(totalCompressed / 1024 / 1024).toFixed(1)}MB`)
