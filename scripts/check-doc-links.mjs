import { readdir, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const ignored = new Set([
  '.git',
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  '.agents',
  '.aws',
  '.codex',
])
async function* markdownFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* markdownFiles(file)
    else if (entry.isFile() && entry.name.endsWith('.md')) yield file
  }
}
let checked = 0
const failures = []
for await (const file of markdownFiles(root)) {
  const text = await readFile(file, 'utf8')
  // Check local Markdown links and quoted HTML src/href values. Remote URLs and anchors are excluded.
  const links = [
    ...text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)|(?:src|href)="([^"]+)"/g),
  ]
  for (const link of links) {
    const target = link[1] ?? link[2]
    if (/^(?:[a-z]+:|#|\/\/)/i.test(target)) continue
    const local = decodeURIComponent(target.split(/[?#]/)[0])
    if (!local) continue
    const resolved = path.resolve(path.dirname(file), local)
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
      failures.push(`${path.relative(root, file)}: link escapes repository: ${target}`)
      continue
    }
    try {
      await access(resolved)
      checked++
    } catch {
      failures.push(`${path.relative(root, file)}: missing ${target}`)
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else
  console.log(
    `Verified ${checked} local documentation links. Remote URLs and fragment targets are not checked.`,
  )
