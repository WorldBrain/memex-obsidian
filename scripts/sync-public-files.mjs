import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_SOURCE_FILES = [
    ['app/src/entries/obsidian/manifest.json', 'manifest.json'],
    ['app/src/entries/obsidian/styles.css', 'styles.css'],
]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function resolveMonorepoRoot() {
    const candidate = process.argv[2] ?? process.env.MEMEX_MONOREPO_DIR

    if (!candidate) {
        throw new Error(
            'Pass the Memex monorepo path as the first argument or set MEMEX_MONOREPO_DIR.',
        )
    }

    return path.resolve(candidate)
}

async function syncPublicFiles() {
    const monorepoRoot = resolveMonorepoRoot()

    for (const [sourceRelativePath, destinationRelativePath] of REQUIRED_SOURCE_FILES) {
        const sourcePath = path.join(monorepoRoot, sourceRelativePath)
        const destinationPath = path.join(repoRoot, destinationRelativePath)

        await mkdir(path.dirname(destinationPath), { recursive: true })
        await cp(sourcePath, destinationPath)
    }

    const manifestPath = path.join(repoRoot, 'manifest.json')
    const versionsPath = path.join(repoRoot, 'versions.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const versions = JSON.parse(await readFile(versionsPath, 'utf8'))
    versions[manifest.version] = manifest.minAppVersion

    await writeFile(versionsPath, `${JSON.stringify(versions, null, 2)}\n`)

    console.log(`Synced manifest.json and styles.css from ${monorepoRoot}`)
    console.log(
        `Ensured versions.json contains ${manifest.version} -> ${manifest.minAppVersion}`,
    )
}

await syncPublicFiles()
