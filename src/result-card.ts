import type { App, Plugin } from 'obsidian'

export const MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE = 'memex-card'
export const MEMEX_RESULT_CARD_DRAG_MIME_TYPE =
    'application/x-memex-result-card'

interface BasicContentEntity {
    id: string
    type: string
    title?: string
    url?: string
    text?: string
    permalink?: string
    author_name?: string
    author_handle?: string
    description?: string
}

interface BasicTagEntity {
    id: string
}

type MemexResultCardSnippet =
    | string
    | {
          text: string
          offset: number
      }

export interface MemexResultCardPayload {
    v: 1
    kind: 'memex-result-card'
    entity: BasicContentEntity
    snippets?: MemexResultCardSnippet[]
    tagEntities?: BasicTagEntity[]
    relatedContentEntities?: BasicContentEntity[]
}

export function parseMemexResultCardPayload(
    source: string,
): MemexResultCardPayload | null {
    const trimmed = source.trim()
    if (!trimmed) {
        return null
    }

    try {
        const parsed = JSON.parse(trimmed) as Partial<MemexResultCardPayload>

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
            entity: parsed.entity as BasicContentEntity,
            snippets: Array.isArray(parsed.snippets)
                ? (parsed.snippets as MemexResultCardSnippet[])
                : undefined,
            tagEntities: Array.isArray(parsed.tagEntities)
                ? (parsed.tagEntities as BasicTagEntity[])
                : undefined,
            relatedContentEntities: Array.isArray(
                parsed.relatedContentEntities,
            )
                ? (parsed.relatedContentEntities as BasicContentEntity[])
                : undefined,
        }
    } catch {
        return null
    }
}

export function formatDroppedMemexResultCardCodeBlock(source: string): string {
    return `${source.trimEnd()}\n\n`
}

export function getEditorPositionAfterInsertedText(
    start: { line: number; ch: number },
    insertedText: string,
): { line: number; ch: number } {
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

function getEntityTitle(entity: BasicContentEntity): string {
    return (
        entity.title ||
        entity.text ||
        entity.author_name ||
        entity.author_handle ||
        entity.description ||
        entity.url ||
        entity.id
    )
}

function getEntitySnippet(
    entity: BasicContentEntity,
    snippets?: MemexResultCardSnippet[],
): string | null {
    const snippet = snippets?.find((value) => {
        if (typeof value === 'string') {
            return value.trim().length > 0
        }

        return value.text.trim().length > 0
    })

    if (snippet != null) {
        return typeof snippet === 'string' ? snippet : snippet.text
    }

    return entity.text?.trim() || entity.description?.trim() || null
}

function getEntityUrl(entity: BasicContentEntity): string | null {
    if (entity.url?.trim()) {
        return entity.url
    }

    if (entity.permalink?.trim()) {
        if (
            entity.permalink.startsWith('http://') ||
            entity.permalink.startsWith('https://')
        ) {
            return entity.permalink
        }

        if (entity.type === 'reddit') {
            return `https://www.reddit.com${entity.permalink}`
        }
    }

    return null
}

function createActionButton(
    label: string,
    onClick: () => void,
): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
}

export function renderMemexResultCardBlock(params: {
    app: App
    containerEl: HTMLElement
    plugin: Plugin
    source: string
    onOpenNotes: (params: {
        contentEntityId: string
        title: string
    }) => Promise<void>
}): void {
    const payload = parseMemexResultCardPayload(params.source)
    params.containerEl.replaceChildren()

    if (payload == null) {
        const error = document.createElement('div')
        error.className = 'memex-obsidian-result-card-error'
        error.textContent = 'Invalid Memex result card payload.'
        params.containerEl.appendChild(error)
        return
    }

    const block = document.createElement('div')
    block.className = 'memex-obsidian-result-card-block'

    const card = document.createElement('div')
    card.className = 'memex-obsidian-result-card'

    const header = document.createElement('div')
    header.className = 'memex-obsidian-result-card-header'

    const title = document.createElement('h4')
    title.className = 'memex-obsidian-result-card-title'
    title.textContent = getEntityTitle(payload.entity)

    const meta = document.createElement('div')
    meta.className = 'memex-obsidian-result-card-meta'
    meta.textContent = payload.entity.type

    header.append(title, meta)
    card.appendChild(header)

    const snippet = getEntitySnippet(payload.entity, payload.snippets)
    if (snippet) {
        const body = document.createElement('p')
        body.className = 'memex-obsidian-result-card-snippet'
        body.textContent = snippet
        card.appendChild(body)
    }

    const actions = document.createElement('div')
    actions.className = 'memex-obsidian-result-card-actions'

    const entityUrl = getEntityUrl(payload.entity)
    if (entityUrl) {
        actions.appendChild(
            createActionButton('Open source', () => {
                window.open(entityUrl, '_blank', 'noopener,noreferrer')
            }),
        )
    }

    actions.appendChild(
        createActionButton('Open notes', () => {
            void params.onOpenNotes({
                contentEntityId: payload.entity.id,
                title: getEntityTitle(payload.entity),
            })
        }),
    )

    card.appendChild(actions)
    block.appendChild(card)
    params.containerEl.appendChild(block)
}
