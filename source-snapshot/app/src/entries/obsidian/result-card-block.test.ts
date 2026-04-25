// @vitest-environment happy-dom
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@memex/common/features/ui-theme/provider'
import { ExtUIContext } from '~/ui-scripts/context-provider'
import { ObsidianResultCardBlock } from './result-card-block'

const { openExternalUrlWithAnchorMock } = vi.hoisted(() => ({
    openExternalUrlWithAnchorMock: vi.fn(),
}))

vi.mock('./external-url', () => ({
    openExternalUrlWithAnchor: openExternalUrlWithAnchorMock,
}))

function MockObsidianRuntimeProvider({
    children,
}: {
    children?: React.ReactNode
    runtime: unknown
}) {
    return React.createElement(React.Fragment, null, children)
}

vi.mock('./runtime', () => ({
    ObsidianRuntimeProvider: MockObsidianRuntimeProvider,
}))

function MockUniversalResultCard({
    onClick,
}: {
    onClick?: (event?: React.MouseEvent) => void
}) {
    const context = React.useContext(ExtUIContext)
    const [isExpanded, setIsExpanded] = React.useState(false)
    const annotationReferenceIds =
        context?.globalLogic.state.referencesByContentEntityId['annotation-1']
            ?.contentEntityIds ?? []

    return React.createElement(
        'div',
        {
            ['data-testid']: 'inline-card',
            ['data-content-id']: 'page-1',
            ['data-has-cached-target-page']:
                context?.globalState.contentEntities['target-page-1'] != null
                    ? 'true'
                    : 'false',
            ['data-has-logic-cached-target-page']:
                context?.globalLogic.state.contentEntities['target-page-1'] !=
                null
                    ? 'true'
                    : 'false',
            ['data-annotation-reference-ids']: annotationReferenceIds.join(','),
            onClick: (event: React.MouseEvent<HTMLDivElement>) => {
                if (
                    (event.target as HTMLElement | null)?.closest('a') != null
                ) {
                    return
                }

                if (!isExpanded) {
                    setIsExpanded(true)
                    return
                }

                onClick?.(event)
            },
        },
        React.createElement(
            'div',
            { ['data-testid']: 'plain-area' },
            isExpanded ? 'Expanded card content' : 'Plain card content',
        ),
        React.createElement(
            'a',
            {
                href: 'https://example.com/inside-link',
                ['data-testid']: 'inner-link',
            },
            'Inner link',
        ),
    )
}

vi.mock('~/features/search/ui/result-cards', () => ({
    UniversalResultCard: MockUniversalResultCard,
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

    afterEach(() => {
        root?.unmount()
        root = null
        document.body.innerHTML = ''
        openExternalUrlWithAnchorMock.mockClear()
    })

    it('expands on first click and opens on the second click', async () => {
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

        expect(openExternalUrlWithAnchorMock).not.toHaveBeenCalled()

        plainArea.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()

        expect(openExternalUrlWithAnchorMock).toHaveBeenCalledWith(
            'https://example.com/article',
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

        expect(openExternalUrlWithAnchorMock).not.toHaveBeenCalled()
    })

    it('opens notes on shift-click after expansion', async () => {
        document.body.innerHTML = '<div id="root"></div>'
        const container = document.getElementById('root')
        if (container == null) {
            throw new Error('Missing root container')
        }

        const onOpenNotes = vi.fn().mockResolvedValue(undefined)
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
                            onOpenNotes,
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

        plainArea.dispatchEvent(
            new MouseEvent('click', {
                bubbles: true,
                shiftKey: true,
            }),
        )
        await Promise.resolve()

        expect(onOpenNotes).toHaveBeenCalledWith({
            contentEntityId: 'page-1',
            title: 'Example article',
        })
        expect(openExternalUrlWithAnchorMock).not.toHaveBeenCalled()
    })

    it('adds nested loaded content entities to the scoped cache', async () => {
        document.body.innerHTML = '<div id="root"></div>'
        const container = document.getElementById('root')
        if (container == null) {
            throw new Error('Missing root container')
        }

        root = createRoot(container)

        const nestedTargetSource = JSON.stringify({
            v: 1,
            kind: 'memex-result-card',
            entity: {
                id: 'annotation-1',
                type: 'annotation',
                text: 'Annotation',
                content: { type: 'doc', content: [] },
                created_at: 1,
                updated_at: 1,
                tag_ids: [],
            },
            relatedContentEntities: [
                {
                    id: 'selector-1',
                    type: 'selector',
                    selector_type: 'text_selector',
                    quote: 'Quote',
                    target_id: 'target-page-1',
                    created_at: 1,
                    updated_at: 1,
                    target_entity: {
                        id: 'target-page-1',
                        type: 'web',
                        title: 'Target page',
                        url: 'https://example.com/target',
                        normalized_url: 'example.com/target',
                        created_at: 1,
                        updated_at: 1,
                    },
                },
            ],
        })

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
                            source: nestedTargetSource,
                            onOpenExternalUrl: vi.fn(),
                            onOpenNotes: vi.fn(),
                        }),
                    ),
                ),
            )
        })

        const inlineCard = document.querySelector(
            '[data-testid="inline-card"]',
        ) as HTMLElement | null
        if (inlineCard == null) {
            throw new Error('Missing inline card')
        }

        expect(inlineCard.dataset.hasCachedTargetPage).toBe('true')
        expect(inlineCard.dataset.hasLogicCachedTargetPage).toBe('true')
    })

    it('adds dragged annotation reference rows to the scoped logic cache', async () => {
        document.body.innerHTML = '<div id="root"></div>'
        const container = document.getElementById('root')
        if (container == null) {
            throw new Error('Missing root container')
        }

        root = createRoot(container)

        const annotationSource = JSON.stringify({
            v: 1,
            kind: 'memex-result-card',
            entity: {
                id: 'annotation-1',
                type: 'annotation',
                text: 'Annotation',
                content: {
                    type: 'doc',
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'memex-reference',
                                    attrs: {
                                        contentId: 'selector-1',
                                    },
                                },
                            ],
                        },
                    ],
                },
                created_at: 1,
                updated_at: 1,
                tag_ids: [],
            },
            relatedContentEntities: [
                {
                    id: 'selector-1',
                    type: 'selector',
                    selector_type: 'text_selector',
                    quote: 'Quote',
                    target_id: 'target-page-1',
                    created_at: 1,
                    updated_at: 1,
                    target_entity: {
                        id: 'target-page-1',
                        type: 'web',
                        title: 'Target page',
                        url: 'https://example.com/target',
                        normalized_url: 'example.com/target',
                        created_at: 1,
                        updated_at: 1,
                    },
                },
            ],
        })

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
                            source: annotationSource,
                            onOpenExternalUrl: vi.fn(),
                            onOpenNotes: vi.fn(),
                        }),
                    ),
                ),
            )
        })

        const inlineCard = document.querySelector(
            '[data-testid="inline-card"]',
        ) as HTMLElement | null
        if (inlineCard == null) {
            throw new Error('Missing inline card')
        }

        expect(inlineCard.dataset.annotationReferenceIds).toBe('selector-1')
    })
})
