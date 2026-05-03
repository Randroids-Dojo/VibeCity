import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// REQ-051: AGENTS.md Rule 1 enforcement.
//
// These tests guard the dash-compliance script that GitHub Actions runs on
// every push and pull request. We exercise three cases against a throwaway
// git repo that copies the script in.
//
//   1. Tracked file with U+2014 EM DASH fails with exit 1.
//   2. Tracked file with U+2013 EN DASH fails with exit 1.
//   3. Tracked file with only plain hyphens passes with exit 0.
//
// We also run the script against the real VibeCity repo to assert the
// committed source is currently clean (the same invariant the workflow
// enforces in CI).

const SCRIPT_PATH = resolve(__dirname, '../../scripts/check-no-dashes.sh')
const REPO_ROOT = resolve(__dirname, '../..')

function initRepo(dir: string): void {
  // Configure user.name / user.email locally so commit works in CI sandboxes
  // that do not preconfigure a global identity.
  const env = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@e' }
  spawnSync('git', ['init', '-q'], { cwd: dir, env })
  spawnSync('git', ['config', 'user.email', 't@e'], { cwd: dir, env })
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir, env })
}

function commitAll(dir: string): void {
  const env = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@e' }
  spawnSync('git', ['add', '.'], { cwd: dir, env })
  spawnSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir, env })
}

function runScript(dir: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bash', [SCRIPT_PATH], {
    cwd: dir,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('check-no-dashes.sh', () => {
  let tmpDirs: string[] = []

  beforeAll(() => {
    tmpDirs = []
  })

  afterAll(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function newRepo(): string {
    const base = mkdtempSync(join(tmpdir(), 'vc-dashcheck-'))
    tmpDirs.push(base)
    mkdirSync(join(base, 'scripts'), { recursive: true })
    copyFileSync(SCRIPT_PATH, join(base, 'scripts/check-no-dashes.sh'))
    initRepo(base)
    return base
  }

  it('rejects a file containing U+2014 EM DASH', () => {
    const dir = newRepo()
    writeFileSync(join(dir, 'bad.md'), 'hello — world\n', 'utf8')
    commitAll(dir)
    const result = runScript(dir)
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain('bad.md')
    expect(result.stderr).toContain('em-dash')
  })

  it('rejects a file containing U+2013 EN DASH', () => {
    const dir = newRepo()
    writeFileSync(join(dir, 'bad.json'), '{"x": "a – b"}\n', 'utf8')
    commitAll(dir)
    const result = runScript(dir)
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain('bad.json')
    expect(result.stderr).toContain('en-dash')
  })

  it('passes for a file with only plain hyphens', () => {
    const dir = newRepo()
    writeFileSync(join(dir, 'ok.md'), 'pages 10-20 and a compound-word are fine\n', 'utf8')
    commitAll(dir)
    const result = runScript(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('ok:')
  })

  it('skips untracked files (gitignored node_modules)', () => {
    const dir = newRepo()
    // Match the real VibeCity tree: node_modules is gitignored, so its
    // contents stay untracked and out of `git ls-files` output.
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n', 'utf8')
    writeFileSync(join(dir, 'ok.md'), 'plain content\n', 'utf8')
    mkdirSync(join(dir, 'node_modules', 'lib'), { recursive: true })
    writeFileSync(join(dir, 'node_modules/lib/index.js'), 'const a = "x — y";\n', 'utf8')
    commitAll(dir)
    const result = runScript(dir)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('ok:')
  })

  it('the live VibeCity repo passes the dash check', () => {
    const result = runScript(REPO_ROOT)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('ok:')
  })
})
