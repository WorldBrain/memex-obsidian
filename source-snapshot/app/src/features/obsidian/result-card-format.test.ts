import { describe, expect, it } from 'vitest'
import {
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
})
