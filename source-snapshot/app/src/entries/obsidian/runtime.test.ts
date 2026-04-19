import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObsidianRuntime } from './runtime'

const { setupWebPlatformContextMock } = vi.hoisted(() => ({
    setupWebPlatformContextMock: vi.fn(),
}))

vi.mock('~/entries/web-platform-setup', () => ({
    setupWebPlatformContext: setupWebPlatformContextMock,
}))

describe('ObsidianRuntime', () => {
    beforeEach(() => {
        setupWebPlatformContextMock.mockReset()
    })

    it('boots the shared web platform context without Obsidian-specific icon overrides', async () => {
        const initialize = vi.fn()

        setupWebPlatformContextMock.mockResolvedValue({
            services: {},
            bgModules: {},
            globalLogic: {
                initialize,
                cleanup: vi.fn(),
                setState: vi.fn(),
                state: {},
                events: {},
            },
            events: {},
        })

        const runtime = new ObsidianRuntime()
        await runtime.ensureContext()

        expect(setupWebPlatformContextMock).toHaveBeenCalledTimes(1)
        expect(
            setupWebPlatformContextMock.mock.calls[0]?.[0]?.inlineIcons,
        ).toBeUndefined()
        expect(initialize).toHaveBeenCalledTimes(1)
    })
})
