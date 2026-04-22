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

export async function openExternalUrlInObsidianHost(
    url: string,
): Promise<boolean> {
    if (!isSupportedExternalUrl(url)) {
        return false
    }

    const electronRequire = getElectronRequire()
    if (electronRequire != null) {
        try {
            const electron = electronRequire('electron') as ElectronShellModule
            if (electron.shell?.openExternal != null) {
                await electron.shell.openExternal(url)
                return true
            }
        } catch {
            // Fall back to the browser open path when Electron APIs are absent.
        }
    }

    return window.open(url, '_blank', 'noopener,noreferrer') != null
}
