import { ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import type { MemexObsidianPlugin } from './main'
import type {
    AuthSessionPayload,
    MemexSidebarHostMessage,
} from './bridge-protocol'
import {
    OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
    getObsidianSidebarEmbedUrls,
} from './bridge-protocol'
import { getMemexBaseUrl } from './config'
import { ObsidianSidebarBridgeController } from './sidebar-bridge-controller'

const FEATURE_FLAGS = {
    localMarkdownRendering: true,
    localEditorDropHandling: true,
    localInlineSearchRendering: false,
} as const

export const MEMEX_OBSIDIAN_VIEW_TYPE = 'memex-sidebar'

export class MemexSidebarView extends ItemView {
    private iframe: HTMLIFrameElement | null = null
    private controller: ObsidianSidebarBridgeController | null = null
    private pendingMessages: MemexSidebarHostMessage[] = []
    private themeObserver: MutationObserver | null = null
    private embedUrls: string[] = []
    private currentEmbedUrlIndex = 0

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: MemexObsidianPlugin,
    ) {
        super(leaf)
    }

    getViewType(): string {
        return MEMEX_OBSIDIAN_VIEW_TYPE
    }

    getDisplayText(): string {
        return 'Memex Sidebar'
    }

    async onOpen(): Promise<void> {
        this.contentEl.replaceChildren()

        const host = this.contentEl.createDiv({
            cls: 'memex-obsidian-sidebar-host',
        })

        this.embedUrls = getObsidianSidebarEmbedUrls()
        this.currentEmbedUrlIndex = 0

        const embedUrl = this.embedUrls[0]
        const iframeOrigin = new URL(embedUrl).origin
        const iframe = document.createElement('iframe')
        iframe.className = 'memex-obsidian-sidebar-iframe'
        iframe.src = embedUrl
        iframe.title = 'Memex Sidebar'
        host.appendChild(iframe)

        const controller = new ObsidianSidebarBridgeController({
            iframeOrigin,
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
            onReady: () => {
                void this.sendInitialHostState()
            },
            onBridgeVersionMismatch: () => {
                new Notice('Memex sidebar bridge version mismatch.')
            },
            onReadyTimeout: () => {
                if (this.retryAlternateEmbedUrl()) {
                    return
                }
                new Notice('Memex sidebar did not finish loading in time.')
            },
            onRequestAuth: () => {
                void this.plugin.startLoginFlow()
            },
            onOpenExternalUrl: (url) => {
                try {
                    const parsed = new URL(url)
                    if (
                        parsed.protocol !== 'http:' &&
                        parsed.protocol !== 'https:'
                    ) {
                        return
                    }
                    window.open(url, '_blank', 'noopener,noreferrer')
                } catch {
                    return
                }
            },
            onNativeAction: (message) => {
                console.warn(
                    '[Memex Obsidian] Unsupported native action:',
                    message.action,
                    message.payload,
                )
            },
            onTelemetry: (message) => {
                console.warn('[Memex Obsidian]', message.name, message.payload)
            },
        })

        iframe.addEventListener('load', () => {
            controller.handleIframeLoad()
        })

        controller.attach(iframe)
        this.iframe = iframe
        this.controller = controller
        this.observeThemeChanges()
    }

    async onClose(): Promise<void> {
        this.themeObserver?.disconnect()
        this.themeObserver = null
        this.controller?.detach()
        this.controller = null
        this.iframe = null
        this.pendingMessages = []
        this.embedUrls = []
        this.currentEmbedUrlIndex = 0
    }

    openSearchNotes(params: { contentEntityId: string; title: string }): void {
        this.postHostMessage({
            type: 'memex:host:event',
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
            event: {
                type: 'openSearchNotes',
                contentEntityId: params.contentEntityId,
                title: params.title,
            },
        })
    }

    syncAuthSession(session: AuthSessionPayload | null): void {
        this.postHostMessage({
            type: 'memex:host:auth-session',
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
            session,
        })
    }

    private async sendInitialHostState(): Promise<void> {
        this.postHostMessage({
            type: 'memex:host:init',
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
            theme: this.getCurrentTheme(),
            baseUrl: getMemexBaseUrl(),
            hostEnvironment: 'obsidian',
            featureFlags: FEATURE_FLAGS,
        })

        this.postHostMessage({
            type: 'memex:host:auth-session',
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
            session: this.plugin.getAuthSession(),
        })

        this.flushPendingMessages()
    }

    private postHostMessage(message: MemexSidebarHostMessage): void {
        if (this.controller?.ready()) {
            this.controller.postMessage(message)
            return
        }

        this.pendingMessages.push(message)
    }

    private flushPendingMessages(): void {
        if (!this.controller?.ready()) {
            return
        }

        for (const message of this.pendingMessages) {
            this.controller.postMessage(message)
        }
        this.pendingMessages = []
    }

    private observeThemeChanges(): void {
        this.themeObserver?.disconnect()
        this.themeObserver = new MutationObserver(() => {
            this.postHostMessage({
                type: 'memex:host:event',
                bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
                event: {
                    type: 'themeChanged',
                    theme: this.getCurrentTheme(),
                },
            })
        })
        this.themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        })
    }

    private retryAlternateEmbedUrl(): boolean {
        const nextEmbedUrl = this.embedUrls[this.currentEmbedUrlIndex + 1]
        if (this.iframe == null || this.controller == null || nextEmbedUrl == null) {
            return false
        }

        this.currentEmbedUrlIndex += 1
        console.warn(
            '[Memex Obsidian] Retrying hosted dashboard load with alternate URL:',
            nextEmbedUrl,
        )
        this.iframe.src = nextEmbedUrl
        this.controller.handleIframeLoad()
        return true
    }

    private getCurrentTheme(): 'light' | 'dark' {
        return document.body.classList.contains('theme-light')
            ? 'light'
            : 'dark'
    }
}
