import fs from 'fs'
import path from 'path'

/**
 * Resolve a path that may be workspace-relative.
 *
 * Agents output paths like /complianceflow/docs/file.md or /docs/file.md
 * that are relative to their workspace (session.cwd), not the real filesystem root.
 *
 * Resolution order:
 * 1. The path as-is (already absolute on disk)
 * 2. Relative to cwd (cwd + stripped path)
 * 3. Relative to each immediate subdirectory of cwd
 */
export function resolveWorkspacePath(filePath: string, cwd?: string | null): string | null {
  // 1. Try as-is
  const asIs = path.resolve(/*turbopackIgnore: true*/ filePath)
  if (fs.existsSync(/*turbopackIgnore: true*/ asIs)) return asIs

  if (!cwd) return null

  const stripped = filePath.replace(/^\/+/, '')
  if (!stripped) return null

  // 2. Try relative to cwd
  const fromCwd = path.resolve(/*turbopackIgnore: true*/ cwd, stripped)
  if (fs.existsSync(/*turbopackIgnore: true*/ fromCwd)) return fromCwd

  // 3. Try each immediate subdirectory of cwd (project dirs within workspace)
  try {
    for (const entry of fs.readdirSync(/*turbopackIgnore: true*/ cwd, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const subdir = path.resolve(/*turbopackIgnore: true*/ cwd, entry.name)
      // Direct match: cwd/project/stripped
      const direct = path.resolve(/*turbopackIgnore: true*/ subdir, stripped)
      if (fs.existsSync(/*turbopackIgnore: true*/ direct)) return direct
      // Next.js route match: cwd/project/src/app/stripped (for route paths like /dashboard/compliance)
      const srcApp = path.resolve(/*turbopackIgnore: true*/ subdir, 'src', 'app', stripped)
      if (fs.existsSync(/*turbopackIgnore: true*/ srcApp)) return srcApp
    }
  } catch {
    // cwd doesn't exist or isn't readable
  }

  return null
}
