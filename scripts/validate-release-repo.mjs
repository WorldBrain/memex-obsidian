import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_ROOT_FILES = [
    'README.md',
    'LICENSE',
    'manifest.json',
    'versions.json',
    'styles.css',
    '.env.example',
]

const REQUIRED_PUBLIC_ENVS = [
    'VITE_OBSIDIAN_SIDEBAR_BASE_URL',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_FUNCTIONS_URL',
]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

async function assertFileExists(relativePath) {
    await access(path.join(repoRoot, relativePath))
}

function assertSemver(version) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`manifest.json version must be x.y.z, received ${version}`)
    }
}

async function validate() {
    for (const relativePath of REQUIRED_ROOT_FILES) {
        await assertFileExists(relativePath)
    }

    const manifest = JSON.parse(
        await readFile(path.join(repoRoot, 'manifest.json'), 'utf8'),
    )
    const versions = JSON.parse(
        await readFile(path.join(repoRoot, 'versions.json'), 'utf8'),
    )
    const envExample = await readFile(
        path.join(repoRoot, '.env.example'),
        'utf8',
    )

    assertSemver(manifest.version)

    if (String(manifest.id).toLowerCase().includes('obsidian')) {
        throw new Error('manifest.json id cannot contain "obsidian".')
    }

    if (versions[manifest.version] !== manifest.minAppVersion) {
        throw new Error(
            `versions.json must contain ${manifest.version}: ${manifest.minAppVersion}.`,
        )
    }

    if (await fileExists(path.join(repoRoot, 'main.js'))) {
        throw new Error(
            'main.js should not be committed at the repo root. Attach it to releases instead.',
        )
    }

    for (const envName of REQUIRED_PUBLIC_ENVS) {
        if (!envExample.includes(`${envName}=`)) {
            throw new Error(`.env.example is missing ${envName}`)
        }
    }

    console.log('Release repo validation passed.')
}

async function fileExists(absolutePath) {
    try {
        await access(absolutePath)
        return true
    } catch {
        return false
    }
}

await validate()
