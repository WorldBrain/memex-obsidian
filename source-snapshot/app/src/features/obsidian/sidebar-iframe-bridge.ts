import type { AuthSessionPayload } from '@memex/common/features/auth/services/types'

export const OBSIDIAN_SIDEBAR_BRIDGE_VERSION = 1
export const OBSIDIAN_SIDEBAR_DASHBOARD_PATH = '/dashboard'
export const OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM = 'host'
export const OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE = 'obsidian'
export const OBSIDIAN_OAUTH_CALLBACK_URL = 'obsidian://memex-auth'
const DEFAULT_OBSIDIAN_SIDEBAR_DEV_BASE_URL = 'http://localhost:3002'
const DEFAULT_OBSIDIAN_SIDEBAR_PROD_BASE_URL = 'https://memex.garden'

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

export function isMemexSidebarHostMessage(
    value: unknown,
): value is MemexSidebarHostMessage {
    if (value == null || typeof value !== 'object') {
        return false
    }

    const candidate = value as Partial<MemexSidebarHostMessage>
    return (
        typeof candidate.type === 'string' &&
        typeof candidate.bridgeVersion === 'number'
    )
}

export function getObsidianSidebarHostedBaseUrl(): string {
    const configuredBaseUrl = (
        import.meta.env.VITE_OBSIDIAN_SIDEBAR_BASE_URL as string | undefined
    )?.trim()

    if (configuredBaseUrl != null && configuredBaseUrl.length > 0) {
        return configuredBaseUrl.replace(/\/$/, '')
    }

    if (import.meta.env.MODE === 'development') {
        return DEFAULT_OBSIDIAN_SIDEBAR_DEV_BASE_URL
    }

    return DEFAULT_OBSIDIAN_SIDEBAR_PROD_BASE_URL
}

export function isObsidianHostedDashboard(search: string): boolean {
    return (
        new URLSearchParams(search).get(OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM) ===
        OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE
    )
}

export function isObsidianAuthFlow(search: string): boolean {
    return isObsidianHostedDashboard(search)
}

export function getObsidianSidebarEmbedUrl(): string {
    const url = new URL(
        OBSIDIAN_SIDEBAR_DASHBOARD_PATH,
        getObsidianSidebarHostedBaseUrl(),
    )
    url.searchParams.set(
        OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM,
        OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE,
    )

    return url.toString()
}

export function getObsidianHostedAuthUrl(): string {
    const url = new URL('/auth', getObsidianSidebarHostedBaseUrl())
    url.searchParams.set(
        OBSIDIAN_SIDEBAR_HOST_QUERY_PARAM,
        OBSIDIAN_SIDEBAR_HOST_QUERY_VALUE,
    )
    return url.toString()
}

export function buildObsidianProtocolCallbackUrl(params: {
    accessToken: string
    refreshToken: string
}): string {
    const hashParams = new URLSearchParams({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
    })

    return `${OBSIDIAN_OAUTH_CALLBACK_URL}?hash=${encodeURIComponent(hashParams.toString())}`
}
