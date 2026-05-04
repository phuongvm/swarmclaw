import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

export async function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get('path')
  const targetDir = rawPath || path.join(os.homedir(), 'Dev')

  // Resolve ~ to home dir
  const resolved = targetDir.startsWith('~')
    ? path.join(/*turbopackIgnore: true*/ os.homedir(), targetDir.slice(1))
    : path.resolve(/*turbopackIgnore: true*/ targetDir)

  let dirs: Array<{ name: string; path: string }> = []
  try {
    dirs = fs.readdirSync(/*turbopackIgnore: true*/ resolved)
      .filter(d => {
        if (d.startsWith('.')) return false
        try {
          const childPath = path.join(/*turbopackIgnore: true*/ resolved, d)
          return fs.statSync(/*turbopackIgnore: true*/ childPath).isDirectory()
        } catch { return false }
      })
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(d => ({ name: d, path: path.join(/*turbopackIgnore: true*/ resolved, d) }))
  } catch {}

  const parentPath = resolved === '/' ? null : path.dirname(resolved)

  return NextResponse.json({ dirs, currentPath: resolved, parentPath })
}
