import type {
    ContentEntity,
    TagEntity,
} from '@memex/common/features/page-interactions/types'
import { getContentEntityUrl } from '@memex/common/features/page-interactions/utils'
import { getPublicImageUrl } from '@memex/common/utils/image-url'
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

export interface MemexResultCardReferences {
    contentEntityIds: string[]
    tagIds: string[]
}

export interface MemexResultCardTransferData {
    payload: MemexResultCardPayload
    codeBlock: string
    plainText: string
}

function trimNonEmptyString(value: string | undefined | null): string | null {
    const trimmed = value?.trim()
    return trimmed?.length ? trimmed : null
}

function stripSearchMetadataFromEntity(
    entity: SearchResultEntity,
): SearchResultEntity {
    const {
        searchChunkContext: _searchChunkContext,
        searchChunkMatches: _searchChunkMatches,
        ...originalEntity
    } = entity

    return originalEntity
}

function withResolvedEntityUrl<T extends ContentEntity>(
    entity: T,
    resolvedUrl?: string | null,
): T {
    const normalizedUrl = trimNonEmptyString(resolvedUrl)
    if (!normalizedUrl) {
        return entity
    }

    return {
        ...entity,
        url: normalizedUrl,
    } as T
}

export function buildMemexResultCardPayload(params: {
    entity: SearchResultEntity
    snippets?: MemexResultCardSnippet[]
    tagEntities?: TagEntity[]
    relatedContentEntities?: ContentEntity[]
    resolvedEntityUrl?: string | null
}): MemexResultCardPayload {
    return {
        v: 1,
        kind: 'memex-result-card',
        // Obsidian drops should render the saved card, not the transient
        // chunk-match state attached by search responses.
        entity: withResolvedEntityUrl(
            stripSearchMetadataFromEntity(params.entity),
            params.resolvedEntityUrl,
        ),
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

function resolveMemexResultCardEntityUrl(params: {
    entity: ContentEntity
    userId?: string
    contentEntitiesById: Record<string, ContentEntity>
    referencesByContentEntityId?: Record<
        string,
        MemexResultCardReferences | undefined
    >
}): string | null {
    return (
        getContentEntityUrl(params.entity, {
            userId: params.userId,
            getPublicImageUrl,
            getParentEntity: (id) => params.contentEntitiesById[id],
            getRelatedContentIds: (id) =>
                params.referencesByContentEntityId?.[id]?.contentEntityIds,
        }) ?? null
    )
}

export function buildObsidianResultCardTransferData(params: {
    entity: SearchResultEntity
    snippets?: MemexResultCardSnippet[]
    userId?: string
    tagEntitiesById: Record<string, TagEntity>
    contentEntitiesById: Record<string, ContentEntity>
    referencesByContentEntityId?: Record<
        string,
        MemexResultCardReferences | undefined
    >
}): MemexResultCardTransferData {
    const tagEntities = (params.entity.tag_ids ?? [])
        .map((tagId) => params.tagEntitiesById[tagId])
        .filter((tag): tag is TagEntity => tag != null)
    const relatedContentIds =
        params.referencesByContentEntityId?.[params.entity.id]
            ?.contentEntityIds ?? []
    const relatedContentEntities = relatedContentIds
        .map((contentId) => params.contentEntitiesById[contentId])
        .filter(
            (relatedEntity): relatedEntity is ContentEntity =>
                relatedEntity != null,
        )
        .map((relatedEntity) =>
            withResolvedEntityUrl(
                relatedEntity,
                resolveMemexResultCardEntityUrl({
                    entity: relatedEntity,
                    userId: params.userId,
                    contentEntitiesById: params.contentEntitiesById,
                    referencesByContentEntityId:
                        params.referencesByContentEntityId,
                }),
            ),
        )
    const payload = buildMemexResultCardPayload({
        entity: params.entity,
        snippets: params.snippets,
        tagEntities,
        relatedContentEntities,
        resolvedEntityUrl: resolveMemexResultCardEntityUrl({
            entity: params.entity,
            userId: params.userId,
            contentEntitiesById: params.contentEntitiesById,
            referencesByContentEntityId: params.referencesByContentEntityId,
        }),
    })
    const contentEntitiesById = {
        ...Object.fromEntries(
            relatedContentEntities.map((relatedEntity) => [
                relatedEntity.id,
                relatedEntity,
            ]),
        ),
        [payload.entity.id]: payload.entity,
    }
    const plainText =
        resolveMemexResultCardEntityUrl({
            entity: payload.entity,
            userId: params.userId,
            contentEntitiesById,
            referencesByContentEntityId: {
                [payload.entity.id]: {
                    contentEntityIds: relatedContentEntities.map(
                        (relatedEntity) => relatedEntity.id,
                    ),
                    tagIds: [],
                },
            },
        }) ??
        ('title' in payload.entity
            ? trimNonEmptyString(payload.entity.title)
            : null) ??
        payload.entity.id

    return {
        payload,
        codeBlock: serializeMemexResultCardCodeBlock(payload),
        plainText,
    }
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
