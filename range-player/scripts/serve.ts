#!/usr/bin/env bun
import { watch } from 'node:fs';
import { join } from 'node:path';
import type { Server } from 'bun';
const ROOT = join(import.meta.dir, '..');
const PORT = Number(process.env.PORT ?? 3002);
const RQBIT_URL = (process.env.RQBIT_URL ?? 'http://localhost:3030').replace(/\/+$/, '');
const PROXY = '/rqbit';
const WASM = Bun.resolveSync('movi-player/movi.wasm', ROOT);
const ISOLATION = {
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
};
const DROPPED_REQUEST = ['host', 'origin', 'referer', 'cookie', 'connection', 'accept-encoding'];
const DROPPED_RESPONSE = ['connection', 'keep-alive', 'transfer-encoding', 'vary'];
let bundle = new Map<string, Blob>();
let buildError: string | null = null;
async function build(): Promise<void> {
    const started = performance.now();
    const result = await Bun.build({
        entrypoints: [join(ROOT, 'dev/main.ts')],
        target: 'browser',
        format: 'esm',
        sourcemap: 'linked',
        naming: 'app.[ext]',
        throw: false,
    });
    if (!result.success) {
        buildError = result.logs.map(String).join('\n');
        console.error(`[range-player] build failed:\n${buildError}`);
        return;
    }
    bundle = new Map(result.outputs.map((output) => [`/${output.path.replace(/^\.\//, '')}`, output]));
    buildError = null;
    console.log(`[range-player] built in ${Math.round(performance.now() - started)} ms`);
}
let rebuild: ReturnType<typeof setTimeout> | undefined;
for (const dir of ['src', 'dev']) {
    watch(join(ROOT, dir), { recursive: true }, () => {
        clearTimeout(rebuild);
        rebuild = setTimeout(() => void build(), 100);
    });
}
await build();
const server = Bun.serve({
    port: PORT,
    async fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname === PROXY || url.pathname.startsWith(`${PROXY}/`))
            return proxy(req, url, server);
        const res = await serveStatic(url.pathname);
        for (const [name, value] of Object.entries(ISOLATION))
            res.headers.set(name, value);
        return res;
    },
});
console.log(`[range-player] http://localhost:${server.port}  (rqbit: ${RQBIT_URL})`);
async function serveStatic(pathname: string): Promise<Response> {
    switch (pathname) {
        case '/':
        case '/index.html':
            return new Response(Bun.file(join(ROOT, 'dev/index.html')), {
                headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
            });
        case '/movi.wasm':
            return new Response(Bun.file(WASM), { headers: { 'content-type': 'application/wasm' } });
    }
    if (pathname === '/app.js' && buildError) {
        return new Response(`console.error(${JSON.stringify(`range-player build failed:\n${buildError}`)})`, {
            headers: { 'content-type': 'text/javascript' },
        });
    }
    const artifact = bundle.get(pathname);
    if (artifact)
        return new Response(artifact, { headers: { 'cache-control': 'no-store' } });
    return new Response('Not found', { status: 404 });
}
async function proxy(req: Request, url: URL, server: Server<undefined>): Promise<Response> {
    server.timeout(req, 0);
    const target = `${RQBIT_URL}${url.pathname.slice(PROXY.length) || '/'}${url.search}`;
    const headers = new Headers(req.headers);
    for (const name of DROPPED_REQUEST)
        headers.delete(name);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    let upstream: Response;
    try {
        upstream = await fetch(target, {
            method: req.method,
            headers,
            body: hasBody ? await req.arrayBuffer() : undefined,
            signal: req.signal,
            redirect: 'manual',
            decompress: false,
        });
    }
    catch (err) {
        if (req.signal.aborted)
            return new Response(null, { status: 499 });
        const reason = err instanceof Error ? err.message : String(err);
        return Response.json({
            error_kind: 'rqbit_unreachable',
            human_readable: `rqbit is not reachable at ${RQBIT_URL} (${reason})`,
            status: 502,
            status_text: '502 Bad Gateway',
        }, { status: 502, headers: ISOLATION });
    }
    const responseHeaders = new Headers(upstream.headers);
    for (const name of DROPPED_RESPONSE)
        responseHeaders.delete(name);
    for (const [name, value] of Object.entries(ISOLATION))
        responseHeaders.set(name, value);
    return new Response(req.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}
