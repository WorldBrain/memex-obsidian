import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_RELEASE_FILES = ['main.js', 'manifest.json', 'styles.css']

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

async function exportReleaseArtifacts() {
    const monorepoRoot = resolveMonorepoRoot()
    const releaseSourceDir = path.join(monorepoRoot, 'app/dist/obsidian')
    const rootManifestPath = path.join(repoRoot, 'manifest.json')
    const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'))
    const outDir = path.join(repoRoot, 'dist', 'release', rootManifest.version)

    await rm(outDir, { recursive: true, force: true })
    await mkdir(outDir, { recursive: true })

    for (const filename of REQUIRED_RELEASE_FILES) {
        await cp(path.join(releaseSourceDir, filename), path.join(outDir, filename))
    }

    const builtManifest = JSON.parse(
        await readFile(path.join(outDir, 'manifest.json'), 'utf8'),
    )

    if (builtManifest.version !== rootManifest.version) {
        throw new Error(
            `Version mismatch: repo manifest is ${rootManifest.version}, built manifest is ${builtManifest.version}.`,
        )
    }

    console.log(`Exported release assets to ${outDir}`)
    console.log('Upload these files to the GitHub release:')
    for (const filename of REQUIRED_RELEASE_FILES) {
        console.log(`- ${path.join(outDir, filename)}`)
    }
}

await exportReleaseArtifacts()
