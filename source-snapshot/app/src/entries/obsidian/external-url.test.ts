import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    isSupportedExternalUrl,
    openExternalUrlInObsidianHost,
} from './external-url'

describe('openExternalUrlInObsidianHost', () => {
    const originalRequire = (
        globalThis as typeof globalThis & { require?: unknown }
    ).require
    const openSpy = vi.spyOn(window, 'open')

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

        openSpy.mockReset()
    })

    it('rejects non-http urls', () => {
        expect(openExternalUrlInObsidianHost('obsidian://memex-auth')).toBe(
            false,
        )
        expect(openSpy).not.toHaveBeenCalled()
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
        expect(openSpy).not.toHaveBeenCalled()
    })

    it('falls back to window.open when Electron APIs are unavailable', () => {
        Object.defineProperty(globalThis, 'require', {
            value: vi.fn(() => {
                throw new Error('electron unavailable')
            }),
            configurable: true,
            writable: true,
        })
        openSpy.mockReturnValue(window)

        expect(openExternalUrlInObsidianHost('https://memex.garden')).toBe(true)

        expect(openSpy).toHaveBeenCalledWith(
            'https://memex.garden',
            '_blank',
            'noopener,noreferrer',
        )
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
