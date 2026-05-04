#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePng = path.join(repoRoot, 'public', 'branding', 'swarmclaw-org-avatar.png')
const outDir = path.join(repoRoot, 'resources')
const outIcns = path.join(outDir, 'icon.icns')
const outIco = path.join(outDir, 'icon.ico')
const outPng = path.join(outDir, 'icon.png')

if (!fs.existsSync(sourcePng)) {
  console.error(`[gen-icons] missing source ${sourcePng}`)
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

function requireCmd(cmd) {
  const probe = spawnSync('which', [cmd])
  if (probe.status !== 0) {
    console.error(`[gen-icons] ${cmd} not found on PATH. Run this script on macOS with Xcode command line tools installed.`)
    process.exit(1)
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`[gen-icons] ${cmd} ${args.join(' ')} failed`)
    process.exit(r.status ?? 1)
  }
}

if (process.platform !== 'darwin') {
  console.error('[gen-icons] this script requires macOS (uses sips + iconutil). Run it on a Mac and commit the generated files.')
  process.exit(1)
}

requireCmd('sips')
requireCmd('iconutil')

console.log(`[gen-icons] source: ${sourcePng}`)

fs.copyFileSync(sourcePng, outPng)
console.log(`[gen-icons] wrote ${outPng}`)

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmclaw-iconset-'))
const iconset = path.join(scratch, 'icon.iconset')
fs.mkdirSync(iconset)

const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
]
for (const { name, size } of sizes) {
  const dest = path.join(iconset, name)
  run('sips', ['-z', String(size), String(size), sourcePng, '--out', dest])
}
run('iconutil', ['-c', 'icns', iconset, '-o', outIcns])
fs.rmSync(scratch, { recursive: true, force: true })
console.log(`[gen-icons] wrote ${outIcns}`)

const pngToIco = await import('png-to-ico').then((m) => m.default ?? m).catch(() => null)
if (!pngToIco) {
  console.error('[gen-icons] png-to-ico not installed. Run `npm i -D png-to-ico` and rerun.')
  process.exit(1)
}

const icoScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmclaw-ico-'))
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoInputs = []
for (const size of icoSizes) {
  const dest = path.join(icoScratch, `icon-${size}.png`)
  run('sips', ['-z', String(size), String(size), sourcePng, '--out', dest])
  icoInputs.push(dest)
}
const icoBuf = await pngToIco(icoInputs)
fs.writeFileSync(outIco, icoBuf)
fs.rmSync(icoScratch, { recursive: true, force: true })
console.log(`[gen-icons] wrote ${outIco}`)

console.log('[gen-icons] done.')
