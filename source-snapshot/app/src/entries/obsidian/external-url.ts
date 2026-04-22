interface ElectronShellModule {
    shell?: {
        openExternal?: (url: string) => Promise<void> | void
    }
}

type RequireFunction = (moduleName: string) => unknown

function getElectronRequire(): RequireFunction | null {
    const maybeRequire = (
        globalThis as typeof globalThis & { require?: unknown }
    ).require

    return typeof maybeRequire === 'function'
        ? (maybeRequire as RequireFunction)
        : null
}

export function isSupportedExternalUrl(url: string): boolean {
    try {
        const parsedUrl = new URL(url)
        return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:'
    } catch {
        return false
    }
}

export function openExternalUrlWithAnchor(url: string): boolean {
    if (!isSupportedExternalUrl(url)) {
        return false
    }

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.style.display = 'none'

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    return true
}

export function openExternalUrlInObsidianHost(url: string): boolean {
    if (!isSupportedExternalUrl(url)) {
        return false
    }

    const electronRequire = getElectronRequire()
    if (electronRequire != null) {
        try {
            const electron = electronRequire('electron') as ElectronShellModule
            if (electron.shell?.openExternal != null) {
                void electron.shell.openExternal(url)
                return true
            }
        } catch {
            // Fall back to the browser open path when Electron APIs are absent.
        }
    }

    return openExternalUrlWithAnchor(url)
}
