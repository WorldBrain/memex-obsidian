import React from 'react'
import type {
    AnnotationEntity,
    ContentEntity,
    PageEntity,
    RedditContentEntity,
    TagEntity,
    TweetContentEntity,
    TwitterProfileContentEntity,
} from '@memex/common/features/page-interactions/types'
import { getContentEntityUrl } from '@memex/common/features/page-interactions/utils'
import { findAnnotationTargetReferenceId } from '@memex/common/features/annotations/util/reference-content-ids'
import { parseMemexResultCardPayload } from '~/features/obsidian/result-card-format'
import { UniversalResultCard } from '~/features/search/ui/result-cards'
import { getAnnotationTitle } from '~/features/search/ui/utils/safe-content'
import { ExtUIContext, useUIContext } from '~/ui-scripts/context-provider'
import { ObsidianRuntime, ObsidianRuntimeProvider } from './runtime'

const PayloadScopedContext: React.FC<
    React.PropsWithChildren<{
        entity: ContentEntity
        tagEntities?: TagEntity[]
        relatedContentEntities?: ContentEntity[]
    }>
> = ({ entity, tagEntities, relatedContentEntities, children }) => {
    const context = useUIContext()

    const scopedContext = React.useMemo(() => {
        const mergedContentEntities = {
            ...(context.globalState.contentEntities ?? {}),
            [entity.id]: entity,
        }

        for (const relatedEntity of relatedContentEntities ?? []) {
            mergedContentEntities[relatedEntity.id] = relatedEntity
        }

        const mergedTagEntities = {
            ...(context.globalState.tags?.tagEntities ?? {}),
        }

        for (const tagEntity of tagEntities ?? []) {
            mergedTagEntities[tagEntity.id] = tagEntity
        }

        return {
            ...context,
            globalState: {
                ...context.globalState,
                contentEntities: mergedContentEntities,
                tags: {
                    ...(context.globalState.tags ?? {}),
                    tagEntities: mergedTagEntities,
                },
            },
        }
    }, [context, entity, relatedContentEntities, tagEntities])

    return (
        <ExtUIContext.Provider value={scopedContext}>
            {children}
        </ExtUIContext.Provider>
    )
}

const getEntityTitle = (entity: ContentEntity): string => {
    if (entity.type === 'annotation') {
        return getAnnotationTitle(entity as AnnotationEntity)
    }

    if (
        entity.type === 'web' ||
        entity.type === 'pdf' ||
        entity.type === 'youtube'
    ) {
        return (entity as PageEntity).title || (entity as PageEntity).url
    }

    if (entity.type === 'twitter' || entity.type === 'reddit') {
        return (entity as TweetContentEntity | RedditContentEntity).text
    }

    if (entity.type === 'twitterProfile') {
        return (
            (entity as TwitterProfileContentEntity).author_name ||
            (entity as TwitterProfileContentEntity).description ||
            (entity as TwitterProfileContentEntity).author_handle ||
            entity.id
        )
    }

    return entity.id
}

const RenderedResultCard: React.FC<{
    entity: ContentEntity
    snippets?: Array<string | { text: string; offset: number }>
    onOpenNotes: (params: {
        contentEntityId: string
        title: string
    }) => Promise<void>
}> = ({ entity, snippets, onOpenNotes }) => {
    const context = useUIContext()
    const url = React.useMemo(
        () =>
            getContentEntityUrl(entity, {
                userId: context.globalState.user?.id,
                getParentEntity: (id) =>
                    context.globalState.contentEntities[id] as
                        | ContentEntity
                        | undefined,
            }) ?? null,
        [
            context.globalState.contentEntities,
            context.globalState.user?.id,
            entity,
        ],
    )
    const notesTargetContentId = React.useMemo(() => {
        if (entity.type !== 'annotation') {
            return entity.id
        }

        return (
            findAnnotationTargetReferenceId({
                annotationContent: (entity as AnnotationEntity).content,
                referenceContentIds: (entity as AnnotationEntity)
                    .reference_content_ids,
            }) ??
            (entity as AnnotationEntity).reference_content_ids?.[0] ??
            entity.id
        )
    }, [entity])
    const notesTargetEntity = React.useMemo(
        () =>
            context.globalState.contentEntities[notesTargetContentId] ?? entity,
        [context.globalState.contentEntities, entity, notesTargetContentId],
    )
    const notesTargetTitle = React.useMemo(
        () => getEntityTitle(notesTargetEntity),
        [notesTargetEntity],
    )

    const handleOpen = React.useCallback(() => {
        if (!url) {
            return
        }

        window.open(url, '_blank', 'noopener,noreferrer')
    }, [url])

    const handleOpenNotes = React.useCallback(async () => {
        await onOpenNotes({
            contentEntityId: notesTargetContentId,
            title: notesTargetTitle,
        })
    }, [notesTargetContentId, notesTargetTitle, onOpenNotes])

    const handleCardClick = React.useCallback(
        (event?: React.MouseEvent) => {
            if (event?.shiftKey) {
                void handleOpenNotes()
                return
            }

            handleOpen()
        },
        [handleOpen, handleOpenNotes],
    )

    return (
        <div
            className="memex-obsidian-result-card-block memex-obsidian-result-card-block-clickable"
            title={
                url
                    ? 'Click to open original document. Shift+click to open notes in Memex sidebar.'
                    : 'Shift+click to open notes in Memex sidebar.'
            }
        >
            <UniversalResultCard
                entity={entity}
                snippets={snippets}
                disableActions
                onClick={handleCardClick}
            />
        </div>
    )
}

export const ObsidianResultCardBlock: React.FC<{
    runtime: ObsidianRuntime
    source: string
    onOpenNotes: (params: {
        contentEntityId: string
        title: string
    }) => Promise<void>
}> = ({ runtime, source, onOpenNotes }) => {
    const payload = React.useMemo(
        () => parseMemexResultCardPayload(source),
        [source],
    )

    if (payload == null) {
        return (
            <div className="memex-obsidian-result-card-error">
                Invalid Memex result card payload.
            </div>
        )
    }

    return (
        <ObsidianRuntimeProvider runtime={runtime}>
            <PayloadScopedContext
                entity={payload.entity}
                tagEntities={payload.tagEntities}
                relatedContentEntities={payload.relatedContentEntities}
            >
                <RenderedResultCard
                    entity={payload.entity}
                    snippets={payload.snippets}
                    onOpenNotes={onOpenNotes}
                />
            </PayloadScopedContext>
        </ObsidianRuntimeProvider>
    )
}
