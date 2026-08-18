import type { CommonSupabaseClient } from '@memex/common/storage/supabase-types'
import type { ChatMessageEntity } from '@memex/common/features/page-interactions/types'
import { isChatMessageEntity } from '@memex/common/features/ai-chat/utils/chat-thread-messages'
import { formatSecondsToHHMMSS } from '@memex/common/utils/format-time'
import { buildSharedReadPath } from '@memex/common/features/sharing/shared-link-url'
import {
    flattenLocalizedSummaryText,
    flattenLocalizedTranscriptText,
} from '@memex/common/features/youtube/utils/localized-metadata'
import type { App, TAbstractFile, TFile } from 'obsidian'
import { getLatestAssistantMessageMarkdown } from '~/features/agent-chat/utils/assistant-message-markdown'
import {
    getTemplateNestedValue as getNestedValue,
    renderMarkdownTemplate,
    stringifyTemplatePlaceholderValue,
} from '@memex/common/features/result-templates'
import {
    DEFAULT_MEMEX_IMPORTS_FOLDER,
    DEFAULT_MEMEX_PLUGIN_FOLDER,
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
    type TemplatePlaceholderDefinition,
} from './pull-import-definitions'
import { getMemexUrl } from '~/utils/memex-url-utils'
import {
    ObsidianPullImportStorage,
    type ObsidianPullImportStorageInterface,
    type ObsidianPullImportStorageRule,
} from './storage/pull-import'
import {
    ObsidianVaultStorage,
    type ObsidianVaultStorageInterface,
} from './storage/vault'
import {
    ObsidianTimerService,
    type ObsidianTimerServiceInterface,
} from '~/features/obsidian/services/timer'

const MAX_POLL_INTERVAL_MINUTES = 24 * 60
const DEFAULT_POLL_LIMIT = 50
const ANNOTATIONS_SECTION_HEADING = '## Annotations'
const AUTH_REQUIRED_MESSAGE =
    'You are not logged in to Memex. Log in to continue Obsidian pull imports.'

type UnknownRecord = Record<string, unknown>

type SupabaseRpcErrorLike = {
    code?: unknown
    message?: unknown
}

export class ObsidianPullImportAuthRequiredError extends Error {
    readonly originalError?: unknown

    constructor(originalError?: unknown) {
        super(AUTH_REQUIRED_MESSAGE)
        this.name = 'ObsidianPullImportAuthRequiredError'
        this.originalError = originalError
    }
}

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

interface ObsidianPullImportLogicOptions {
    storage: ObsidianPullImportStorageInterface
    vaultStorage: ObsidianVaultStorageInterface
    timerService: ObsidianTimerServiceInterface
    getSettings: () => PullImportSettings
    updateSettings: (settings: PullImportSettings) => Promise<void>
    now?: () => Date
}

export class ObsidianPullImportLogic {
    private readonly storage: ObsidianPullImportStorageInterface
    private readonly vaultStorage: ObsidianVaultStorageInterface
    private readonly timerService: ObsidianTimerServiceInterface
    private readonly getSettings: () => PullImportSettings
    private readonly updateSettings: (
        settings: PullImportSettings,
    ) => Promise<void>
    private readonly now: () => Date
    private isRunning = false
    private pollingIntervalId: number | null = null

    constructor(options: ObsidianPullImportLogicOptions) {
        this.storage = options.storage
        this.vaultStorage = options.vaultStorage
        this.timerService = options.timerService
        this.getSettings = options.getSettings
        this.updateSettings = options.updateSettings
        this.now = options.now ?? (() => new Date())
    }

    async initialize(): Promise<void> {
        await this.ensureDefaultTemplates()
    }

    configurePolling(onPoll: () => void): number | null {
        this.stopPolling()

        const settings = this.getSettings()
        if (!settings.enabled) {
            return null
        }

        const intervalMs = Math.max(1, settings.pollIntervalMinutes) * 60_000
        this.pollingIntervalId = this.timerService.scheduleRepeating(
            onPoll,
            intervalMs,
        )
        return this.pollingIntervalId
    }

    stopPolling(): void {
        if (this.pollingIntervalId == null) {
            return
        }

        this.timerService.cancel(this.pollingIntervalId)
        this.pollingIntervalId = null
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
        await this.vaultStorage.ensureFolder(settings.pluginFolderPath)
        await this.vaultStorage.ensureFolder(settings.templatesFolderPath)

        for (const definition of OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS) {
            const templatePath = getTemplatePath(settings, definition.type)
            const existingTemplate = this.vaultStorage.getFile(templatePath)
            if (existingTemplate != null) {
                if (this.vaultStorage.isMarkdownFile(existingTemplate)) {
                    await this.upgradeGeneratedDefaultTemplate({
                        templateFile: existingTemplate,
                        contentType: definition.type,
                    })
                }
                continue
            }

            await this.vaultStorage.createFile(
                templatePath,
                buildDefaultTemplate(definition.type),
            )
        }
    }

    private async upgradeGeneratedDefaultTemplate(params: {
        templateFile: TFile
        contentType: ObsidianImportContentType
    }): Promise<void> {
        const currentTemplate = await this.vaultStorage.readFile(
            params.templateFile,
        )
        const generatedTemplatesToUpgrade =
            getGeneratedDefaultTemplatesToUpgrade(params.contentType)

        if (!generatedTemplatesToUpgrade.includes(currentTemplate.trim())) {
            return
        }

        await this.vaultStorage.processFile(params.templateFile, () =>
            buildDefaultTemplate(params.contentType),
        )
    }

    private async pollImportRpc(params: {
        sinceUpdatedAt: string
        rules: PullImportRuleSettings[]
    }): Promise<ObsidianPullImportRpcResponse> {
        const rpcRules = params.rules.map(
            (rule, index): ObsidianPullImportStorageRule => ({
                ruleId: rule.id,
                ruleOrder: index,
                contentTypes: rule.contentTypes,
            }),
        )

        let data: unknown
        try {
            data = await this.storage.pollImports({
                sinceUpdatedAt: params.sinceUpdatedAt,
                rules: rpcRules,
                limit: DEFAULT_POLL_LIMIT,
            })
        } catch (error) {
            if (isPullImportAuthRequiredRpcError(error)) {
                throw new ObsidianPullImportAuthRequiredError(error)
            }
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

        await this.vaultStorage.ensureFolder(params.rule.targetFolderPath)
        const filePath = getImportFilePath(params)

        if (this.vaultStorage.getFile(filePath) != null) {
            return 'skipped'
        }

        await this.vaultStorage.createFile(filePath, rendered)
        return 'imported'
    }

    private async renderImportTemplate(
        item: ObsidianPullImportRpcItem,
    ): Promise<string> {
        const templatePath = getTemplatePath(
            this.getSettings(),
            item.content_type,
        )
        if (this.vaultStorage.getFile(templatePath) == null) {
            await this.vaultStorage.createFile(
                templatePath,
                buildDefaultTemplate(item.content_type),
            )
        }

        const abstractTemplateFile = this.vaultStorage.getFile(templatePath)
        const templateFile =
            abstractTemplateFile != null &&
            this.vaultStorage.isMarkdownFile(abstractTemplateFile)
                ? abstractTemplateFile
                : null
        const template =
            templateFile != null
                ? await this.vaultStorage.readFile(templateFile)
                : buildDefaultTemplate(item.content_type)
        const metadata = await this.getTemplateMetadata(item)
        const rendered = renderTemplate(template, metadata)

        return ensureHiddenContentIdMarker(rendered, item.content_id)
    }

    private async getTemplateMetadata(
        item: ObsidianPullImportRpcItem,
    ): Promise<UnknownRecord> {
        const baseMetadata = getTemplateMetadata(item)
        const tagNames = await this.loadTemplateTagNames(baseMetadata)
        const annotationParentUrl =
            item.content_type === 'annotation'
                ? getAnnotationParentUrl(baseMetadata)
                : null
        const mediaTranscript = getMediaTranscript(
            item.content_type,
            baseMetadata,
        )
        const summary = getContentSummary(baseMetadata)
        const metadata = {
            ...baseMetadata,
            ...(annotationParentUrl ? { parent_url: annotationParentUrl } : {}),
            share_url: getMemexUrl(
                buildSharedReadPath({ contentId: item.content_id }),
            ),
            ...(mediaTranscript ? { transcript: mediaTranscript } : {}),
            ...(summary ? { summary } : {}),
            published: formatTimestampText(baseMetadata.published_at),
            tags: tagNames,
            tag_names: tagNames,
        }

        if (item.content_type !== 'audioRecording') {
            return metadata
        }

        const fullMetadata = await this.loadContentEntityMetadata(
            item.content_id,
        )
        if (fullMetadata == null) {
            throw new Error(
                `Missing audio recording metadata for Obsidian import ${item.content_id}`,
            )
        }

        const summaryMarkdown =
            await this.loadAudioRecordingSummaryMarkdown(fullMetadata)
        const transcriptMarkdown =
            buildAudioRecordingTranscriptMarkdown(fullMetadata)

        return {
            ...fullMetadata,
            ...metadata,
            duration: getAudioRecordingDurationText(fullMetadata),
            summary: summaryMarkdown,
            summary_markdown: summaryMarkdown,
            transcript: transcriptMarkdown,
            transcript_markdown: transcriptMarkdown,
        }
    }

    private async loadTemplateTagNames(
        metadata: UnknownRecord,
    ): Promise<string[]> {
        const existingTagNames = normalizeStringArray(metadata.tags)
        if (existingTagNames.length > 0) {
            return existingTagNames
        }

        const tagIds = normalizeStringArray(metadata.tag_ids)
        if (tagIds.length === 0) {
            return []
        }

        return this.storage.loadTagNames(tagIds)
    }

    private async loadAudioRecordingSummaryMarkdown(
        audioMetadata: UnknownRecord,
    ): Promise<string> {
        const summaryThreadId = getAudioRecordingSummaryThreadId(audioMetadata)
        if (summaryThreadId == null) {
            return getAudioRecordingInlineSummaryText(audioMetadata)
        }

        const summaryThreadMetadata =
            await this.loadContentEntityMetadata(summaryThreadId)
        if (summaryThreadMetadata == null) {
            throw new Error(
                `Missing audio summary thread metadata for Obsidian import ${summaryThreadId}`,
            )
        }

        return (
            getLatestAssistantMessageMarkdown(
                getChatThreadMessages(summaryThreadMetadata),
            ) ?? getAudioRecordingInlineSummaryText(audioMetadata)
        )
    }

    private async loadContentEntityMetadata(
        contentId: string,
    ): Promise<UnknownRecord | null> {
        return this.storage.loadContentEntityMetadata(contentId)
    }

    private async findAnnotationParentFile(
        item: ObsidianPullImportRpcItem,
    ): Promise<TFile | null> {
        const parentContentId = getAnnotationParentContentId(item)
        if (parentContentId == null) {
            return null
        }

        return this.vaultStorage.findMarkdownFile({
            matches: (markdown) =>
                containsContentIdMarker(markdown, parentContentId),
        })
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

        await this.vaultStorage.processFile(params.parentFile, (data) => {
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

interface ObsidianPullImportServiceOptions {
    app: App
    supabaseClient: CommonSupabaseClient
    getSettings: () => PullImportSettings
    updateSettings: (settings: PullImportSettings) => Promise<void>
    now?: () => Date
}

/**
 * Compatibility composition adapter for callers that still construct the old
 * entry-local service. Production composition uses ObsidianPullImportLogic.
 */
export class ObsidianPullImportService extends ObsidianPullImportLogic {
    constructor(options: ObsidianPullImportServiceOptions) {
        super({
            storage: new ObsidianPullImportStorage(options.supabaseClient),
            vaultStorage: new ObsidianVaultStorage(options.app),
            timerService: new ObsidianTimerService(),
            getSettings: options.getSettings,
            updateSettings: options.updateSettings,
            now: options.now,
        })
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
    return buildContentFirstDefaultTemplate(contentType)
}

function getGeneratedDefaultTemplatesToUpgrade(
    contentType: ObsidianImportContentType,
): string[] {
    const templates = [buildLegacyDefaultTemplate(contentType).trim()]

    if (contentType === 'audioRecording') {
        templates.push(
            buildLegacyAudioRecordingDefaultTemplate().trim(),
            buildMetadataDumpAudioRecordingDefaultTemplate().trim(),
        )
    }

    return [...new Set(templates)]
}

function buildContentFirstDefaultTemplate(
    contentType: ObsidianImportContentType,
): string {
    switch (contentType) {
        case 'web':
        case 'substack':
        case 'chatgpt':
        case 'claude':
            return buildTemplate([
                '# {{title}}',
                '',
                'Source: {{url}}',
                'Author: {{author}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Summary',
                '',
                '{{summary}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'pdf':
            return buildTemplate([
                '# {{title}}',
                '',
                'Source: {{url}}',
                'Authors: {{authors}}',
                'Published: {{published}}',
                'Pages: {{page_count}}',
                'Tags: {{tags}}',
                '',
                '## Abstract',
                '',
                '{{abstract}}',
                '',
                '## Known Sources',
                '',
                '{{source_urls}}',
            ])
        case 'youtube':
        case 'youtubeShorts':
            return buildTemplate([
                '# {{title}}',
                '',
                'Source: {{url}}',
                'Channel: {{channel_title}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Summary',
                '',
                '{{summary}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'twitter':
            return buildTemplate([
                '# {{author_name}}',
                '',
                'Source: {{url}}',
                'Author: {{author_name}} {{author_handle}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Post',
                '',
                '{{text}}',
                '',
                '## Quoted Post',
                '',
                '{{quote_tweet}}',
            ])
        case 'rssFeed':
            return buildTemplate([
                '# {{title}}',
                '',
                'Feed: {{feed_url}}',
                'Site: {{site_url}}',
                'Author: {{author_name}}',
                'Platform: {{source_platform}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'instagram':
        case 'pinterest':
        case 'snapchat':
            return buildTemplate([
                '# {{title}}',
                '',
                'Source: {{url}}',
                'Author: {{author_name}} {{author_handle}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Text',
                '',
                '{{text}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'tiktok':
            return buildTemplate([
                '# {{author.nickname}}',
                '',
                'Source: {{url}}',
                'Author: {{author.nickname}} {{author.uniqueId}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'facebook':
            return buildTemplate([
                '# {{author_name}}',
                '',
                'Source: {{url}}',
                'Author: {{author_name}} {{author_handle}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Post',
                '',
                '{{text}}',
            ])
        case 'linkedin':
            return buildTemplate([
                '# LinkedIn post',
                '',
                'Source: {{url}}',
                'Author: {{author_name}} {{author_handle}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Post',
                '',
                '{{text}}',
            ])
        case 'linkedinProfile':
            return buildTemplate([
                '# {{author_name}}',
                '',
                'Source: {{url}}',
                'Handle: {{author_handle}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'reddit':
            return buildTemplate([
                '# {{title}}',
                '',
                'Source: {{url}}',
                'Subreddit: {{subreddit_name}}',
                'Author: {{author_name}} {{author_handle}}',
                'Score: {{score}}',
                'Published: {{published}}',
                'Tags: {{tags}}',
                '',
                '## Post',
                '',
                '{{text}}',
            ])
        case 'annotation':
            return buildTemplate([
                '# {{target_entity.title}}',
                '',
                'Source: {{target_entity.url}}',
                'Tags: {{tags}}',
                '',
                '## Annotation',
                '',
                '{{text}}',
            ])
        case 'image':
            return buildTemplate([
                '# {{source_title}}',
                '',
                'Source: {{source_url}}',
                'Image: {{original_url}}',
                'MIME type: {{mime_type}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'transcribedMedia':
            return buildTemplate([
                '# {{title}}',
                '',
                'Source: {{url}}',
                'Tags: {{tags}}',
                '',
                '## Summary',
                '',
                '{{summary}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'audioRecording':
            return buildTemplate([
                '# {{title}}',
                '',
                'Duration: {{duration}}',
                'Tags: {{tags}}',
                '',
                '## Summary',
                '',
                '{{summary}}',
                '',
                '## Transcript',
                '',
                '{{transcript}}',
            ])
        case 'chatThread':
            return buildTemplate([
                '# {{title}}',
                '',
                'Model: {{model_name}}',
                'Tags: {{tags}}',
                '',
                '## Summary',
                '',
                '{{summary}}',
            ])
        case 'twitterProfile':
            return buildTemplate([
                '# {{author_name}}',
                '',
                'Handle: {{author_handle}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
                '',
                '## Links',
                '',
                '{{bio_links}}',
            ])
        case 'subreddit':
            return buildTemplate([
                '# {{title}}',
                '',
                'Display name: {{display_name}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'youtubeChannel':
            return buildTemplate([
                '# {{title}}',
                '',
                'Handle: {{channel_handle}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'book':
            return buildTemplate([
                '# {{title}}',
                '',
                'Subtitle: {{subtitle}}',
                'Authors: {{authors}}',
                'Publisher: {{publisher}}',
                'Published: {{published}}',
                'Pages: {{page_count}}',
                'Language: {{language}}',
                'Categories: {{categories}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        case 'audiobook':
            return buildTemplate([
                '# {{title}}',
                '',
                'Subtitle: {{subtitle}}',
                'Authors: {{authors}}',
                'Narrators: {{narrators}}',
                'Publisher: {{publisher}}',
                'Published: {{published}}',
                'Language: {{language}}',
                'Categories: {{categories}}',
                'Tags: {{tags}}',
                '',
                '## Description',
                '',
                '{{description}}',
            ])
        default:
            return buildFallbackContentFirstDefaultTemplate(contentType)
    }
}

function buildFallbackContentFirstDefaultTemplate(
    contentType: ObsidianImportContentType,
): string {
    const titlePlaceholder = getPreferredTitlePlaceholder(contentType)
    return buildTemplate([
        `# {{${titlePlaceholder}}}`,
        '',
        'Source: {{url}}',
        'Tags: {{tags}}',
        '',
        '## Summary',
        '',
        '{{summary}}',
        '',
        '## Content',
        '',
        '{{text}}',
        '',
        '{{description}}',
    ])
}

function buildLegacyDefaultTemplate(
    contentType: ObsidianImportContentType,
): string {
    const placeholders = getLegacyDefaultTemplatePlaceholders(contentType)
    const titlePlaceholder = getPreferredTitlePlaceholder(contentType)
    const placeholderLines = placeholders
        .map((placeholder) => `- ${placeholder.label}: {{${placeholder.path}}}`)
        .join('\n')

    return [
        '---',
        'memex_id: "{{id}}"',
        'memex_content_id: "{{content_id}}"',
        'memex_library_id: "{{library_id}}"',
        'memex_type: "{{type}}"',
        'memex_external_id: "{{external_id}}"',
        'memex_updated_at: "{{updated_at}}"',
        '---',
        '',
        '<!-- memex-content-id: {{content_id}} -->',
        '',
        `# {{${titlePlaceholder}}}`,
        '',
        'Source: {{url}}',
        '',
        '## Summary',
        '',
        '{{summary}}',
        '',
        '## Content',
        '',
        '{{text}}',
        '',
        '## Metadata',
        '',
        placeholderLines,
        '',
    ].join('\n')
}

function getLegacyDefaultTemplatePlaceholders(
    contentType: ObsidianImportContentType,
): TemplatePlaceholderDefinition[] {
    if (
        contentType === 'substack' ||
        contentType === 'youtubeShorts' ||
        contentType === 'linkedinProfile'
    ) {
        return []
    }

    const definition =
        OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE.get(contentType)

    return (definition?.placeholders ?? []).filter(
        (placeholder) =>
            placeholder.path !== 'published' &&
            placeholder.path !== 'tags' &&
            placeholder.path !== 'transcript',
    )
}

function buildLegacyAudioRecordingDefaultTemplate(): string {
    return buildLegacyDefaultTemplate('audioRecording').replace(
        '- AI summary response Markdown: {{summary_markdown}}\n- Transcript Markdown: {{transcript_markdown}}\n',
        '',
    )
}

function buildMetadataDumpAudioRecordingDefaultTemplate(): string {
    return buildLegacyDefaultTemplate('audioRecording')
}

function buildTemplate(lines: string[]): string {
    return [...lines, ''].join('\n')
}

export const renderTemplate = renderMarkdownTemplate

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

function buildAudioRecordingTranscriptMarkdown(
    metadata: UnknownRecord,
): string {
    const audioEntry = getPrimaryAudioEntry(metadata)
    const segments = getPreferredTranscriptSegments(audioEntry)
    if (segments.length === 0) {
        return ''
    }

    return segments
        .map((segment) => {
            const text = normalizeString(segment.text, '')
            if (!text) {
                return ''
            }

            const timestamp = formatTranscriptTimestamp(segment.offset)
            const speakerLabel = getTranscriptSegmentSpeakerLabel({
                audioEntry,
                segment,
            })
            const prefix = [
                timestamp ? `[${timestamp}]` : '',
                speakerLabel ? `**${speakerLabel}:**` : '',
            ]
                .filter(Boolean)
                .join(' ')

            return prefix ? `${prefix} ${text}` : text
        })
        .filter(Boolean)
        .join('\n\n')
}

function getAudioRecordingDurationText(metadata: UnknownRecord): string {
    const durationSeconds = getAudioRecordingDurationSeconds(metadata)
    return durationSeconds == null ? '' : formatSecondsToHHMMSS(durationSeconds)
}

function getAudioRecordingDurationSeconds(
    metadata: UnknownRecord,
): number | null {
    const audioEntry = getPrimaryAudioEntry(metadata)
    const audioDuration = normalizeFiniteNumber(audioEntry?.duration)
    if (audioDuration != null) {
        return audioDuration
    }

    if (!Array.isArray(metadata.takes)) {
        return null
    }

    const takeEnds = metadata.takes
        .filter(isRecord)
        .map((take) => {
            const start = normalizeFiniteNumber(take.start_offset_seconds) ?? 0
            const duration = normalizeFiniteNumber(take.duration) ?? 0
            return start + duration
        })
        .filter((value) => value > 0)

    if (takeEnds.length === 0) {
        return null
    }

    return Math.max(...takeEnds)
}

function getAudioRecordingInlineSummaryText(metadata: UnknownRecord): string {
    const summary =
        typeof metadata.summary === 'string'
            ? normalizeString(metadata.summary, '')
            : ''
    if (summary && !isUuidString(summary)) {
        return summary
    }

    const audioEntry = getPrimaryAudioEntry(metadata)
    const audioSummary = audioEntry?.summary
    if (!isRecord(audioSummary)) {
        return ''
    }

    const englishSummary = normalizeString(audioSummary.en, '')
    if (englishSummary) {
        return englishSummary
    }

    for (const value of Object.values(audioSummary)) {
        const normalizedValue = normalizeString(value, '')
        if (normalizedValue) {
            return normalizedValue
        }
    }

    return ''
}

function getPrimaryAudioEntry(metadata: UnknownRecord): UnknownRecord | null {
    const media = metadata.media
    if (!Array.isArray(media)) {
        return null
    }

    return (
        media.find(
            (entry): entry is UnknownRecord =>
                isRecord(entry) && entry.type === 'audio',
        ) ??
        media.find((entry): entry is UnknownRecord => isRecord(entry)) ??
        null
    )
}

function getPreferredTranscriptSegments(
    audioEntry: UnknownRecord | null,
): UnknownRecord[] {
    if (audioEntry == null) {
        return []
    }

    const directTranscript = getTranscriptSegmentsFromMap(audioEntry.transcript)
    if (directTranscript.length > 0) {
        return directTranscript
    }

    if (!Array.isArray(audioEntry.segments)) {
        return []
    }

    return audioEntry.segments.flatMap((segment) =>
        isRecord(segment)
            ? getTranscriptSegmentsFromMap(segment.transcript)
            : [],
    )
}

function getTranscriptSegmentsFromMap(rawTranscript: unknown): UnknownRecord[] {
    if (!isRecord(rawTranscript)) {
        return []
    }

    if (Array.isArray(rawTranscript.en)) {
        return rawTranscript.en.filter(isTranscriptSegment)
    }

    for (const [key, value] of Object.entries(rawTranscript)) {
        if (key === 'speakerIds') {
            continue
        }
        if (Array.isArray(value)) {
            return value.filter(isTranscriptSegment)
        }
    }

    return []
}

function isTranscriptSegment(value: unknown): value is UnknownRecord {
    return isRecord(value) && typeof value.text === 'string'
}

function getTranscriptSegmentSpeakerLabel(params: {
    audioEntry: UnknownRecord | null
    segment: UnknownRecord
}): string | null {
    const speakerId = normalizeString(params.segment.speakerId, '')
    if (!speakerId || !isRecord(params.audioEntry?.speaker_labels)) {
        return null
    }

    const speakerLabel = params.audioEntry.speaker_labels[speakerId]
    if (!isRecord(speakerLabel)) {
        return null
    }

    return normalizeString(speakerLabel.label, '')
}

function formatTranscriptTimestamp(rawOffset: unknown): string {
    if (typeof rawOffset === 'number' && Number.isFinite(rawOffset)) {
        return formatSecondsToHHMMSS(rawOffset)
    }

    return normalizeString(rawOffset, '')
}

function getAudioRecordingSummaryThreadId(
    metadata: UnknownRecord,
): string | null {
    if (Array.isArray(metadata.summary)) {
        for (const reference of metadata.summary) {
            if (!isRecord(reference)) {
                continue
            }
            const threadId = normalizeString(reference.threadId, '')
            if (isUuidString(threadId)) {
                return threadId
            }
        }
    }

    const summary =
        typeof metadata.summary === 'string'
            ? normalizeString(metadata.summary, '')
            : ''
    return isUuidString(summary) ? summary : null
}

function getChatThreadMessages(metadata: UnknownRecord): ChatMessageEntity[] {
    return Array.isArray(metadata.messages)
        ? metadata.messages.filter(isChatMessageEntity)
        : []
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

function getAnnotationParentUrl(metadata: UnknownRecord): string | null {
    const value =
        metadata.parent_url ??
        getNestedValue(metadata, 'target_entity.url') ??
        metadata.url

    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : null
}

function getMediaTranscript(
    contentType: ObsidianImportContentType,
    metadata: UnknownRecord,
): string | null {
    if (
        contentType !== 'instagram' &&
        contentType !== 'tiktok' &&
        contentType !== 'twitter' &&
        contentType !== 'youtube' &&
        contentType !== 'youtubeShorts' &&
        contentType !== 'reddit'
    ) {
        return null
    }
    if (!Array.isArray(metadata.media)) {
        return null
    }

    const transcript = metadata.media
        .filter(
            (mediaEntry): mediaEntry is UnknownRecord =>
                isRecord(mediaEntry) && mediaEntry.type === 'video',
        )
        .map((mediaEntry) =>
            flattenLocalizedTranscriptText(mediaEntry.transcript),
        )
        .filter((value) => value.length > 0)
        .join('\n\n')

    return transcript.length > 0 ? transcript : null
}

function getContentSummary(metadata: UnknownRecord): string | null {
    const directSummary =
        typeof metadata.summary === 'string'
            ? metadata.summary.trim()
            : flattenLocalizedSummaryText(metadata.summary)
    if (directSummary.length > 0) {
        return directSummary
    }
    if (!Array.isArray(metadata.media)) {
        return null
    }

    const mediaSummary = metadata.media
        .filter(isRecord)
        .map((mediaEntry) => flattenLocalizedSummaryText(mediaEntry.summary))
        .filter((value) => value.length > 0)
        .join('\n\n')

    return mediaSummary.length > 0 ? mediaSummary : null
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

function normalizeStringArray(rawValue: unknown): string[] {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    return [
        ...new Set(
            values.map((value) => normalizeString(value, '')).filter(Boolean),
        ),
    ]
}

function normalizeFiniteNumber(rawValue: unknown): number | null {
    const numericValue =
        typeof rawValue === 'number'
            ? rawValue
            : typeof rawValue === 'string'
              ? Number(rawValue)
              : Number.NaN

    return Number.isFinite(numericValue) && numericValue >= 0
        ? numericValue
        : null
}

function formatTimestampText(rawValue: unknown): string {
    const timestamp =
        typeof rawValue === 'number'
            ? rawValue
            : typeof rawValue === 'string' && rawValue.trim()
              ? Number(rawValue)
              : Number.NaN
    const date =
        Number.isFinite(timestamp) && timestamp > 0
            ? new Date(timestamp)
            : typeof rawValue === 'string'
              ? new Date(rawValue)
              : null

    if (date == null || Number.isNaN(date.getTime())) {
        return ''
    }

    return date.toISOString().slice(0, 10)
}

function isUuidString(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
    )
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

function isPullImportAuthRequiredRpcError(error: unknown): boolean {
    if (!isSupabaseRpcErrorLike(error)) {
        return false
    }

    const code = typeof error.code === 'string' ? error.code : ''
    const message = typeof error.message === 'string' ? error.message : ''

    return (
        code === '28000' ||
        message.includes(
            'memex_poll_obsidian_imports requires an authenticated user',
        ) ||
        (code === '42501' &&
            message.includes(
                'permission denied for function memex_poll_obsidian_imports',
            ))
    )
}

function isSupabaseRpcErrorLike(error: unknown): error is SupabaseRpcErrorLike {
    return typeof error === 'object' && error != null
}

const stringifyPlaceholderValue = stringifyTemplatePlaceholderValue

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
