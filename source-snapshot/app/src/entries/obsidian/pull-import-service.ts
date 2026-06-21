import type {
    CommonJson,
    CommonSupabaseClient,
} from '@memex/common/storage/supabase-types'
import type { App, TAbstractFile, TFile, Vault } from 'obsidian'
import {
    DEFAULT_MEMEX_IMPORTS_FOLDER,
    DEFAULT_MEMEX_PLUGIN_FOLDER,
    DEFAULT_MEMEX_TEMPLATES_FOLDER,
    DEFAULT_PULL_IMPORT_INTERVAL_MINUTES,
    DEFAULT_PULL_IMPORT_RULE_ID,
    DEFAULT_PULL_IMPORT_SETTINGS,
    DEFAULT_SETTINGS,
    OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE,
    OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS,
    OBSIDIAN_IMPORT_CONTENT_TYPES,
    type MemexObsidianSettings,
    type ObsidianImportContentType,
    type PullImportRuleSettings,
    type PullImportSettings,
} from './pull-import-definitions'

const MAX_POLL_INTERVAL_MINUTES = 24 * 60
const DEFAULT_POLL_LIMIT = 50
const TEMPLATE_PLACEHOLDER_PATTERN = /{{\s*metadata\.([a-zA-Z0-9_.-]+)\s*}}/g
const ANNOTATIONS_SECTION_HEADING = '## Annotations'

type UnknownRecord = Record<string, unknown>

export interface ObsidianPullImportRpcRule {
    ruleId: string
    ruleOrder: number
    contentTypes: ObsidianImportContentType[]
}

export interface ObsidianPullImportRpcItem {
    rule_id: string
    rule_order: number
    content_id: string
    library_id: string
    content_type: ObsidianImportContentType
    updated_at: string
    metadata: UnknownRecord
}

export interface ObsidianPullImportRpcResponse {
    items: ObsidianPullImportRpcItem[]
    next_updated_at: string | null
    blocked_at: string | null
    has_more: boolean
}

export interface PullImportRunResult {
    importedCount: number
    skippedCount: number
    nextUpdatedAt: string | null
    blockedAt: string | null
    hasMore: boolean
    initializedCursor: boolean
}

interface ObsidianPullImportServiceOptions {
    app: App
    supabaseClient: CommonSupabaseClient
    getSettings: () => PullImportSettings
    updateSettings: (settings: PullImportSettings) => Promise<void>
    now?: () => Date
}

export class ObsidianPullImportService {
    private readonly app: App
    private readonly supabaseClient: CommonSupabaseClient
    private readonly getSettings: () => PullImportSettings
    private readonly updateSettings: (
        settings: PullImportSettings,
    ) => Promise<void>
    private readonly now: () => Date
    private isRunning = false

    constructor(options: ObsidianPullImportServiceOptions) {
        this.app = options.app
        this.supabaseClient = options.supabaseClient
        this.getSettings = options.getSettings
        this.updateSettings = options.updateSettings
        this.now = options.now ?? (() => new Date())
    }

    async initialize(): Promise<void> {
        await this.reconcileTemplateLocation()
        await this.ensureDefaultTemplates()
    }

    async runOnce(): Promise<PullImportRunResult> {
        if (this.isRunning) {
            return {
                importedCount: 0,
                skippedCount: 0,
                nextUpdatedAt: this.getSettings().lastFetchedUpdatedAt,
                blockedAt: null,
                hasMore: false,
                initializedCursor: false,
            }
        }

        this.isRunning = true
        try {
            await this.ensureDefaultTemplates()

            const settings = this.getSettings()
            const enabledRules = settings.rules.filter(
                (rule) => rule.enabled && rule.contentTypes.length > 0,
            )

            if (enabledRules.length === 0) {
                return {
                    importedCount: 0,
                    skippedCount: 0,
                    nextUpdatedAt: settings.lastFetchedUpdatedAt,
                    blockedAt: null,
                    hasMore: false,
                    initializedCursor: false,
                }
            }

            if (settings.lastFetchedUpdatedAt == null) {
                const initializedAt = this.now().toISOString()
                await this.updateSettings({
                    ...settings,
                    lastFetchedUpdatedAt: initializedAt,
                })
                return {
                    importedCount: 0,
                    skippedCount: 0,
                    nextUpdatedAt: initializedAt,
                    blockedAt: null,
                    hasMore: false,
                    initializedCursor: true,
                }
            }

            const response = await this.pollImportRpc({
                sinceUpdatedAt: settings.lastFetchedUpdatedAt,
                rules: enabledRules,
            })

            let importedCount = 0
            let skippedCount = 0

            for (const item of response.items) {
                const rule = enabledRules.find(
                    (candidate) => candidate.id === item.rule_id,
                )
                if (rule == null) {
                    continue
                }

                const result = await this.writeImportFile({ item, rule })
                if (result === 'imported') {
                    importedCount += 1
                } else {
                    skippedCount += 1
                }
            }

            if (response.next_updated_at != null) {
                await this.updateSettings({
                    ...this.getSettings(),
                    lastFetchedUpdatedAt: response.next_updated_at,
                })
            }

            return {
                importedCount,
                skippedCount,
                nextUpdatedAt: response.next_updated_at,
                blockedAt: response.blocked_at,
                hasMore: response.has_more,
                initializedCursor: false,
            }
        } finally {
            this.isRunning = false
        }
    }

    async handleVaultRename(
        file: Pick<TAbstractFile, 'path'>,
        oldPath: string,
    ): Promise<boolean> {
        const settings = this.getSettings()
        const normalizedOldPath = normalizePath(oldPath)
        const normalizedNewPath = normalizePath(file.path)

        let changed = false
        const nextRules = settings.rules.map((rule) => {
            const remappedTargetFolder = remapPath({
                currentPath: rule.targetFolderPath,
                oldPath: normalizedOldPath,
                newPath: normalizedNewPath,
            })

            if (remappedTargetFolder === rule.targetFolderPath) {
                return rule
            }

            changed = true
            return {
                ...rule,
                targetFolderPath: remappedTargetFolder,
            }
        })

        const nextPluginFolderPath = remapPath({
            currentPath: settings.pluginFolderPath,
            oldPath: normalizedOldPath,
            newPath: normalizedNewPath,
        })
        const nextTemplatesFolderPath = remapPath({
            currentPath: settings.templatesFolderPath,
            oldPath: normalizedOldPath,
            newPath: normalizedNewPath,
        })

        if (
            nextPluginFolderPath !== settings.pluginFolderPath ||
            nextTemplatesFolderPath !== settings.templatesFolderPath
        ) {
            changed = true
        }

        if (!changed) {
            return false
        }

        await this.updateSettings({
            ...settings,
            pluginFolderPath: nextPluginFolderPath,
            templatesFolderPath: nextTemplatesFolderPath,
            rules: nextRules,
        })
        return true
    }

    async ensureDefaultTemplates(): Promise<void> {
        const settings = this.getSettings()
        await ensureFolder(this.app.vault, settings.pluginFolderPath)
        await ensureFolder(this.app.vault, settings.templatesFolderPath)

        for (const definition of OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS) {
            const templatePath = getTemplatePath(settings, definition.type)
            if (this.app.vault.getAbstractFileByPath(templatePath) != null) {
                continue
            }

            await this.app.vault.create(
                templatePath,
                buildDefaultTemplate(definition.type),
            )
        }
    }

    private async reconcileTemplateLocation(): Promise<void> {
        const settings = this.getSettings()
        if (this.app.vault.getAbstractFileByPath(settings.pluginFolderPath)) {
            return
        }

        if (settings.pluginFolderPath === DEFAULT_MEMEX_PLUGIN_FOLDER) {
            return
        }

        await this.updateSettings({
            ...settings,
            pluginFolderPath: DEFAULT_MEMEX_PLUGIN_FOLDER,
            templatesFolderPath: DEFAULT_MEMEX_TEMPLATES_FOLDER,
            rules: settings.rules.map((rule) => ({
                ...rule,
                targetFolderPath: remapPath({
                    currentPath: rule.targetFolderPath,
                    oldPath: settings.pluginFolderPath,
                    newPath: DEFAULT_MEMEX_PLUGIN_FOLDER,
                }),
            })),
        })
    }

    private async pollImportRpc(params: {
        sinceUpdatedAt: string
        rules: PullImportRuleSettings[]
    }): Promise<ObsidianPullImportRpcResponse> {
        const rpcRules = params.rules.map(
            (rule, index): ObsidianPullImportRpcRule => ({
                ruleId: rule.id,
                ruleOrder: index,
                contentTypes: rule.contentTypes,
            }),
        )

        const { data, error } = await this.supabaseClient.rpc(
            'memex_poll_obsidian_imports',
            {
                p_since_updated_at: params.sinceUpdatedAt,
                p_rules: rpcRules as unknown as CommonJson,
                p_limit: DEFAULT_POLL_LIMIT,
            },
        )

        if (error != null) {
            throw error
        }

        return parseRpcResponse(data)
    }

    private async writeImportFile(params: {
        item: ObsidianPullImportRpcItem
        rule: PullImportRuleSettings
    }): Promise<'imported' | 'skipped'> {
        const rendered = await this.renderImportTemplate(params.item)

        if (params.item.content_type === 'annotation') {
            const parentFile = await this.findAnnotationParentFile(params.item)
            if (parentFile != null) {
                return this.appendAnnotationToParentFile({
                    item: params.item,
                    parentFile,
                    rendered,
                })
            }
        }

        await ensureFolder(this.app.vault, params.rule.targetFolderPath)
        const filePath = getImportFilePath(params)

        if (this.app.vault.getAbstractFileByPath(filePath) != null) {
            return 'skipped'
        }

        await this.app.vault.create(filePath, rendered)
        return 'imported'
    }

    private async renderImportTemplate(
        item: ObsidianPullImportRpcItem,
    ): Promise<string> {
        const templatePath = getTemplatePath(
            this.getSettings(),
            item.content_type,
        )
        if (this.app.vault.getAbstractFileByPath(templatePath) == null) {
            await this.app.vault.create(
                templatePath,
                buildDefaultTemplate(item.content_type),
            )
        }

        const templateFile = this.app.vault.getAbstractFileByPath(
            templatePath,
        ) as TFile | null
        const template =
            templateFile != null
                ? await this.app.vault.read(templateFile)
                : buildDefaultTemplate(item.content_type)
        const rendered = renderTemplate(template, getTemplateMetadata(item))

        return ensureHiddenContentIdMarker(rendered, item.content_id)
    }

    private async findAnnotationParentFile(
        item: ObsidianPullImportRpcItem,
    ): Promise<TFile | null> {
        const parentContentId = getAnnotationParentContentId(item)
        if (parentContentId == null) {
            return null
        }

        return findImportedContentFileByContentId(
            this.app.vault,
            parentContentId,
        )
    }

    private async appendAnnotationToParentFile(params: {
        item: ObsidianPullImportRpcItem
        parentFile: TFile
        rendered: string
    }): Promise<'imported' | 'skipped'> {
        const annotationMarker = getHiddenAnnotationIdMarker(
            params.item.content_id,
            params.item.rule_id,
        )
        let appended = false
        let skipped = false

        await this.app.vault.process(params.parentFile, (data) => {
            if (data.includes(annotationMarker)) {
                skipped = true
                return data
            }

            appended = true
            return appendAnnotationMarkdown({
                document: data,
                annotationMarkdown: buildAnnotationAppendMarkdown({
                    marker: annotationMarker,
                    item: params.item,
                    rendered: params.rendered,
                }),
            })
        })

        return appended && !skipped ? 'imported' : 'skipped'
    }
}

export function normalizeMemexObsidianSettings(
    rawSettings: unknown,
): MemexObsidianSettings {
    const rawRecord = isRecord(rawSettings) ? rawSettings : {}
    return {
        ...DEFAULT_SETTINGS,
        ...rawRecord,
        callbackSecretId: normalizeString(
            rawRecord.callbackSecretId,
            DEFAULT_SETTINGS.callbackSecretId,
        ),
        pullImport: normalizePullImportSettings(rawRecord.pullImport),
    }
}

export function normalizePullImportSettings(
    rawSettings: unknown,
): PullImportSettings {
    const rawRecord = isRecord(rawSettings) ? rawSettings : {}
    const pluginFolderPath = normalizeVaultPath(
        rawRecord.pluginFolderPath,
        DEFAULT_MEMEX_PLUGIN_FOLDER,
    )
    const templatesFolderPath = normalizeVaultPath(
        rawRecord.templatesFolderPath,
        `${pluginFolderPath}/Templates`,
    )
    const rules = normalizeRules(rawRecord.rules)

    return {
        enabled:
            typeof rawRecord.enabled === 'boolean'
                ? rawRecord.enabled
                : DEFAULT_PULL_IMPORT_SETTINGS.enabled,
        pollIntervalMinutes: normalizePollInterval(
            rawRecord.pollIntervalMinutes,
        ),
        lastFetchedUpdatedAt:
            typeof rawRecord.lastFetchedUpdatedAt === 'string' &&
            rawRecord.lastFetchedUpdatedAt.trim().length > 0
                ? rawRecord.lastFetchedUpdatedAt.trim()
                : null,
        pluginFolderPath,
        templatesFolderPath,
        rules,
    }
}

export function createDefaultPullImportRule(
    id = createRuleId(),
): PullImportRuleSettings {
    return {
        id,
        name: 'New import rule',
        enabled: true,
        contentTypes: ['web'],
        targetFolderPath: DEFAULT_MEMEX_IMPORTS_FOLDER,
    }
}

export function buildDefaultTemplate(
    contentType: ObsidianImportContentType,
): string {
    const definition =
        OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE.get(contentType)
    const titlePlaceholder = getPreferredTitlePlaceholder(contentType)
    const placeholderLines = (definition?.placeholders ?? [])
        .map(
            (placeholder) =>
                `- ${placeholder.label}: {{metadata.${placeholder.path}}}`,
        )
        .join('\n')

    return [
        '---',
        'memex_id: "{{metadata.id}}"',
        'memex_content_id: "{{metadata.content_id}}"',
        'memex_library_id: "{{metadata.library_id}}"',
        'memex_type: "{{metadata.type}}"',
        'memex_external_id: "{{metadata.external_id}}"',
        'memex_updated_at: "{{metadata.updated_at}}"',
        '---',
        '',
        '<!-- memex-content-id: {{metadata.content_id}} -->',
        '',
        `# {{metadata.${titlePlaceholder}}}`,
        '',
        'Source: {{metadata.url}}',
        '',
        '## Summary',
        '',
        '{{metadata.summary}}',
        '',
        '## Content',
        '',
        '{{metadata.text}}',
        '',
        '## Metadata',
        '',
        placeholderLines,
        '',
    ].join('\n')
}

export function renderTemplate(
    template: string,
    metadata: UnknownRecord,
): string {
    return template.replace(
        TEMPLATE_PLACEHOLDER_PATTERN,
        (_match, rawPath: string) =>
            stringifyPlaceholderValue(metadata, rawPath),
    )
}

export function getImportFilePath(params: {
    item: Pick<
        ObsidianPullImportRpcItem,
        'content_id' | 'content_type' | 'metadata' | 'rule_id'
    >
    rule: PullImportRuleSettings
}): string {
    const title = getImportTitle(params.item)
    const safeTitle = sanitizeFileNameSegment(title || params.item.content_type)
    const contentId = sanitizeFileNameSegment(params.item.content_id).slice(
        0,
        8,
    )
    const ruleId = sanitizeFileNameSegment(params.item.rule_id).slice(0, 8)
    const fileName = `${safeTitle} - ${contentId}-${ruleId}.md`

    return normalizePath(`${params.rule.targetFolderPath}/${fileName}`)
}

export function getHiddenContentIdMarker(contentId: string): string {
    return `<!-- memex-content-id: ${contentId} -->`
}

function getHiddenAnnotationIdMarker(
    annotationId: string,
    ruleId: string,
): string {
    return `<!-- memex-annotation-id: ${annotationId}; rule-id: ${ruleId} -->`
}

function getTemplateMetadata(item: ObsidianPullImportRpcItem): UnknownRecord {
    return {
        ...item.metadata,
        content_id: item.content_id,
        library_id: item.library_id,
        content_type: item.content_type,
        rule_id: item.rule_id,
        rule_order: item.rule_order,
        import_updated_at: item.updated_at,
    }
}

function ensureHiddenContentIdMarker(
    markdown: string,
    contentId: string,
): string {
    const marker = getHiddenContentIdMarker(contentId)
    if (markdown.includes(marker)) {
        return markdown
    }

    const frontmatterMatch = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
    if (frontmatterMatch == null) {
        return `${marker}\n\n${markdown}`
    }

    const frontmatter = frontmatterMatch[0].trimEnd()
    const body = markdown.slice(frontmatterMatch[0].length).trimStart()
    return `${frontmatter}\n\n${marker}\n\n${body}`
}

async function findImportedContentFileByContentId(
    vault: Vault,
    contentId: string,
): Promise<TFile | null> {
    for (const file of vault.getMarkdownFiles()) {
        const markdown = await vault.read(file)
        if (containsContentIdMarker(markdown, contentId)) {
            return file
        }
    }

    return null
}

function containsContentIdMarker(markdown: string, contentId: string): boolean {
    if (markdown.includes(getHiddenContentIdMarker(contentId))) {
        return true
    }

    const escapedContentId = escapeRegExp(contentId)
    return new RegExp(
        `^memex_(?:content_)?id:\\s*["']?${escapedContentId}["']?\\s*$`,
        'm',
    ).test(markdown)
}

function getAnnotationParentContentId(
    item: ObsidianPullImportRpcItem,
): string | null {
    const value =
        getNestedValue(item.metadata, 'parent_content_id') ??
        getNestedValue(item.metadata, 'target_entity.id')

    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : null
}

function buildAnnotationAppendMarkdown(params: {
    marker: string
    item: ObsidianPullImportRpcItem
    rendered: string
}): string {
    const title = sanitizeMarkdownHeading(getImportTitle(params.item))
    const body = prepareAnnotationBody(params.rendered, params.item.content_id)

    return [
        params.marker,
        `### ${title || 'Annotation'}`,
        '',
        body || stringifyPlaceholderValue(params.item.metadata, 'text'),
    ]
        .join('\n')
        .trim()
}

function prepareAnnotationBody(markdown: string, annotationId: string): string {
    const withoutFrontmatter = stripYamlFrontmatter(markdown)
    const withoutContentMarker = withoutFrontmatter.replace(
        getHiddenContentIdMarker(annotationId),
        '',
    )
    const withoutLeadingTitle = withoutContentMarker.replace(
        /^# [^\n]*(?:\r?\n)+/,
        '',
    )

    return demoteMarkdownHeadings(withoutLeadingTitle).trim()
}

function stripYamlFrontmatter(markdown: string): string {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function demoteMarkdownHeadings(markdown: string): string {
    return markdown.replace(/^(#{1,5})\s+/gm, '$1# ')
}

function appendAnnotationMarkdown(params: {
    document: string
    annotationMarkdown: string
}): string {
    const documentLines = params.document.split(/\r?\n/)
    const headingIndex = documentLines.findIndex(
        (line) => line.trim() === ANNOTATIONS_SECTION_HEADING,
    )

    if (headingIndex < 0) {
        return `${params.document.trimEnd()}\n\n${ANNOTATIONS_SECTION_HEADING}\n\n${params.annotationMarkdown}\n`
    }

    let insertIndex = documentLines.length
    for (
        let index = headingIndex + 1;
        index < documentLines.length;
        index += 1
    ) {
        if (/^#{1,2}\s+/.test(documentLines[index])) {
            insertIndex = index
            break
        }
    }

    const before = documentLines.slice(0, insertIndex).join('\n').trimEnd()
    const after = documentLines.slice(insertIndex).join('\n').trimStart()

    if (after.length === 0) {
        return `${before}\n\n${params.annotationMarkdown}\n`
    }

    return `${before}\n\n${params.annotationMarkdown}\n\n${after}`
}

function sanitizeMarkdownHeading(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/^#+\s*/, '')
        .trim()
        .slice(0, 90)
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeRules(rawRules: unknown): PullImportRuleSettings[] {
    if (!Array.isArray(rawRules)) {
        return DEFAULT_PULL_IMPORT_SETTINGS.rules.map((rule) => ({ ...rule }))
    }

    const rules = rawRules
        .map((rawRule, index) => normalizeRule(rawRule, index))
        .filter((rule): rule is PullImportRuleSettings => rule != null)

    return rules.length > 0
        ? rules
        : DEFAULT_PULL_IMPORT_SETTINGS.rules.map((rule) => ({ ...rule }))
}

function normalizeRule(
    rawRule: unknown,
    index: number,
): PullImportRuleSettings | null {
    if (!isRecord(rawRule)) {
        return null
    }

    const contentTypes = normalizeContentTypes(rawRule.contentTypes)
    return {
        id:
            normalizeString(rawRule.id, '') ||
            (index === 0 ? DEFAULT_PULL_IMPORT_RULE_ID : createRuleId()),
        name: normalizeString(rawRule.name, '') || `Import rule ${index + 1}`,
        enabled: typeof rawRule.enabled === 'boolean' ? rawRule.enabled : true,
        contentTypes,
        targetFolderPath: normalizeVaultPath(
            rawRule.targetFolderPath,
            DEFAULT_MEMEX_IMPORTS_FOLDER,
        ),
    }
}

function normalizeContentTypes(rawValue: unknown): ObsidianImportContentType[] {
    if (!Array.isArray(rawValue)) {
        return ['web']
    }

    const contentTypes = rawValue.filter(
        (value): value is ObsidianImportContentType =>
            typeof value === 'string' &&
            OBSIDIAN_IMPORT_CONTENT_TYPES.includes(
                value as ObsidianImportContentType,
            ),
    )

    return [...new Set(contentTypes)]
}

function normalizePollInterval(rawValue: unknown): number {
    const numericValue =
        typeof rawValue === 'number'
            ? rawValue
            : typeof rawValue === 'string'
              ? Number.parseFloat(rawValue)
              : DEFAULT_PULL_IMPORT_INTERVAL_MINUTES

    if (!Number.isFinite(numericValue)) {
        return DEFAULT_PULL_IMPORT_INTERVAL_MINUTES
    }

    return Math.min(
        MAX_POLL_INTERVAL_MINUTES,
        Math.max(1, Math.round(numericValue)),
    )
}

function normalizeVaultPath(rawValue: unknown, fallback: string): string {
    return normalizePath(normalizeString(rawValue, fallback) || fallback)
}

function normalizeString(rawValue: unknown, fallback: string): string {
    return typeof rawValue === 'string' ? rawValue.trim() : fallback
}

async function ensureFolder(vault: Vault, folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath)
    const segments = normalizedPath.split('/').filter(Boolean)
    let currentPath = ''

    for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment

        if (vault.getAbstractFileByPath(currentPath) != null) {
            continue
        }

        await vault.createFolder(currentPath)
    }
}

function getTemplatePath(
    settings: PullImportSettings,
    contentType: ObsidianImportContentType,
): string {
    return normalizePath(`${settings.templatesFolderPath}/${contentType}.md`)
}

function parseRpcResponse(rawResponse: unknown): ObsidianPullImportRpcResponse {
    const response = isRecord(rawResponse) ? rawResponse : {}
    const rawItems = Array.isArray(response.items) ? response.items : []

    return {
        items: rawItems
            .map(parseRpcItem)
            .filter((item): item is ObsidianPullImportRpcItem => item != null),
        next_updated_at:
            typeof response.next_updated_at === 'string'
                ? response.next_updated_at
                : null,
        blocked_at:
            typeof response.blocked_at === 'string'
                ? response.blocked_at
                : null,
        has_more:
            typeof response.has_more === 'boolean' ? response.has_more : false,
    }
}

function parseRpcItem(rawItem: unknown): ObsidianPullImportRpcItem | null {
    if (!isRecord(rawItem)) {
        return null
    }

    if (
        typeof rawItem.rule_id !== 'string' ||
        typeof rawItem.rule_order !== 'number' ||
        typeof rawItem.content_id !== 'string' ||
        typeof rawItem.library_id !== 'string' ||
        typeof rawItem.content_type !== 'string' ||
        typeof rawItem.updated_at !== 'string' ||
        !OBSIDIAN_IMPORT_CONTENT_TYPES.includes(
            rawItem.content_type as ObsidianImportContentType,
        )
    ) {
        return null
    }

    return {
        rule_id: rawItem.rule_id,
        rule_order: rawItem.rule_order,
        content_id: rawItem.content_id,
        library_id: rawItem.library_id,
        content_type: rawItem.content_type as ObsidianImportContentType,
        updated_at: rawItem.updated_at,
        metadata: isRecord(rawItem.metadata) ? rawItem.metadata : {},
    }
}

function stringifyPlaceholderValue(
    metadata: UnknownRecord,
    path: string,
): string {
    const value = getNestedValue(metadata, path)

    if (value == null) {
        return ''
    }

    if (Array.isArray(value)) {
        const hasOnlyScalarValues = value.every(
            (entry) => entry == null || typeof entry !== 'object',
        )
        return hasOnlyScalarValues
            ? value.filter((entry) => entry != null).join(', ')
            : JSON.stringify(value)
    }

    if (typeof value === 'object') {
        return JSON.stringify(value)
    }

    return String(value)
}

function getNestedValue(metadata: UnknownRecord, path: string): unknown {
    return path.split('.').reduce<unknown>((currentValue, segment) => {
        if (!isRecord(currentValue)) {
            return undefined
        }

        return currentValue[segment]
    }, metadata)
}

function getPreferredTitlePlaceholder(
    contentType: ObsidianImportContentType,
): string {
    switch (contentType) {
        case 'twitter':
        case 'facebook':
        case 'linkedin':
        case 'reddit':
        case 'annotation':
            return 'text'
        case 'image':
        case 'tiktok':
            return 'description'
        case 'twitterProfile':
            return 'author_name'
        default:
            return 'title'
    }
}

function getImportTitle(
    item: Pick<ObsidianPullImportRpcItem, 'content_type' | 'metadata'>,
): string {
    const preferredPath = getPreferredTitlePlaceholder(item.content_type)
    const preferred = getNestedValue(item.metadata, preferredPath)
    if (typeof preferred === 'string' && preferred.trim()) {
        return preferred.trim()
    }

    for (const path of [
        'title',
        'text',
        'description',
        'source_title',
        'url',
    ]) {
        const value = getNestedValue(item.metadata, path)
        if (typeof value === 'string' && value.trim()) {
            return value.trim()
        }
    }

    return item.content_type
}

function sanitizeFileNameSegment(value: string): string {
    const sanitized = value
        .replace(/[\\/:*?"<>|#[\]^]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '')

    return (sanitized || 'Memex import').slice(0, 90)
}

function remapPath(params: {
    currentPath: string
    oldPath: string
    newPath: string
}): string {
    const currentPath = normalizePath(params.currentPath)
    const oldPath = normalizePath(params.oldPath)
    const newPath = normalizePath(params.newPath)

    if (currentPath === oldPath) {
        return newPath
    }

    if (currentPath.startsWith(`${oldPath}/`)) {
        return normalizePath(
            `${newPath}/${currentPath.slice(oldPath.length + 1)}`,
        )
    }

    return currentPath
}

function createRuleId(): string {
    const randomValue =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `rule-${randomValue}`
}

function isRecord(value: unknown): value is UnknownRecord {
    return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizePath(path: string): string {
    return path
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/|\/$/g, '')
}
