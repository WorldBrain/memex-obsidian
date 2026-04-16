// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ObsidianSidebarBridgeController } from './sidebar-bridge-controller'
import { OBSIDIAN_SIDEBAR_BRIDGE_VERSION } from '~/features/obsidian/sidebar-iframe-bridge'

describe('ObsidianSidebarBridgeController', () => {
    const iframeOrigin = 'https://memex.garden'
    let iframe: HTMLIFrameElement
    let iframeWindow: Window

    beforeEach(() => {
        iframe = document.createElement('iframe')
        iframeWindow = window
        Object.defineProperty(iframe, 'contentWindow', {
            configurable: true,
            value: iframeWindow,
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    function setupController() {
        const callbacks = {
            onReady: vi.fn(),
            onBridgeVersionMismatch: vi.fn(),
            onReadyTimeout: vi.fn(),
            onRequestAuth: vi.fn(),
            onOpenExternalUrl: vi.fn(),
            onTelemetry: vi.fn(),
        }

        const controller = new ObsidianSidebarBridgeController({
            iframeOrigin,
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
            ...callbacks,
        })

        controller.attach(iframe)

        return { controller, callbacks }
    }

    it('accepts ready messages from the expected iframe origin and source', () => {
        const { controller, callbacks } = setupController()

        controller.handleIframeLoad()

        window.dispatchEvent(
            new MessageEvent('message', {
                origin: iframeOrigin,
                source: iframeWindow,
                data: {
                    type: 'memex:iframe:ready',
                    bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
                },
            }),
        )

        expect(callbacks.onReady).toHaveBeenCalledTimes(1)
        expect(controller.ready()).toBe(true)

        window.dispatchEvent(
            new MessageEvent('message', {
                origin: iframeOrigin,
                source: iframeWindow,
                data: {
                    type: 'memex:iframe:request-auth',
                    bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
                },
            }),
        )

        expect(callbacks.onRequestAuth).toHaveBeenCalledTimes(1)

        window.dispatchEvent(
            new MessageEvent('message', {
                origin: iframeOrigin,
                source: iframeWindow,
                data: {
                    type: 'memex:iframe:open-external-url',
                    bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
                    url: 'https://memex.garden/dashboard',
                },
            }),
        )

        expect(callbacks.onOpenExternalUrl).toHaveBeenCalledWith(
            'https://memex.garden/dashboard',
        )

        controller.detach()
    })

    it('ignores messages from unexpected origins', () => {
        const { controller, callbacks } = setupController()

        controller.handleIframeLoad()

        window.dispatchEvent(
            new MessageEvent('message', {
                origin: 'https://evil.example',
                source: iframeWindow,
                data: {
                    type: 'memex:iframe:ready',
                    bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
                },
            }),
        )

        expect(callbacks.onReady).not.toHaveBeenCalled()
        expect(controller.ready()).toBe(false)
    })

    it('reports bridge version mismatches instead of accepting the iframe', () => {
        const { controller, callbacks } = setupController()

        controller.handleIframeLoad()

        const mismatchMessage = {
            type: 'memex:iframe:ready' as const,
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION + 1,
        }

        window.dispatchEvent(
            new MessageEvent('message', {
                origin: iframeOrigin,
                source: iframeWindow,
                data: mismatchMessage,
            }),
        )

        expect(callbacks.onBridgeVersionMismatch).toHaveBeenCalledWith(
            mismatchMessage,
        )
        expect(callbacks.onReady).not.toHaveBeenCalled()
        expect(controller.ready()).toBe(false)
    })

    it('reports a ready timeout when the iframe never responds', () => {
        vi.useFakeTimers()

        const { controller, callbacks } = setupController()
        controller.handleIframeLoad()

        vi.advanceTimersByTime(15001)

        expect(callbacks.onReadyTimeout).toHaveBeenCalledTimes(1)
        expect(controller.ready()).toBe(false)
    })
})
