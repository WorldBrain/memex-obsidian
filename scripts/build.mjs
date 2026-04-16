import { build, context } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const distDir = path.join(repoRoot, 'dist')
const isWatchMode = process.argv.includes('--watch')

const DEFAULT_ENV = {
    MEMEX_BASE_URL: 'https://memex.garden',
}

function parseDotEnv(raw) {
    const entries = {}
    for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
            continue
        }

        const delimiterIndex = trimmed.indexOf('=')
        if (delimiterIndex === -1) {
            continue
        }

        const key = trimmed.slice(0, delimiterIndex).trim()
        let value = trimmed.slice(delimiterIndex + 1).trim()

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }

        entries[key] = value
    }

    return entries
}

async function readDotEnvFile(absolutePath) {
    try {
        const raw = await readFile(absolutePath, 'utf8')
        return parseDotEnv(raw)
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {}
        }
        throw error
    }
}

async function loadEnv() {
    const merged = { ...DEFAULT_ENV }
    for (const relativePath of ['.env', '.env.local']) {
        Object.assign(
            merged,
            await readDotEnvFile(path.join(repoRoot, relativePath)),
        )
    }

    if (typeof process.env.MEMEX_BASE_URL === 'string') {
        merged.MEMEX_BASE_URL = process.env.MEMEX_BASE_URL
    }

    return merged
}

async function copyStaticFiles() {
    await mkdir(distDir, { recursive: true })
    await writeFile(
        path.join(distDir, 'manifest.json'),
        await readFile(path.join(repoRoot, 'manifest.json'), 'utf8'),
    )
    await writeFile(
        path.join(distDir, 'styles.css'),
        await readFile(path.join(repoRoot, 'styles.css'), 'utf8'),
    )
}

async function buildPlugin() {
    const env = await loadEnv()
    await copyStaticFiles()

    const buildOptions = {
        entryPoints: [path.join(repoRoot, 'src', 'main.ts')],
        bundle: true,
        outfile: path.join(distDir, 'main.js'),
        format: 'cjs',
        platform: 'browser',
        target: 'es2022',
        sourcemap: isWatchMode ? 'inline' : false,
        logLevel: 'info',
        external: ['obsidian'],
        define: {
            MEMEX_BASE_URL: JSON.stringify(env.MEMEX_BASE_URL),
        },
    }

    if (isWatchMode) {
        const buildContext = await context(buildOptions)
        await buildContext.watch()
        console.log('Watching Obsidian plugin source...')
        return
    }

    await build(buildOptions)
}

await buildPlugin()
