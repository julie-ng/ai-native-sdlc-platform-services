/**
 * `npm run docs:dev`: rebuild the TypeDoc API reference whenever the source changes and
 * serve it for preview, by default at http://localhost:4000. Refresh the page after a
 * rebuild. A development preview only: static files, no caching, GET and HEAD.
 *
 * Environment: `DOCS_PORT` (default 4000) and `DOCS_HOST` (default 127.0.0.1; use
 * 0.0.0.0 to reach the preview from outside a dev container).
 * @module
 */
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env.DOCS_PORT ?? 4000)
const host = process.env.DOCS_HOST ?? '127.0.0.1'

// Serve whatever typedoc.json writes to, so the two cannot drift apart.
const { out } = JSON.parse(await readFile(resolve(repositoryRoot, 'typedoc.json'), 'utf8')) as { out: string }
const root = resolve(repositoryRoot, out)

/** Content types of the files TypeDoc emits; anything else is sent as a download. */
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

/**
 * Map a URL path to a file under the output directory. Directories resolve to their
 * `index.html`. Paths that escape the output directory never resolve.
 * @param pathname - Percent-encoded URL path.
 * @returns The absolute file path, or `undefined` when there is no such file.
 */
async function findFile(pathname: string): Promise<string | undefined> {
  const path = resolve(root, `.${decodeURIComponent(pathname)}`)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    return undefined
  }
  const info = await stat(path).catch(() => undefined)
  if (info?.isDirectory()) {
    return findFile(`${pathname.replace(/\/$/, '')}/index.html`)
  }
  return info?.isFile() ? path : undefined
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  let file: string | undefined
  try {
    file = await findFile(new URL(request.url ?? '/', 'http://localhost').pathname)
  }
  catch {
    response.writeHead(400).end('Bad request')
    return
  }
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('Not found. If typedoc is still doing its first build, wait a moment and refresh.')
    return
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(file).pipe(response)
})

// `npm run` puts node_modules/.bin on the PATH, so `typedoc` resolves to the installed version.
const typedoc = spawn('typedoc', ['--watch'], { cwd: repositoryRoot, stdio: 'inherit' })
typedoc.on('exit', (code) => {
  server.close()
  process.exitCode = code ?? 1
})
process.on('SIGINT', () => typedoc.kill('SIGINT'))
process.on('SIGTERM', () => typedoc.kill('SIGTERM'))

server.listen(port, host, () => {
  console.log(`API reference preview: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
})
