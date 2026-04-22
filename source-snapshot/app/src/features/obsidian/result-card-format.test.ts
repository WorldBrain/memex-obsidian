import { describe, expect, it } from 'vitest'
import type { SearchResultEntity } from '~/features/search/ui/search-container/logic'
import {
    buildObsidianResultCardTransferData,
    buildMemexResultCardPayload,
    formatDroppedMemexResultCardCodeBlock,
    getEditorPositionAfterInsertedText,
    parseMemexResultCardPayload,
    serializeMemexResultCardCodeBlock,
    serializeMemexResultCardPayload,
} from './result-card-format'

describe('result-card-format', () => {
    it('round-trips a memex result card payload', () => {
        const payload = buildMemexResultCardPayload({
            entity: {
                id: 'content-1',
                type: 'web',
                title: 'Memex',
                url: 'https://memex.garden',
                normalized_url: 'https://memex.garden',
                created_at: 1,
                updated_at: 1,
            },
            snippets: ['Saved knowledge'],
        })

        expect(
            parseMemexResultCardPayload(
                serializeMemexResultCardPayload(payload),
            ),
        ).toEqual(payload)
    })

    it('omits search chunk metadata from the serialized entity', () => {
        const payload = buildMemexResultCardPayload({
            entity: {
                id: 'content-search-1',
                type: 'web',
                title: 'Search-shaped result',
                url: 'https://memex.garden/search-shaped',
                normalized_url: 'https://memex.garden/search-shaped',
                created_at: 1,
                updated_at: 1,
                searchChunkMatches: [
                    {
                        matchedSourceContentId: 'chunk-1',
                        chunks: [
                            {
                                id: 'chunk-1',
                                index: 0,
                                type: 'selector',
                                text: 'Matched chunk',
                                metadata: {},
                            },
                        ],
                    },
                ],
            },
        })

        expect(payload.entity.searchChunkMatches).toBeUndefined()
        expect(payload.entity.id).toBe('content-search-1')
    })

    it('serializes the payload as a fenced memex-card block', () => {
        const payload = buildMemexResultCardPayload({
            entity: {
                id: 'content-2',
                type: 'web',
                title: 'Garden',
                url: 'https://memex.garden/docs',
                normalized_url: 'https://memex.garden/docs',
                created_at: 1,
                updated_at: 1,
            },
        })

        expect(serializeMemexResultCardCodeBlock(payload)).toContain(
            '```memex-card',
        )
    })

    it('adds a trailing blank paragraph for dropped memex-card blocks', () => {
        const payload = buildMemexResultCardPayload({
            entity: {
                id: 'content-3',
                type: 'web',
                title: 'Drop target',
                url: 'https://memex.garden/drop',
                normalized_url: 'https://memex.garden/drop',
                created_at: 1,
                updated_at: 1,
            },
        })

        expect(
            formatDroppedMemexResultCardCodeBlock(
                serializeMemexResultCardCodeBlock(payload),
            ),
        ).toMatch(/```\n\n$/)
    })

    it('moves the cursor to the end of the inserted blank paragraph', () => {
        expect(
            getEditorPositionAfterInsertedText(
                { line: 5, ch: 0 },
                '```memex-card\n{}\n```\n\n',
            ),
        ).toEqual({
            line: 9,
            ch: 0,
        })
    })

    it('rejects non-card payloads', () => {
        expect(parseMemexResultCardPayload('{"v":1}')).toBeNull()
    })

    it('builds shared Obsidian transfer data with runtime-resolved URLs', () => {
        const annotationEntity = {
            id: 'annotation-1',
            type: 'annotation',
            text: 'Linked note',
            content: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'Linked note',
                            },
                        ],
                    },
                ],
            },
            created_at: 1,
            updated_at: 1,
            tag_ids: [],
        } as SearchResultEntity
        const pageEntity = {
            id: 'page-1',
            type: 'web',
            title: 'Memex',
            url: 'https://memex.garden',
            normalized_url: 'https://memex.garden',
            created_at: 1,
            updated_at: 1,
            tag_ids: [],
        } as SearchResultEntity

        const transferData = buildObsidianResultCardTransferData({
            entity: annotationEntity,
            contentEntitiesById: {
                [annotationEntity.id]: annotationEntity,
                [pageEntity.id]: pageEntity,
            },
            referencesByContentEntityId: {
                [annotationEntity.id]: {
                    contentEntityIds: [pageEntity.id],
                    tagIds: [],
                },
            },
            tagEntitiesById: {},
        })

        expect(transferData.plainText).toBe('https://memex.garden')
        expect(transferData.payload.relatedContentEntities).toEqual([
            pageEntity,
        ])
        expect(transferData.codeBlock).toBe(
            serializeMemexResultCardCodeBlock(transferData.payload),
        )
    })

    it('stores runtime-constructed URLs on serialized entities when they are derivable', () => {
        const tweetEntity = {
            id: 'tweet-1',
            type: 'twitter',
            text: 'Memex tweet',
            author_handle: 'memexuser',
            author_name: 'Memex User',
            media: [],
            created_at: 1,
            updated_at: 1,
            tag_ids: [],
        } as SearchResultEntity

        const transferData = buildObsidianResultCardTransferData({
            entity: tweetEntity,
            contentEntitiesById: {
                [tweetEntity.id]: tweetEntity,
            },
            tagEntitiesById: {},
        })

        expect(transferData.plainText).toBe(
            'https://x.com/memexuser/status/tweet-1',
        )
        expect(transferData.payload.entity.url).toBe(
            'https://x.com/memexuser/status/tweet-1',
        )
    })

    it('drops duplicated host metadata from annotation selectors that point at the root page', () => {
        const selectorEntity = {
            id: 'selector-1',
            type: 'selector',
            selector_type: 'text_selector',
            quote: 'Important line',
            target_id: 'page-1',
            created_at: 1,
            updated_at: 1,
            target_entity: {
                id: 'page-1',
                type: 'web',
                title: 'Root page',
                url: 'https://memex.garden/root',
                normalized_url: 'https://memex.garden/root',
                created_at: 1,
                updated_at: 1,
                full_text: 'Root page body that should not repeat',
            },
        } as SearchResultEntity
        const annotationEntity = {
            id: 'annotation-2',
            type: 'annotation',
            text: 'Annotation text',
            content: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'memex-reference',
                                attrs: { contentId: selectorEntity.id },
                            },
                        ],
                    },
                ],
            },
            created_at: 1,
            updated_at: 1,
            tag_ids: [],
        } as SearchResultEntity
        const pageEntity = {
            id: 'page-1',
            type: 'web',
            title: 'Root page',
            url: 'https://memex.garden/root',
            normalized_url: 'https://memex.garden/root',
            created_at: 1,
            updated_at: 1,
            full_text: 'Root page body that should not repeat',
        } as SearchResultEntity

        const transferData = buildObsidianResultCardTransferData({
            entity: annotationEntity,
            contentEntitiesById: {
                [annotationEntity.id]: annotationEntity,
                [pageEntity.id]: pageEntity,
                [selectorEntity.id]: selectorEntity,
            },
            referencesByContentEntityId: {
                [annotationEntity.id]: {
                    contentEntityIds: [pageEntity.id, selectorEntity.id],
                    tagIds: [],
                },
            },
            tagEntitiesById: {},
        })

        const serializedSelector =
            transferData.payload.relatedContentEntities?.[1]
        expect(serializedSelector).toMatchObject({
            id: selectorEntity.id,
            type: 'selector',
            target_id: pageEntity.id,
        })
        expect(serializedSelector).not.toHaveProperty('target_entity')
    })

    it('keeps only title and url on selector root entities when they point elsewhere', () => {
        const selectorEntity = {
            id: 'selector-2',
            type: 'selector',
            selector_type: 'text_selector',
            quote: 'Cross-page line',
            target_id: 'page-2',
            created_at: 1,
            updated_at: 1,
            target_entity: {
                id: 'page-2',
                type: 'web',
                title: 'Referenced page',
                url: 'https://memex.garden/referenced',
                normalized_url: 'https://memex.garden/referenced',
                created_at: 1,
                updated_at: 1,
                full_text: 'Referenced page body that should not be exported',
            },
        } as SearchResultEntity
        const annotationEntity = {
            id: 'annotation-3',
            type: 'annotation',
            text: 'Cross-page annotation',
            content: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'memex-reference',
                                attrs: { contentId: selectorEntity.id },
                            },
                        ],
                    },
                ],
            },
            created_at: 1,
            updated_at: 1,
            tag_ids: [],
        } as SearchResultEntity
        const rootPageEntity = {
            id: 'page-1',
            type: 'web',
            title: 'Root page',
            url: 'https://memex.garden/root',
            normalized_url: 'https://memex.garden/root',
            created_at: 1,
            updated_at: 1,
            full_text: 'Root page body',
        } as SearchResultEntity
        const referencedPageEntity = {
            id: 'page-2',
            type: 'web',
            title: 'Referenced page',
            url: 'https://memex.garden/referenced',
            normalized_url: 'https://memex.garden/referenced',
            created_at: 1,
            updated_at: 1,
            full_text: 'Referenced page body that should not be exported',
        } as SearchResultEntity

        const transferData = buildObsidianResultCardTransferData({
            entity: annotationEntity,
            contentEntitiesById: {
                [annotationEntity.id]: annotationEntity,
                [rootPageEntity.id]: rootPageEntity,
                [referencedPageEntity.id]: referencedPageEntity,
                [selectorEntity.id]: selectorEntity,
            },
            referencesByContentEntityId: {
                [annotationEntity.id]: {
                    contentEntityIds: [
                        rootPageEntity.id,
                        referencedPageEntity.id,
                        selectorEntity.id,
                    ],
                    tagIds: [],
                },
            },
            tagEntitiesById: {},
        })

        const serializedSelector =
            transferData.payload.relatedContentEntities?.[2]
        expect(serializedSelector).toMatchObject({
            id: selectorEntity.id,
            type: 'selector',
            target_entity: {
                id: referencedPageEntity.id,
                type: 'web',
                title: 'Referenced page',
                url: 'https://memex.garden/referenced',
            },
        })
        expect(serializedSelector).not.toHaveProperty('target_entity.full_text')
        expect(serializedSelector).not.toHaveProperty(
            'target_entity.normalized_url',
        )
    })
})
