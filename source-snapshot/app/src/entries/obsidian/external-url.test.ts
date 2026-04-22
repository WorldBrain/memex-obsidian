import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    isSupportedExternalUrl,
    openExternalUrlInObsidianHost,
    openExternalUrlWithAnchor,
} from './external-url'

describe('openExternalUrlInObsidianHost', () => {
    const originalRequire = (
        globalThis as typeof globalThis & { require?: unknown }
    ).require
    const anchorClickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {})

    afterEach(() => {
        if (originalRequire === undefined) {
            Reflect.deleteProperty(globalThis as object, 'require')
        } else {
            Object.defineProperty(globalThis, 'require', {
                value: originalRequire,
                configurable: true,
                writable: true,
            })
        }

        anchorClickSpy.mockClear()
    })

    it('rejects non-http urls', () => {
        expect(openExternalUrlInObsidianHost('obsidian://memex-auth')).toBe(
            false,
        )
        expect(anchorClickSpy).not.toHaveBeenCalled()
    })

    it('uses Electron shell.openExternal when available', () => {
        const openExternal = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(globalThis, 'require', {
            value: vi.fn().mockReturnValue({
                shell: {
                    openExternal,
                },
            }),
            configurable: true,
            writable: true,
        })

        expect(openExternalUrlInObsidianHost('https://memex.garden')).toBe(true)

        expect(openExternal).toHaveBeenCalledWith('https://memex.garden')
        expect(anchorClickSpy).not.toHaveBeenCalled()
    })

    it('falls back to an anchor click when Electron APIs are unavailable', () => {
        Object.defineProperty(globalThis, 'require', {
            value: vi.fn(() => {
                throw new Error('electron unavailable')
            }),
            configurable: true,
            writable: true,
        })

        expect(openExternalUrlInObsidianHost('https://memex.garden')).toBe(true)

        expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    })
})

describe('openExternalUrlWithAnchor', () => {
    const anchorClickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {})

    afterEach(() => {
        document.body.innerHTML = ''
        anchorClickSpy.mockClear()
    })

    it('creates and clicks a temporary anchor for supported urls', () => {
        expect(openExternalUrlWithAnchor('https://memex.garden')).toBe(true)
        expect(anchorClickSpy).toHaveBeenCalledTimes(1)
        expect(document.querySelector('a')).toBeNull()
    })

    it('rejects unsupported urls', () => {
        expect(openExternalUrlWithAnchor('obsidian://vault')).toBe(false)
        expect(anchorClickSpy).not.toHaveBeenCalled()
    })
})

describe('isSupportedExternalUrl', () => {
    it('accepts http and https urls', () => {
        expect(isSupportedExternalUrl('https://memex.garden')).toBe(true)
        expect(isSupportedExternalUrl('http://memex.garden')).toBe(true)
    })

    it('rejects invalid and non-http protocols', () => {
        expect(isSupportedExternalUrl('notaurl')).toBe(false)
        expect(isSupportedExternalUrl('obsidian://vault')).toBe(false)
    })
})
