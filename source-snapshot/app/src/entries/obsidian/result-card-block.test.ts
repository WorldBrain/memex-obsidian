// @vitest-environment happy-dom
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@memex/common/features/ui-theme/provider'
import { ExtUIContext } from '~/ui-scripts/context-provider'
import { ObsidianResultCardBlock } from './result-card-block'

vi.mock('./runtime', () => ({
    ObsidianRuntimeProvider: ({
        children,
    }: {
        children?: React.ReactNode
        runtime: unknown
    }) => React.createElement(React.Fragment, null, children),
}))

vi.mock('~/features/search/ui/result-cards', () => ({
    UniversalResultCard: ({
        onClick,
    }: {
        onClick?: (event?: React.MouseEvent) => void
    }) =>
        React.createElement(
            'div',
            {
                ['data-testid']: 'inline-card',
                onClick: (event: React.MouseEvent<HTMLDivElement>) => {
                    if (
                        (event.target as HTMLElement | null)?.closest('a') !=
                        null
                    ) {
                        return
                    }

                    onClick?.(event)
                },
            },
            React.createElement(
                'div',
                { ['data-testid']: 'plain-area' },
                'Plain card content',
            ),
            React.createElement(
                'a',
                {
                    href: 'https://example.com/inside-link',
                    ['data-testid']: 'inner-link',
                },
                'Inner link',
            ),
        ),
}))

const contextValue = {
    services: {},
    bgModules: {},
    events: {
        emit: vi.fn(),
        listen: vi.fn(() => () => {}),
    },
    shadowRoot: undefined,
    globalLogic: {
        state: {
            user: {
                id: 'test-user-1',
            },
            contentEntities: {},
            referencesByContentEntityId: {},
            tags: {
                tagEntities: {},
            },
        },
    },
    globalState: {
        user: {
            id: 'test-user-1',
        },
        contentEntities: {},
        referencesByContentEntityId: {},
        tags: {
            tagEntities: {},
        },
    },
} as any

const source = JSON.stringify({
    v: 1,
    kind: 'memex-result-card',
    entity: {
        id: 'page-1',
        type: 'web',
        title: 'Example article',
        url: 'https://example.com/article',
        full_url: 'https://example.com/article',
        normalized_url: 'example.com/article',
        created_at: '2026-03-12T00:00:00.000Z',
        updated_at: '2026-03-12T00:00:00.000Z',
        tag_ids: [],
    },
})

describe('ObsidianResultCardBlock', () => {
    let root: Root | null = null
    const windowOpenSpy = vi
        .spyOn(window, 'open')
        .mockImplementation(() => null)

    afterEach(() => {
        root?.unmount()
        root = null
        document.body.innerHTML = ''
        windowOpenSpy.mockClear()
    })

    it('opens the result when clicking a non-interactive area of the inline card', async () => {
        document.body.innerHTML = '<div id="root"></div>'
        const container = document.getElementById('root')
        if (container == null) {
            throw new Error('Missing root container')
        }

        root = createRoot(container)

        flushSync(() => {
            root?.render(
                React.createElement(
                    ThemeProvider,
                    null,
                    React.createElement(
                        ExtUIContext.Provider,
                        { value: contextValue },
                        React.createElement(ObsidianResultCardBlock, {
                            runtime: {} as never,
                            source,
                            onOpenExternalUrl: vi.fn(),
                            onOpenNotes: vi.fn(),
                        }),
                    ),
                ),
            )
        })

        const plainArea = document.querySelector(
            '[data-testid="plain-area"]',
        ) as HTMLElement | null
        if (plainArea == null) {
            throw new Error('Missing plain card area')
        }

        plainArea.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()

        expect(windowOpenSpy).toHaveBeenCalledWith(
            'https://example.com/article',
            '_blank',
            'noopener,noreferrer',
        )
    })

    it('does not hijack clicks on interactive inner links', async () => {
        document.body.innerHTML = '<div id="root"></div>'
        const container = document.getElementById('root')
        if (container == null) {
            throw new Error('Missing root container')
        }

        root = createRoot(container)

        flushSync(() => {
            root?.render(
                React.createElement(
                    ThemeProvider,
                    null,
                    React.createElement(
                        ExtUIContext.Provider,
                        { value: contextValue },
                        React.createElement(ObsidianResultCardBlock, {
                            runtime: {} as never,
                            source,
                            onOpenExternalUrl: vi.fn(),
                            onOpenNotes: vi.fn(),
                        }),
                    ),
                ),
            )
        })

        const innerLink = document.querySelector(
            '[data-testid="inner-link"]',
        ) as HTMLElement | null
        if (innerLink == null) {
            throw new Error('Missing inner link')
        }

        innerLink.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()

        expect(windowOpenSpy).not.toHaveBeenCalled()
    })
})
