declare const MEMEX_BASE_URL: string

const DEFAULT_MEMEX_BASE_URL = 'https://memex.garden'

export function getMemexBaseUrl(): string {
    const configuredBaseUrl = MEMEX_BASE_URL?.trim()

    if (configuredBaseUrl) {
        return configuredBaseUrl.replace(/\/$/, '')
    }

    return DEFAULT_MEMEX_BASE_URL
}
