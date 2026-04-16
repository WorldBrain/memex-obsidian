import type {
    ContentEntity,
    TagEntity,
} from '@memex/common/features/page-interactions/types'
import type { SearchResultEntity } from '~/features/search/ui/search-container/logic'

export const MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE = 'memex-card'
export const MEMEX_RESULT_CARD_DRAG_MIME_TYPE =
    'application/x-memex-result-card'

export type MemexResultCardSnippet =
    | string
    | {
          text: string
          offset: number
      }

export interface ObsidianEditorPosition {
    line: number
    ch: number
}

export interface MemexResultCardPayload {
    v: 1
    kind: 'memex-result-card'
    entity: SearchResultEntity
    snippets?: MemexResultCardSnippet[]
    tagEntities?: TagEntity[]
    relatedContentEntities?: ContentEntity[]
}

export function buildMemexResultCardPayload(params: {
    entity: SearchResultEntity
    snippets?: MemexResultCardSnippet[]
    tagEntities?: TagEntity[]
    relatedContentEntities?: ContentEntity[]
}): MemexResultCardPayload {
    return {
        v: 1,
        kind: 'memex-result-card',
        entity: params.entity,
        snippets: params.snippets?.length ? params.snippets : undefined,
        tagEntities: params.tagEntities?.length
            ? params.tagEntities
            : undefined,
        relatedContentEntities: params.relatedContentEntities?.length
            ? params.relatedContentEntities
            : undefined,
    }
}

export function serializeMemexResultCardPayload(
    payload: MemexResultCardPayload,
): string {
    return JSON.stringify(payload, null, 2)
}

export function serializeMemexResultCardCodeBlock(
    payload: MemexResultCardPayload,
): string {
    return [
        `\`\`\`${MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE}`,
        serializeMemexResultCardPayload(payload),
        '```',
    ].join('\n')
}

export function formatDroppedMemexResultCardCodeBlock(source: string): string {
    return `${source.trimEnd()}\n\n`
}

export function getEditorPositionAfterInsertedText(
    start: ObsidianEditorPosition,
    insertedText: string,
): ObsidianEditorPosition {
    const lines = insertedText.split('\n')
    if (lines.length === 1) {
        return {
            line: start.line,
            ch: start.ch + insertedText.length,
        }
    }

    return {
        line: start.line + lines.length - 1,
        ch: lines.at(-1)?.length ?? 0,
    }
}

export function parseMemexResultCardPayload(
    source: string,
): MemexResultCardPayload | null {
    const trimmedSource = source.trim()
    if (trimmedSource.length === 0) {
        return null
    }

    try {
        const parsed = JSON.parse(
            trimmedSource,
        ) as Partial<MemexResultCardPayload>
        if (
            parsed?.v !== 1 ||
            parsed.kind !== 'memex-result-card' ||
            parsed.entity == null ||
            typeof parsed.entity !== 'object' ||
            typeof parsed.entity.id !== 'string' ||
            typeof parsed.entity.type !== 'string'
        ) {
            return null
        }

        return {
            v: 1,
            kind: 'memex-result-card',
            entity: parsed.entity as SearchResultEntity,
            snippets: Array.isArray(parsed.snippets)
                ? (parsed.snippets as MemexResultCardSnippet[])
                : undefined,
            tagEntities: Array.isArray(parsed.tagEntities)
                ? (parsed.tagEntities as TagEntity[])
                : undefined,
            relatedContentEntities: Array.isArray(parsed.relatedContentEntities)
                ? (parsed.relatedContentEntities as ContentEntity[])
                : undefined,
        }
    } catch {
        return null
    }
}

export async function copyMemexResultCardToClipboard(
    payload: MemexResultCardPayload,
): Promise<void> {
    const codeBlock = serializeMemexResultCardCodeBlock(payload)

    if (navigator.clipboard?.writeText != null) {
        await navigator.clipboard.writeText(codeBlock)
        return
    }

    const textarea = document.createElement('textarea')
    textarea.value = codeBlock
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'

    document.body.appendChild(textarea)
    textarea.select()

    const didCopy = document.execCommand('copy')

    document.body.removeChild(textarea)

    if (!didCopy) {
        throw new Error('Clipboard write failed')
    }
}
