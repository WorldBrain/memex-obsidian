import { getMemexBaseUrl } from './config'

export const OBSIDIAN_SIDEBAR_BRIDGE_VERSION = 1
export const OBSIDIAN_SIDEBAR_DASHBOARD_PATH = '/dashboard'
export const OBSIDIAN_SIDEBAR_DASHBOARD_TRAILING_SLASH_PATH = '/dashboard/'
export const OBSIDIAN_SIDEBAR_EMBED_PATH = '/embed/obsidian-sidebar'
export const OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM = 'host'
export const OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE = 'obsidian'
export const OBSIDIAN_OAUTH_CALLBACK_URL = 'obsidian://memex-auth'

export interface AuthSessionPayload {
    accessToken: string
    refreshToken: string
    expiresAt: number | null
    tokenType: string | null
    providerToken: string | null
    providerRefreshToken: string | null
}

export interface ObsidianSidebarBridgeFeatureFlags {
    localMarkdownRendering: boolean
    localEditorDropHandling: boolean
    localInlineSearchRendering: boolean
}

export interface MemexHostInitMessage {
    type: 'memex:host:init'
    bridgeVersion: number
    theme: 'light' | 'dark'
    baseUrl: string
    hostEnvironment: 'obsidian'
    featureFlags: ObsidianSidebarBridgeFeatureFlags
}

export interface MemexHostAuthSessionMessage {
    type: 'memex:host:auth-session'
    bridgeVersion: number
    session: AuthSessionPayload | null
}

export interface MemexHostEventMessage {
    type: 'memex:host:event'
    bridgeVersion: number
    event:
        | {
              type: 'themeChanged'
              theme: 'light' | 'dark'
          }
        | {
              type: 'openSearchNotes'
              contentEntityId: string
              title: string
          }
}

export type MemexSidebarHostMessage =
    | MemexHostInitMessage
    | MemexHostAuthSessionMessage
    | MemexHostEventMessage

export interface MemexIframeReadyMessage {
    type: 'memex:iframe:ready'
    bridgeVersion: number
}

export interface MemexIframeRequestAuthMessage {
    type: 'memex:iframe:request-auth'
    bridgeVersion: number
}

export interface MemexIframeOpenExternalUrlMessage {
    type: 'memex:iframe:open-external-url'
    bridgeVersion: number
    url: string
}

export interface MemexIframeNativeActionMessage {
    type: 'memex:iframe:native-action'
    bridgeVersion: number
    action: string
    payload?: unknown
}

export interface MemexIframeTelemetryMessage {
    type: 'memex:iframe:telemetry'
    bridgeVersion: number
    name: string
    payload?: unknown
}

export type MemexSidebarIframeMessage =
    | MemexIframeReadyMessage
    | MemexIframeRequestAuthMessage
    | MemexIframeOpenExternalUrlMessage
    | MemexIframeNativeActionMessage
    | MemexIframeTelemetryMessage

export function isMemexSidebarIframeMessage(
    value: unknown,
): value is MemexSidebarIframeMessage {
    if (value == null || typeof value !== 'object') {
        return false
    }

    const candidate = value as Partial<MemexSidebarIframeMessage>
    return (
        typeof candidate.type === 'string' &&
        typeof candidate.bridgeVersion === 'number'
    )
}

export function getObsidianSidebarEmbedUrl(): string {
    return getObsidianSidebarEmbedUrls()[0]
}

export function getObsidianSidebarEmbedUrls(): string[] {
    const seenUrls = new Set<string>()
    const buildEmbedUrl = (path: string): string => {
        const url = new URL(path, getMemexBaseUrl())
        url.searchParams.set(
            OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM,
            OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE,
        )
        return url.toString()
    }

    return [
        OBSIDIAN_SIDEBAR_DASHBOARD_PATH,
        OBSIDIAN_SIDEBAR_DASHBOARD_TRAILING_SLASH_PATH,
        OBSIDIAN_SIDEBAR_EMBED_PATH,
    ].flatMap((path) => {
        const url = buildEmbedUrl(path)
        if (seenUrls.has(url)) {
            return []
        }
        seenUrls.add(url)
        return [url]
    })
}

export function getObsidianHostedAuthUrl(): string {
    const url = new URL('/auth', getMemexBaseUrl())
    url.searchParams.set(
        OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM,
        OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE,
    )
    return url.toString()
}
