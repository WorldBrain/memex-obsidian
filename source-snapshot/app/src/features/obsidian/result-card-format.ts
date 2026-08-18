import type {
    AnnotationEntity,
    ContentEntityReference,
    ContentEntity,
    SelectorEntity,
    TagEntity,
    TweetContentEntity,
} from '@memex/common/features/page-interactions/types'
import {
    getContentEntityReferenceIds,
    toContentEntityReferences,
} from '@memex/common/features/page-interactions/types'
import type { JSONContent } from '@memex/common/types/tiptap-json-content'
import {
    findAnnotationTargetReferenceId,
    getAnnotationReferenceContentIds,
} from '@memex/common/features/annotations/util/reference-content-ids'
import {
    getContentEntityUrl,
    getReferencedContentEntityUrl,
} from '~/utils/page-interactions'
import { getPublicImageUrl } from '~/utils/image-url'
import { formatSecondsToHHMMSS } from '@memex/common/utils/format-time'
import { buildSharedReadPath } from '@memex/common/features/sharing/shared-link-url'
import {
    flattenLocalizedSummaryText,
    flattenLocalizedTranscriptText,
} from '@memex/common/features/youtube/utils/localized-metadata'
import type { SearchResultEntity } from '~/features/search/ui/search-container/logic'
import { getMemexUrl } from '~/utils/memex-url-utils'
import type { ClipboardServiceInterface } from '~/services/clipboard'
import {
    getResultTemplateSetting,
    isResultTemplateContentType,
    renderMarkdownTemplate,
    type ResultTemplateMetadata,
    type ResultTemplateSettings,
} from '@memex/common/features/result-templates'

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
    contentEntityIds: ContentEntityReference[]
    tagIds: string[]
}

export interface MemexResultCardTransferData {
    payload: MemexResultCardPayload
    codeBlock: string
    markdown: string
    plainText: string
    templateMetadata: ResultTemplateMetadata
}

function trimNonEmptyString(value: string | undefined | null): string | null {
    const trimmed = value?.trim()
    return trimmed?.length ? trimmed : null
}

function getTweetQuoteTweetContentId(entity: ContentEntity): string | null {
    if (entity.type !== 'twitter') {
        return null
    }

    return trimNonEmptyString((entity as TweetContentEntity).quote_tweet)
}

function getContentEntityFromCache(params: {
    contentEntitiesById: Record<string, ContentEntity>
    id: string
}): ContentEntity | undefined {
    return (
        params.contentEntitiesById[params.id] ??
        Object.values(params.contentEntitiesById).find(
            (entity) =>
                ('content_id' in entity && entity.content_id === params.id) ||
                ('external_id' in entity && entity.external_id === params.id),
        )
    )
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

function getOptionalEntityTitle(entity: ContentEntity): string | null {
    return 'title' in entity ? trimNonEmptyString(entity.title) : null
}

function resolveResultCardReferenceRootEntity(params: {
    entity: ContentEntity
    contentEntitiesById: Record<string, ContentEntity>
    referencesByContentEntityId?: Record<
        string,
        MemexResultCardReferences | undefined
    >
    visitedIds?: Set<string>
}): ContentEntity | null {
    const visitedIds = params.visitedIds ?? new Set<string>()
    if (visitedIds.has(params.entity.id)) {
        return null
    }
    visitedIds.add(params.entity.id)

    if (params.entity.type === 'selector') {
        const selectorEntity = params.entity as SelectorEntity
        const targetEntity =
            selectorEntity.target_entity ??
            getContentEntityFromCache({
                contentEntitiesById: params.contentEntitiesById,
                id: selectorEntity.target_id,
            })

        if (!targetEntity) {
            return null
        }

        return (
            resolveResultCardReferenceRootEntity({
                ...params,
                entity: targetEntity,
                visitedIds,
            }) ?? targetEntity
        )
    }

    if (params.entity.type === 'annotation') {
        const annotationEntity = params.entity as AnnotationEntity
        const referenceContentIds = getAnnotationReferenceContentIds({
            annotationContent: annotationEntity.content,
            relatedContentIds: getContentEntityReferenceIds(
                params.referencesByContentEntityId?.[annotationEntity.id]
                    ?.contentEntityIds,
            ),
        })
        const rootReferenceId =
            findAnnotationTargetReferenceId({
                annotationContent: annotationEntity.content,
                referenceContentIds,
            }) ?? referenceContentIds[0]

        if (!rootReferenceId) {
            return null
        }

        const rootReferenceEntity = getContentEntityFromCache({
            contentEntitiesById: params.contentEntitiesById,
            id: rootReferenceId,
        })
        if (!rootReferenceEntity) {
            return null
        }

        return (
            resolveResultCardReferenceRootEntity({
                ...params,
                entity: rootReferenceEntity,
                visitedIds,
            }) ?? rootReferenceEntity
        )
    }

    return params.entity
}

function buildMinimalReferenceRootEntity(params: {
    entity: ContentEntity
    resolvedUrl?: string | null
}): ContentEntity {
    const title = getOptionalEntityTitle(params.entity)
    const resolvedUrl =
        trimNonEmptyString(params.resolvedUrl) ??
        trimNonEmptyString(params.entity.url)

    return {
        id: params.entity.id,
        type: params.entity.type,
        ...(title ? { title } : {}),
        ...(resolvedUrl ? { url: resolvedUrl } : {}),
    } as ContentEntity
}

function sanitizeRelatedContentEntityForPayload(params: {
    relatedEntity: ContentEntity
    rootReferenceEntity: ContentEntity | null
    contentEntitiesById: Record<string, ContentEntity>
    referencesByContentEntityId?: Record<
        string,
        MemexResultCardReferences | undefined
    >
    userId?: string
}): ContentEntity {
    const relatedEntityWithResolvedUrl = withResolvedEntityUrl(
        params.relatedEntity,
        resolveMemexResultCardEntityUrl({
            entity: params.relatedEntity,
            userId: params.userId,
            contentEntitiesById: params.contentEntitiesById,
            referencesByContentEntityId: params.referencesByContentEntityId,
        }),
    )

    if (relatedEntityWithResolvedUrl.type !== 'selector') {
        return relatedEntityWithResolvedUrl
    }

    const selectorEntity = {
        ...(relatedEntityWithResolvedUrl as SelectorEntity),
    }
    const selectorRootEntity = resolveResultCardReferenceRootEntity({
        entity: selectorEntity,
        contentEntitiesById: params.contentEntitiesById,
        referencesByContentEntityId: params.referencesByContentEntityId,
    })

    if (
        !selectorRootEntity ||
        selectorRootEntity.id === params.rootReferenceEntity?.id
    ) {
        delete selectorEntity.target_entity
        return selectorEntity
    }

    selectorEntity.target_entity = buildMinimalReferenceRootEntity({
        entity: selectorRootEntity,
        resolvedUrl: resolveMemexResultCardEntityUrl({
            entity: selectorRootEntity,
            userId: params.userId,
            contentEntitiesById: params.contentEntitiesById,
            referencesByContentEntityId: params.referencesByContentEntityId,
        }),
    })

    return selectorEntity
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
                getContentEntityReferenceIds(
                    params.referencesByContentEntityId?.[id]?.contentEntityIds,
                ),
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
    resultTemplateSettings?: ResultTemplateSettings
}): MemexResultCardTransferData {
    const tagEntities = (params.entity.tag_ids ?? [])
        .map((tagId) => params.tagEntitiesById[tagId])
        .filter((tag): tag is TagEntity => tag != null)
    const referencedContentIds = getContentEntityReferenceIds(
        params.referencesByContentEntityId?.[params.entity.id]
            ?.contentEntityIds,
    )
    const rootQuoteTweetContentId = getTweetQuoteTweetContentId(params.entity)
    const quoteTweetContentIds =
        rootQuoteTweetContentId &&
        getContentEntityFromCache({
            contentEntitiesById: params.contentEntitiesById,
            id: rootQuoteTweetContentId,
        })
            ? [rootQuoteTweetContentId]
            : []
    const relatedContentIds = Array.from(
        new Set([...referencedContentIds, ...quoteTweetContentIds]),
    )
    const rootReferenceEntity = resolveResultCardReferenceRootEntity({
        entity: params.entity,
        contentEntitiesById: params.contentEntitiesById,
        referencesByContentEntityId: params.referencesByContentEntityId,
    })
    const relatedContentEntities = relatedContentIds
        .map((contentId) =>
            getContentEntityFromCache({
                contentEntitiesById: params.contentEntitiesById,
                id: contentId,
            }),
        )
        .filter(
            (relatedEntity): relatedEntity is ContentEntity =>
                relatedEntity != null,
        )
        .map((relatedEntity) =>
            sanitizeRelatedContentEntityForPayload({
                relatedEntity,
                rootReferenceEntity,
                userId: params.userId,
                contentEntitiesById: params.contentEntitiesById,
                referencesByContentEntityId: params.referencesByContentEntityId,
            }),
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
                    contentEntityIds: toContentEntityReferences(
                        relatedContentEntities.map(
                            (relatedEntity) => relatedEntity.id,
                        ),
                    ),
                    tagIds: [],
                },
            },
        }) ??
        ('title' in payload.entity
            ? trimNonEmptyString(payload.entity.title)
            : null) ??
        payload.entity.id
    const codeBlock = serializeMemexResultCardCodeBlock(payload)
    const templateMetadata = buildObsidianResultTemplateMetadata(payload, {
        userId: params.userId,
        contentEntitiesById: params.contentEntitiesById,
        referencesByContentEntityId: params.referencesByContentEntityId,
    })
    const contentType = isResultTemplateContentType(payload.entity.type)
        ? payload.entity.type
        : null
    const resultTemplateSetting =
        contentType != null
            ? getResultTemplateSetting(
                  params.resultTemplateSettings ?? {},
                  contentType,
              )
            : null
    const customMarkdown =
        resultTemplateSetting?.mode === 'custom' &&
        resultTemplateSetting.template.trim().length > 0
            ? renderMarkdownTemplate(
                  resultTemplateSetting.template,
                  templateMetadata,
              )
            : null
    const markdown = customMarkdown ?? codeBlock

    return {
        payload,
        codeBlock,
        markdown,
        plainText: customMarkdown ?? plainText,
        templateMetadata,
    }
}

function buildObsidianResultTemplateMetadata(
    payload: MemexResultCardPayload,
    context: {
        userId?: string
        contentEntitiesById: Record<string, ContentEntity>
        referencesByContentEntityId?: Record<
            string,
            MemexResultCardReferences | undefined
        >
    },
): ResultTemplateMetadata {
    const annotationParentUrl =
        payload.entity.type === 'annotation'
            ? trimNonEmptyString(
                  (payload.entity as AnnotationEntity & { url?: string }).url,
              )
            : null
    const annotationMarkdown =
        payload.entity.type === 'annotation'
            ? renderAnnotationContentAsMarkdown({
                  content: (payload.entity as AnnotationEntity).content,
                  ...context,
              })
            : null
    const mediaTranscript = getMediaTranscript(payload.entity)
    const summary = getContentSummary(payload.entity)

    return {
        ...payload.entity,
        ...(annotationMarkdown ? { text: annotationMarkdown } : {}),
        ...(mediaTranscript ? { transcript: mediaTranscript } : {}),
        ...(summary ? { summary } : {}),
        content_id: payload.entity.id,
        content_type: payload.entity.type,
        share_url: getMemexUrl(
            buildSharedReadPath({ contentId: payload.entity.id }),
        ),
        ...(annotationParentUrl ? { parent_url: annotationParentUrl } : {}),
        tags: payload.tagEntities?.map((tag) => tag.name) ?? [],
        tag_entities: payload.tagEntities ?? [],
        related_content_entities: payload.relatedContentEntities ?? [],
        snippets: payload.snippets ?? [],
    }
}

function getContentSummary(entity: SearchResultEntity): string | null {
    const rawSummary = (entity as ContentEntity & { summary?: unknown }).summary
    const directSummary =
        typeof rawSummary === 'string'
            ? rawSummary.trim()
            : flattenLocalizedSummaryText(rawSummary)
    if (directSummary.length > 0) {
        return directSummary
    }

    const media = (entity as ContentEntity & { media?: unknown }).media
    if (!Array.isArray(media)) {
        return null
    }

    const mediaSummary = media
        .filter(
            (mediaEntry): mediaEntry is Record<string, unknown> =>
                typeof mediaEntry === 'object' && mediaEntry != null,
        )
        .map((mediaEntry) => flattenLocalizedSummaryText(mediaEntry.summary))
        .filter((value) => value.length > 0)
        .join('\n\n')

    return mediaSummary.length > 0 ? mediaSummary : null
}

function getMediaTranscript(entity: SearchResultEntity): string | null {
    if (
        entity.type !== 'instagram' &&
        entity.type !== 'tiktok' &&
        entity.type !== 'twitter' &&
        entity.type !== 'youtube' &&
        entity.type !== 'youtubeShorts' &&
        entity.type !== 'reddit'
    ) {
        return null
    }

    const transcript = (entity.media ?? [])
        .filter((mediaEntry) => mediaEntry.type === 'video')
        .map((mediaEntry) =>
            flattenLocalizedTranscriptText(mediaEntry.transcript),
        )
        .filter((value) => value.length > 0)
        .join('\n\n')

    return transcript.length > 0 ? transcript : null
}

function renderAnnotationContentAsMarkdown(params: {
    content: JSONContent
    userId?: string
    contentEntitiesById: Record<string, ContentEntity>
    referencesByContentEntityId?: Record<
        string,
        MemexResultCardReferences | undefined
    >
}): string {
    const renderNode = (
        node: JSONContent,
        isInsideList = false,
        isInlineContext = false,
    ): string => {
        if (node.type === 'text') {
            return node.text ?? ''
        }
        if (node.type === 'hardBreak') {
            return '\n'
        }
        if (
            node.type === 'mention' ||
            node.type === 'memex-reference' ||
            node.type === 'memex-inline-reference' ||
            node.type === 'memex-block-reference'
        ) {
            const reference = renderAnnotationReferenceAsMarkdown(
                node.attrs,
                params,
            )
            const isBlockReference =
                node.type === 'memex-block-reference' ||
                (node.type === 'memex-reference' && !isInlineContext)
            return isBlockReference ? `${reference}\n\n` : reference
        }
        if (node.type === 'paragraph') {
            const paragraph = (node.content ?? [])
                .map((child) => renderNode(child, isInsideList, true))
                .join('')
            return isInsideList ? paragraph : `${paragraph}\n\n`
        }
        if (node.type === 'heading') {
            const level =
                typeof node.attrs?.level === 'number' ? node.attrs.level : 1
            const heading = (node.content ?? [])
                .map((child) => renderNode(child, false, true))
                .join('')
            return `${'#'.repeat(level)} ${heading}\n\n`
        }
        if (node.type === 'bulletList' || node.type === 'orderedList') {
            const isOrdered = node.type === 'orderedList'
            const list = (node.content ?? [])
                .map((item, index) => {
                    const prefix = isOrdered ? `${index + 1}. ` : '* '
                    const body = (item.content ?? [])
                        .map((child) => renderNode(child, true, true))
                        .join('')
                        .trimEnd()
                    return `${prefix}${body.replace(/\n/g, '\n  ')}`
                })
                .join('\n')
            return `${list}\n\n`
        }

        return (node.content ?? [])
            .map((child) => renderNode(child, isInsideList, false))
            .join('')
    }

    return renderNode(params.content)
        .trim()
        .replace(/\n{3,}/g, '\n\n')
}

function renderAnnotationReferenceAsMarkdown(
    attrs: Record<string, unknown> | undefined,
    context: {
        userId?: string
        contentEntitiesById: Record<string, ContentEntity>
        referencesByContentEntityId?: Record<
            string,
            MemexResultCardReferences | undefined
        >
    },
): string {
    const referenceId = pickAnnotationReferenceId(attrs)
    const referenceEntity = referenceId
        ? getContentEntityFromCache({
              contentEntitiesById: context.contentEntitiesById,
              id: referenceId,
          })
        : undefined
    const resolvedEntity = referenceEntity
        ? (resolveResultCardReferenceRootEntity({
              entity: referenceEntity,
              contentEntitiesById: context.contentEntitiesById,
              referencesByContentEntityId: context.referencesByContentEntityId,
          }) ?? referenceEntity)
        : undefined
    const fallbackLabel =
        pickNonEmptyString(attrs?.title) ??
        pickNonEmptyString(attrs?.label) ??
        referenceId ??
        ''
    const baseLabel = resolvedEntity
        ? getAnnotationReferenceTitle(resolvedEntity) || fallbackLabel
        : fallbackLabel
    const timestampLabel = getAnnotationReferenceTimestampLabel(
        referenceEntity,
        attrs,
    )
    const label = timestampLabel
        ? `${baseLabel} (${timestampLabel})`
        : baseLabel
    const url = referenceEntity
        ? (getReferencedContentEntityUrl(referenceEntity, {
              userId: context.userId,
              getPublicImageUrl,
              getParentEntity: (id) =>
                  getContentEntityFromCache({
                      contentEntitiesById: context.contentEntitiesById,
                      id,
                  }),
              getRelatedContentIds: (id) =>
                  getContentEntityReferenceIds(
                      context.referencesByContentEntityId?.[id]
                          ?.contentEntityIds,
                  ),
          }) ?? pickNonEmptyString(attrs?.url))
        : pickNonEmptyString(attrs?.url)

    const videoTimestampRange =
        referenceEntity?.type === 'selector' && url
            ? renderVideoTimestampRange(referenceEntity, url)
            : null
    if (videoTimestampRange) {
        return videoTimestampRange
    }

    if (!url) {
        return label
    }

    const escapedLabel = label
        .replace(/\\/g, '\\\\')
        .replace(/\[/g, '\\[')
        .replace(/]/g, '\\]')
    const escapedUrl = url.replace(/\)/g, '\\)')
    return `[${escapedLabel}](${escapedUrl})`
}

function getAnnotationReferenceTimestampLabel(
    entity: ContentEntity | undefined,
    attrs: Record<string, unknown> | undefined,
): string | null {
    const startTime =
        entity?.type === 'selector' &&
        'start_time' in entity &&
        typeof entity.start_time === 'number'
            ? entity.start_time
            : typeof attrs?.startTime === 'number'
              ? attrs.startTime
              : null
    const endTime =
        entity?.type === 'selector' &&
        'end_time' in entity &&
        typeof entity.end_time === 'number'
            ? entity.end_time
            : typeof attrs?.endTime === 'number'
              ? attrs.endTime
              : null

    if (startTime == null) {
        return null
    }

    const formattedStart = formatSecondsToHHMMSS(startTime)
    return endTime != null && endTime > startTime
        ? `${formattedStart}–${formatSecondsToHHMMSS(endTime)}`
        : formattedStart
}

function renderVideoTimestampRange(
    selector: SelectorEntity,
    startUrl: string,
): string | null {
    if (
        !('start_time' in selector) ||
        !('end_time' in selector) ||
        typeof selector.start_time !== 'number' ||
        !Number.isFinite(selector.start_time) ||
        typeof selector.end_time !== 'number' ||
        !Number.isFinite(selector.end_time)
    ) {
        return null
    }

    const normalizedStart = Math.max(0, Math.floor(selector.start_time))
    const normalizedEnd = Math.max(
        normalizedStart,
        Math.floor(selector.end_time),
    )
    const timestampedStartUrl = setUrlTimestamp(startUrl, normalizedStart)
    const timestampedEndUrl = setUrlTimestamp(startUrl, normalizedEnd)

    return `[${formatSecondsToHHMMSS(normalizedStart)}](${timestampedStartUrl}) - [${formatSecondsToHHMMSS(normalizedEnd)}](${timestampedEndUrl})`
}

function setUrlTimestamp(url: string, timestamp: number): string {
    try {
        const parsedUrl = new URL(url)
        parsedUrl.searchParams.set('t', String(timestamp))
        return parsedUrl.toString()
    } catch {
        const timestampPattern = /([?&])t=[^&]*/
        if (timestampPattern.test(url)) {
            return url.replace(timestampPattern, `$1t=${timestamp}`)
        }
        const separator = url.includes('?') ? '&' : '?'
        return `${url}${separator}t=${timestamp}`
    }
}

function pickAnnotationReferenceId(
    attrs: Record<string, unknown> | undefined,
): string | null {
    return (
        pickNonEmptyString(attrs?.contentId) ??
        pickNonEmptyString(attrs?.content_id) ??
        pickNonEmptyString(attrs?.selectorId) ??
        pickNonEmptyString(attrs?.selector_id) ??
        pickNonEmptyString(attrs?.imageId) ??
        pickNonEmptyString(attrs?.image_id)
    )
}

function pickNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' ? trimNonEmptyString(value) : null
}

function getAnnotationReferenceTitle(entity: ContentEntity): string {
    const candidateValues = [
        'title' in entity ? entity.title : undefined,
        'source_title' in entity ? entity.source_title : undefined,
        'author_name' in entity ? entity.author_name : undefined,
        'text' in entity ? entity.text : undefined,
        'description' in entity ? entity.description : undefined,
    ]

    for (const value of candidateValues) {
        const title = trimNonEmptyString(
            typeof value === 'string' ? value.replace(/\s+/g, ' ') : null,
        )
        if (title) {
            return title
        }
    }

    return entity.id
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
    clipboardService: ClipboardServiceInterface,
): Promise<void> {
    const codeBlock = serializeMemexResultCardCodeBlock(payload)
    await clipboardService.copyText(codeBlock, {
        selectionFallback: 'after-api-unavailable',
    })
}
