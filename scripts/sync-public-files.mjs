import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_ROOT_FILES = [
    ['app/src/entries/obsidian/manifest.json', 'manifest.json'],
    ['app/src/entries/obsidian/styles.css', 'styles.css'],
]

const REQUIRED_PLUGIN_BUNDLE_FILES = [
    ['app/dist/obsidian/main.js', 'plugin/memex/main.js'],
    ['app/dist/obsidian/main.js.map', 'plugin/memex/main.js.map'],
    ['app/dist/obsidian/manifest.json', 'plugin/memex/manifest.json'],
    ['app/dist/obsidian/styles.css', 'plugin/memex/styles.css'],
]

const SOURCE_SNAPSHOT_PATHS = [
    [
        'app/src/entries/obsidian',
        'source-snapshot/app/src/entries/obsidian',
    ],
    [
        'app/src/features/obsidian',
        'source-snapshot/app/src/features/obsidian',
    ],
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

    for (const [sourceRelativePath, destinationRelativePath] of REQUIRED_ROOT_FILES) {
        const sourcePath = path.join(monorepoRoot, sourceRelativePath)
        const destinationPath = path.join(repoRoot, destinationRelativePath)

        await mkdir(path.dirname(destinationPath), { recursive: true })
        await cp(sourcePath, destinationPath)
    }

    await rm(path.join(repoRoot, 'plugin', 'memex'), {
        recursive: true,
        force: true,
    })

    for (const [sourceRelativePath, destinationRelativePath] of REQUIRED_PLUGIN_BUNDLE_FILES) {
        const sourcePath = path.join(monorepoRoot, sourceRelativePath)
        const destinationPath = path.join(repoRoot, destinationRelativePath)

        await mkdir(path.dirname(destinationPath), { recursive: true })
        await cp(sourcePath, destinationPath)
    }

    await rm(path.join(repoRoot, 'source-snapshot'), {
        recursive: true,
        force: true,
    })

    for (const [sourceRelativePath, destinationRelativePath] of SOURCE_SNAPSHOT_PATHS) {
        const sourcePath = path.join(monorepoRoot, sourceRelativePath)
        const destinationPath = path.join(repoRoot, destinationRelativePath)

        await mkdir(path.dirname(destinationPath), { recursive: true })
        await cp(sourcePath, destinationPath, { recursive: true })
    }

    const manifestPath = path.join(repoRoot, 'manifest.json')
    const versionsPath = path.join(repoRoot, 'versions.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const versions = JSON.parse(await readFile(versionsPath, 'utf8'))
    versions[manifest.version] = manifest.minAppVersion

    await writeFile(versionsPath, `${JSON.stringify(versions, null, 2)}\n`)

    console.log(`Synced root metadata from ${monorepoRoot}`)
    console.log('Synced tracked plugin bundle into plugin/memex/')
    console.log('Synced source snapshot into source-snapshot/')
    console.log(
        `Ensured versions.json contains ${manifest.version} -> ${manifest.minAppVersion}`,
    )
}

await syncPublicFiles()
