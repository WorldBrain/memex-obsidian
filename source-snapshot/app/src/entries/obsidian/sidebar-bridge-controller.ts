import type {
    MemexSidebarHostMessage,
    MemexSidebarIframeMessage,
} from '~/features/obsidian/sidebar-iframe-bridge'
import { isMemexSidebarIframeMessage } from '~/features/obsidian/sidebar-iframe-bridge'

const DEFAULT_READY_TIMEOUT_MS = 15000

export interface ObsidianSidebarBridgeControllerOptions {
    iframeOrigin: string
    bridgeVersion: number
    readyTimeoutMs?: number
    onReady: () => void
    onBridgeVersionMismatch: (message: MemexSidebarIframeMessage) => void
    onReadyTimeout: () => void
    onRequestAuth: () => void
    onOpenExternalUrl: (url: string) => void
    onNativeAction?: (
        message: Extract<
            MemexSidebarIframeMessage,
            { type: 'memex:iframe:native-action' }
        >,
    ) => void
    onTelemetry?: (
        message: Extract<
            MemexSidebarIframeMessage,
            { type: 'memex:iframe:telemetry' }
        >,
    ) => void
}

export class ObsidianSidebarBridgeController {
    private iframe: HTMLIFrameElement | null = null
    private readyTimeout: number | null = null
    private isReady = false

    constructor(
        private readonly options: ObsidianSidebarBridgeControllerOptions,
    ) {}

    attach(iframe: HTMLIFrameElement): void {
        this.iframe = iframe
        window.addEventListener('message', this.handleMessage)
    }

    detach(): void {
        window.removeEventListener('message', this.handleMessage)
        this.clearReadyTimeout()
        this.iframe = null
        this.isReady = false
    }

    handleIframeLoad(): void {
        this.isReady = false
        this.clearReadyTimeout()
        this.readyTimeout = window.setTimeout(() => {
            this.readyTimeout = null
            if (!this.isReady) {
                this.options.onReadyTimeout()
            }
        }, this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS)
    }

    ready(): boolean {
        return this.isReady
    }

    postMessage(message: MemexSidebarHostMessage): void {
        this.iframe?.contentWindow?.postMessage(
            message,
            this.options.iframeOrigin,
        )
    }

    private clearReadyTimeout(): void {
        if (this.readyTimeout != null) {
            window.clearTimeout(this.readyTimeout)
            this.readyTimeout = null
        }
    }

    private handleMessage = (event: MessageEvent): void => {
        if (
            event.origin !== this.options.iframeOrigin ||
            event.source !== this.iframe?.contentWindow ||
            !isMemexSidebarIframeMessage(event.data)
        ) {
            return
        }

        const message = event.data

        if (message.type === 'memex:iframe:ready') {
            if (message.bridgeVersion !== this.options.bridgeVersion) {
                this.isReady = false
                this.clearReadyTimeout()
                this.options.onBridgeVersionMismatch(message)
                return
            }

            this.isReady = true
            this.clearReadyTimeout()
            this.options.onReady()
            return
        }

        switch (message.type) {
            case 'memex:iframe:request-auth':
                this.options.onRequestAuth()
                return
            case 'memex:iframe:open-external-url':
                this.options.onOpenExternalUrl(message.url)
                return
            case 'memex:iframe:native-action':
                this.options.onNativeAction?.(message)
                return
            case 'memex:iframe:telemetry':
                this.options.onTelemetry?.(message)
                return
        }
    }
}
