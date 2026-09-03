#!/usr/bin/env bun
/**
 * Build the public reference repo from a filtered export of this one.
 *
 * The public repo is the open-source source the Chrome Web Store listing and
 * the verifieddit.com announcement point at. It is not a GitHub fork: a fork
 * would carry this repo's full history, internal docs included. Instead this
 * script takes one commit of this repo, keeps only the paths admitted by
 * .public-export-include, and writes them into a fresh tree. That tree is
 * verified with the same gate CI runs here, then committed to the public repo
 * as one sync commit that names the source SHA.
 *
 * The include file is an allowlist on purpose. Anything not listed stays
 * private, so a doc added tomorrow cannot leak by default.
 *
 * README.public.md in this repo becomes README.md in the export; the private
 * README stays here for contributors working with the full tree.
 *
 * Usage:
 *   bun scripts/export-public.ts --out <dir> [--ref HEAD] [--verify]
 *       [--push <owner/repo> [--create]] [--dry-run]
 *
 *   --out      Directory to write the filtered tree into (emptied first).
 *   --ref      Git ref to export. Defaults to HEAD. Only tracked files at that
 *              ref are exported; working-tree changes never leak.
 *   --verify   Run the CI gate in the export: bun install --frozen-lockfile,
 *              bun run build, bun test test/*.test.ts.
 *   --push     Sync the export into <owner/repo>. Clones the public repo,
 *              replaces its tree, commits "chore: sync from <sha>", pushes.
 *   --create   With --push: create <owner/repo> as a public repo first.
 *   --dry-run  List what would be exported and what would not, then stop.
 */
import { Glob } from 'bun'
import { mkdir, rm, writeFile, chmod, readdir, cp } from 'node:fs/promises'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dir, '..')
const INCLUDE_FILE = '.public-export-include'
const PUBLIC_README = 'README.public.md'
const SOURCE_REPO = 'Sanmarcsoft/verifieddit-extension'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string) => process.argv.includes(name)

async function git(args: string[], cwd = REPO_ROOT, binary = false): Promise<string | Uint8Array> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([
    binary ? new Response(proc.stdout).arrayBuffer() : new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ])
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed (${code}): ${err.trim()}`)
  return binary ? new Uint8Array(out as ArrayBuffer) : (out as string)
}

async function run(cmd: string[], cwd: string): Promise<void> {
  console.log(`\n$ ${cmd.join(' ')}   (in ${cwd})`)
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  const code = await proc.exited
  if (code !== 0) throw new Error(`${cmd.join(' ')} exited ${code}`)
}

interface Patterns {
  include: Glob[]
  exclude: Glob[]
}

// Lines starting with "!" carve exceptions out of an include, for the odd
// file inside an admitted directory that must not ship.
function loadPatterns(text: string): Patterns {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  return {
    include: lines.filter((l) => !l.startsWith('!')).map((p) => new Glob(p)),
    exclude: lines.filter((l) => l.startsWith('!')).map((p) => new Glob(p.slice(1)))
  }
}

function admitted(p: string, patterns: Patterns): boolean {
  return patterns.include.some((g) => g.match(p)) && !patterns.exclude.some((g) => g.match(p))
}

async function main() {
  const out = arg('--out')
  const ref = arg('--ref') ?? 'HEAD'
  const dryRun = flag('--dry-run')
  if (!out && !dryRun) {
    console.error('ERROR: --out <dir> is required (or --dry-run).')
    process.exit(2)
  }

  const sha = ((await git(['rev-parse', ref])) as string).trim()
  const shortSha = sha.slice(0, 12)

  // Patterns come from the exported ref so the export is reproducible; fall
  // back to the working tree on the first run before the file is committed.
  let includeText: string
  try {
    includeText = (await git(['show', `${ref}:${INCLUDE_FILE}`])) as string
  } catch {
    includeText = await Bun.file(path.join(REPO_ROOT, INCLUDE_FILE)).text()
    console.warn(`note: ${INCLUDE_FILE} is not at ${ref}; using the working-tree copy`)
  }
  const patterns = loadPatterns(includeText)

  // Tracked paths with modes, so executable bits survive the copy.
  const lsTree = (await git(['ls-tree', '-r', '--long', ref])) as string
  const entries = lsTree
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, p] = line.split('\t')
      const [mode, type] = meta.split(/\s+/)
      return { mode, type, path: p }
    })
    .filter((e) => e.type === 'blob')

  const kept: typeof entries = []
  const left: string[] = []
  for (const e of entries) {
    if (admitted(e.path, patterns)) kept.push(e)
    else left.push(e.path)
  }
  if (!kept.some((e) => e.path === PUBLIC_README)) {
    throw new Error(`${PUBLIC_README} is not at ${ref}; the export has no README`)
  }

  console.log(`export of ${ref} (${shortSha}): ${kept.length} files kept, ${left.length} left private`)
  console.log('\nleft private:')
  for (const p of left) console.log(`  - ${p}`)
  if (dryRun) return

  const outDir = path.resolve(out!)
  if (outDir === REPO_ROOT || REPO_ROOT.startsWith(outDir + path.sep)) {
    throw new Error(`refusing to export into ${outDir}: it contains the source repo`)
  }
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  for (const e of kept) {
    const bytes = (await git(['show', `${ref}:${e.path}`], REPO_ROOT, true)) as Uint8Array
    const dest = path.join(outDir, e.path === PUBLIC_README ? 'README.md' : e.path)
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, bytes)
    if (e.mode === '100755') await chmod(dest, 0o755)
  }
  console.log(`\nwrote ${kept.length} files to ${outDir}`)

  // A markdown link in the export to a file that was left private is a
  // dangling link the store reviewer will click. Fail on it.
  const leftBase = new Set(left.map((p) => path.basename(p)))
  const offenders: string[] = []
  for (const e of kept) {
    if (!e.path.endsWith('.md')) continue
    const text = await Bun.file(path.join(outDir, e.path === PUBLIC_README ? 'README.md' : e.path)).text()
    for (const m of text.matchAll(/\]\(([^)\s#]+)/g)) {
      const target = m[1]
      if (/^(https?:|mailto:)/.test(target)) continue
      if (leftBase.has(path.basename(target))) offenders.push(`${e.path} links to ${target}`)
    }
  }
  if (offenders.length) {
    console.error('\nERROR: exported markdown links to files left private:')
    for (const o of offenders) console.error(`  - ${o}`)
    process.exit(1)
  }

  if (flag('--verify')) {
    // The Firefox bundle step needs more than Node's default old-space on an
    // 8 GB devcontainer (it died at 1 GB on 2026-09-03). CI's ubuntu runner
    // does not need this; setting it here does not change what is built.
    process.env.NODE_OPTIONS ??= '--max-old-space-size=4096'
    await run(['bun', 'install', '--frozen-lockfile'], outDir)
    await run(['bun', 'run', 'build'], outDir)
    const unitTests = (await readdir(path.join(outDir, 'test'))).filter((f) => f.endsWith('.test.ts'))
    if (unitTests.length) await run(['bun', 'test', ...unitTests.map((f) => `test/${f}`)], outDir)
    console.log('\nverify: CI gate passed in the export')
  }

  const target = arg('--push')
  if (!target) return

  const work = path.join(path.dirname(outDir), `${path.basename(outDir)}.git-work`)
  await rm(work, { recursive: true, force: true })

  let exists = true
  try {
    await run(['gh', 'repo', 'view', target, '--json', 'name'], REPO_ROOT)
  } catch {
    exists = false
  }
  if (!exists) {
    if (!flag('--create')) throw new Error(`${target} does not exist; pass --create to create it as a public repo`)
    await run(['gh', 'repo', 'create', target, '--public', '--description',
      'Verifieddit browser extension: verify C2PA Content Credentials on any web page, locally, with no account.'], REPO_ROOT)
  }
  await run(['gh', 'repo', 'clone', target, work], REPO_ROOT)

  // Replace the tree wholesale so deletions in the source propagate.
  for (const name of await readdir(work)) {
    if (name === '.git') continue
    await rm(path.join(work, name), { recursive: true, force: true })
  }
  for (const name of await readdir(outDir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    await cp(path.join(outDir, name), path.join(work, name), { recursive: true })
  }
  await run(['git', 'add', '-A'], work)
  const status = (await git(['status', '--porcelain'], work)) as string
  if (!status.trim()) {
    console.log(`\n${target} is already at ${shortSha}; nothing to push`)
    return
  }
  const message = `chore: sync from ${SOURCE_REPO}@${shortSha}\n\nFiltered export of ${sha}. The admitted paths are listed in that repo's ${INCLUDE_FILE}.`
  await run(['git', 'commit', '-q', '-m', message], work)
  await run(['git', 'push', '-u', 'origin', 'HEAD'], work)
  console.log(`\npushed ${target} at ${shortSha}`)
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message ?? err}`)
  process.exit(1)
})
