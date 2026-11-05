import {createServer} from 'node:http'
import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import {extname, isAbsolute, relative, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const site = fileURLToPath(new URL('../site/', import.meta.url))
const mount = 'qdu-imaging'
const host = '127.0.0.1'
const port = Number(process.argv[2] ?? 8080)
const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain'
}

const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, {Allow: 'GET, HEAD'}).end()
        return
    }
    try {
        const url = new URL(request.url, 'http://localhost')
        if (url.pathname === '/' || url.pathname === `/${mount}`) {
            response.writeHead(302, {Location: `/${mount}/`}).end()
            return
        }
        const pathname = decodeURIComponent(url.pathname)
        const prefix = `/${mount}/`
        if (!pathname.startsWith(prefix)) throw new Error('Unknown route')
        const target = resolve(site, pathname.slice(prefix.length) || 'index.html')
        const rel = relative(site, target)
        if (isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error('Invalid path')
        const info = await stat(target)
        const type = types[extname(target)]
        if (!info.isFile() || !type) throw new Error('Unknown file type')

        response.writeHead(200, {'Content-Type': type === 'font/woff2' ? type : `${type}; charset=utf-8`, 'Cache-Control': 'no-store'})
        if (request.method === 'HEAD') response.end()
        else createReadStream(target).on('error', error => response.destroy(error)).pipe(response)
    } catch {
        response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('Not found')
    }
})

server.listen(port, host, () => {
    const address = `http://${host}:${server.address().port}`
    console.log(`Local preview: ${address}/${mount}/`)
})
