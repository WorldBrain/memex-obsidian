import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const pluginDir = path.join(repoRoot, 'plugin', 'memex')

async function prepareRelease() {
    const manifest = JSON.parse(
        await readFile(path.join(repoRoot, 'manifest.json'), 'utf8'),
    )
    const version = manifest.version
    const releaseDir = path.join(repoRoot, 'dist', 'release', version)

    await rm(releaseDir, { recursive: true, force: true })
    await mkdir(releaseDir, { recursive: true })

    for (const filename of ['main.js', 'manifest.json', 'styles.css']) {
        await cp(
            path.join(pluginDir, filename),
            path.join(releaseDir, filename),
        )
    }

    console.log(`Prepared release artifacts in ${releaseDir}`)
}

await prepareRelease()
