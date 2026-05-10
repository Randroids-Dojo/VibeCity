import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveAppVersion() {
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA
    if (vercelSha) return vercelSha.slice(0, 7)
    return 'dev'
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
  // The kit ships TypeScript source (no compiled `dist/`) so Next has
  // to run it through swc. Without this the webpack loader rejects
  // the kit's `export type ...` syntax inside `node_modules`.
  transpilePackages: ['@randroids-dojo/vibekit'],
}

export default nextConfig
