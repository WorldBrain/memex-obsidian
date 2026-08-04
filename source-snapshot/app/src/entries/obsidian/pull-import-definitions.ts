import type { PersistedContentEntityType } from '@memex/common/features/page-interactions/content-entity-types'
import { PERSISTED_CONTENT_ENTITY_TYPES } from '@memex/common/features/page-interactions/content-entity-types'

export type ObsidianImportContentType = Exclude<
    PersistedContentEntityType,
    'selector'
>

export interface PullImportRuleSettings {
    id: string
    name: string
    enabled: boolean
    contentTypes: ObsidianImportContentType[]
    targetFolderPath: string
}

export interface PullImportSettings {
    enabled: boolean
    pollIntervalMinutes: number
    lastFetchedUpdatedAt: string | null
    pluginFolderPath: string
    templatesFolderPath: string
    rules: PullImportRuleSettings[]
}

export interface MemexObsidianSettings {
    callbackSecretId: string
    pullImport: PullImportSettings
}

export interface TemplatePlaceholderDefinition {
    path: string
    label: string
}

export interface ImportContentTypeDefinition {
    type: ObsidianImportContentType
    label: string
    placeholders: TemplatePlaceholderDefinition[]
}

export const DEFAULT_MEMEX_PLUGIN_FOLDER = 'Memex Plugin'
export const DEFAULT_MEMEX_TEMPLATES_FOLDER = `${DEFAULT_MEMEX_PLUGIN_FOLDER}/Templates`
export const DEFAULT_MEMEX_IMPORTS_FOLDER = `${DEFAULT_MEMEX_PLUGIN_FOLDER}/Imports`
export const DEFAULT_PULL_IMPORT_INTERVAL_MINUTES = 15
export const OBSIDIAN_IMPORT_DOCS_URL =
    'https://docs.memex.garden/for-agents/obsidian-plugin#pull-import-template-placeholders'

const COMMON_PLACEHOLDERS: TemplatePlaceholderDefinition[] = [
    { path: 'id', label: 'Memex content entity ID' },
    { path: 'content_id', label: 'Memex content entity ID from the RPC item' },
    { path: 'library_id', label: "User's Memex library row ID" },
    { path: 'type', label: 'Memex content type' },
    { path: 'content_type', label: 'Memex content type from the RPC item' },
    { path: 'external_id', label: 'External source ID' },
    { path: 'created_at', label: 'Creation time in milliseconds' },
    { path: 'updated_at', label: 'Last update time in milliseconds' },
    { path: 'import_updated_at', label: 'RPC import cursor update time' },
    { path: 'rule_id', label: 'Matched Obsidian import rule ID' },
    { path: 'rule_order', label: 'Matched Obsidian import rule order' },
    { path: 'published', label: 'Published date' },
    { path: 'share_url', label: 'Memex reader share URL' },
    { path: 'summary', label: 'Summary' },
    { path: 'tags', label: 'Memex tags' },
    { path: 'tag_ids', label: 'Memex tag IDs' },
]

const WEB_PLACEHOLDERS: TemplatePlaceholderDefinition[] = [
    { path: 'title', label: 'Title' },
    { path: 'url', label: 'Source URL' },
    { path: 'normalized_url', label: 'Normalized URL' },
    { path: 'canonical_url', label: 'Canonical URL' },
    { path: 'description', label: 'Description' },
    { path: 'author', label: 'Author' },
    { path: 'published_at', label: 'Published time in milliseconds' },
    { path: 'image_url', label: 'Preview image URL' },
    { path: 'summary', label: 'Generated summary' },
]

const SOCIAL_PLACEHOLDERS: TemplatePlaceholderDefinition[] = [
    { path: 'title', label: 'Title' },
    { path: 'text', label: 'Text' },
    { path: 'description', label: 'Description' },
    { path: 'author_name', label: 'Author name' },
    { path: 'author_handle', label: 'Author handle' },
    { path: 'published_at', label: 'Published time in milliseconds' },
    { path: 'url', label: 'Source URL' },
    { path: 'media', label: 'Media metadata' },
]

export const OBSIDIAN_IMPORT_CONTENT_TYPES =
    PERSISTED_CONTENT_ENTITY_TYPES.filter(
        (type): type is ObsidianImportContentType => type !== 'selector',
    )

export const DEFAULT_PULL_IMPORT_RULE_ID = 'default'

export const DEFAULT_PULL_IMPORT_SETTINGS: PullImportSettings = {
    enabled: false,
    pollIntervalMinutes: DEFAULT_PULL_IMPORT_INTERVAL_MINUTES,
    lastFetchedUpdatedAt: null,
    pluginFolderPath: DEFAULT_MEMEX_PLUGIN_FOLDER,
    templatesFolderPath: DEFAULT_MEMEX_TEMPLATES_FOLDER,
    rules: [
        {
            id: DEFAULT_PULL_IMPORT_RULE_ID,
            name: 'All Memex content',
            enabled: true,
            contentTypes: [...OBSIDIAN_IMPORT_CONTENT_TYPES],
            targetFolderPath: DEFAULT_MEMEX_IMPORTS_FOLDER,
        },
    ],
}

export const DEFAULT_SETTINGS: MemexObsidianSettings = {
    callbackSecretId: 'memex-last-oauth-callback-url',
    pullImport: DEFAULT_PULL_IMPORT_SETTINGS,
}

export const OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS: ImportContentTypeDefinition[] =
    [
        defineContentType('web', 'Web page', WEB_PLACEHOLDERS),
        defineContentType('substack', 'Substack post', WEB_PLACEHOLDERS),
        defineContentType('pdf', 'PDF', [
            { path: 'title', label: 'Title' },
            { path: 'url', label: 'Source URL' },
            { path: 'authors', label: 'Authors' },
            { path: 'abstract', label: 'Abstract' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'page_count', label: 'Page count' },
            { path: 'source_urls', label: 'Known source URLs' },
        ]),
        defineContentType('youtube', 'YouTube video', [
            { path: 'title', label: 'Title' },
            { path: 'description', label: 'Description' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'channel_title', label: 'Channel title' },
            { path: 'channel_id', label: 'Channel ID' },
            { path: 'media', label: 'Video media metadata' },
            { path: 'transcript', label: 'Media transcript' },
        ]),
        defineContentType('youtubeShorts', 'YouTube Short', [
            { path: 'title', label: 'Title' },
            { path: 'description', label: 'Description' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'channel_title', label: 'Channel title' },
            { path: 'channel_id', label: 'Channel ID' },
            { path: 'media', label: 'Video media metadata' },
            { path: 'transcript', label: 'Media transcript' },
        ]),
        defineContentType('twitter', 'Twitter/X post', [
            { path: 'author_name', label: 'Author name' },
            { path: 'author_handle', label: 'Author handle' },
            { path: 'title', label: 'Title' },
            { path: 'text', label: 'Post text' },
            { path: 'quote_tweet', label: 'Quoted post text' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'save_type', label: 'Save type' },
            { path: 'media', label: 'Media metadata' },
            { path: 'transcript', label: 'Media transcript' },
        ]),
        defineContentType('rssFeed', 'RSS feed', [
            { path: 'title', label: 'Title' },
            { path: 'feed_url', label: 'Feed URL' },
            { path: 'site_url', label: 'Site URL' },
            { path: 'description', label: 'Description' },
            { path: 'author_name', label: 'Author name' },
            { path: 'source_platform', label: 'Source platform' },
            { path: 'avatar_path', label: 'Avatar asset path' },
        ]),
        defineContentType('instagram', 'Instagram post', [
            ...SOCIAL_PLACEHOLDERS,
            { path: 'transcript', label: 'Media transcript' },
        ]),
        defineContentType('tiktok', 'TikTok post', [
            { path: 'description', label: 'Description' },
            { path: 'author.nickname', label: 'Author nickname' },
            { path: 'author.uniqueId', label: 'Author unique ID' },
            { path: 'author.id', label: 'Author ID' },
            { path: 'media', label: 'Media metadata' },
            { path: 'transcript', label: 'Media transcript' },
        ]),
        defineContentType('facebook', 'Facebook post', [
            { path: 'text', label: 'Post text' },
            { path: 'author_name', label: 'Author name' },
            { path: 'author_handle', label: 'Author handle' },
            { path: 'author_id', label: 'Author ID' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'media', label: 'Media metadata' },
        ]),
        defineContentType('linkedin', 'LinkedIn post', [
            { path: 'text', label: 'Post text' },
        ]),
        defineContentType('linkedinProfile', 'LinkedIn profile', [
            { path: 'title', label: 'Profile title' },
            { path: 'description', label: 'Profile description' },
            { path: 'author_name', label: 'Profile name' },
            { path: 'author_handle', label: 'Profile handle' },
            { path: 'url', label: 'Profile URL' },
        ]),
        defineContentType('pinterest', 'Pinterest item', SOCIAL_PLACEHOLDERS),
        defineContentType('reddit', 'Reddit post', [
            { path: 'title', label: 'Title' },
            { path: 'text', label: 'Post text' },
            { path: 'author_name', label: 'Author name' },
            { path: 'author_handle', label: 'Author handle' },
            { path: 'subreddit_name', label: 'Subreddit name' },
            { path: 'subreddit_id', label: 'Subreddit ID' },
            { path: 'score', label: 'Score' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'transcript', label: 'Media transcript' },
        ]),
        defineContentType('snapchat', 'Snapchat item', SOCIAL_PLACEHOLDERS),
        defineContentType('chatgpt', 'ChatGPT conversation', WEB_PLACEHOLDERS),
        defineContentType('claude', 'Claude conversation', WEB_PLACEHOLDERS),
        defineContentType('annotation', 'Annotation', [
            { path: 'text', label: 'Annotation text' },
            { path: 'content', label: 'Annotation content JSON' },
            { path: 'private', label: 'Private flag' },
            { path: 'parent_content_id', label: 'Parent content entity ID' },
            { path: 'parent_library_id', label: 'Parent library row ID' },
            { path: 'parent_content_type', label: 'Parent content type' },
            { path: 'parent_url', label: 'Parent URL' },
            { path: 'target_entity.title', label: 'Referenced title' },
            { path: 'target_entity.url', label: 'Referenced URL' },
        ]),
        defineContentType('image', 'Image', [
            { path: 'description', label: 'Description' },
            { path: 'original_url', label: 'Original image URL' },
            { path: 'source_url', label: 'Source URL' },
            { path: 'source_title', label: 'Source title' },
            { path: 'storage_path', label: 'Storage path' },
            { path: 'mime_type', label: 'MIME type' },
        ]),
        defineContentType('transcribedMedia', 'Transcribed media', [
            { path: 'title', label: 'Title' },
            { path: 'description', label: 'Description' },
            { path: 'media', label: 'Media metadata' },
            { path: 'transcript_status', label: 'Transcript status' },
            { path: 'summary', label: 'Summary' },
        ]),
        defineContentType('audioRecording', 'Audio recording', [
            { path: 'title', label: 'Title' },
            { path: 'description', label: 'Description' },
            { path: 'duration', label: 'Duration' },
            { path: 'summary', label: 'Summary' },
            { path: 'transcript', label: 'Transcript' },
            { path: 'media', label: 'Audio media metadata' },
            { path: 'transcript_status', label: 'Transcript status' },
            { path: 'summary_markdown', label: 'AI summary response Markdown' },
            { path: 'transcript_markdown', label: 'Transcript Markdown' },
        ]),
        defineContentType('chatThread', 'Chat thread', [
            { path: 'title', label: 'Title' },
            { path: 'summary', label: 'Summary' },
            { path: 'model_name', label: 'Model name' },
            { path: 'created_at', label: 'Thread creation time' },
        ]),
        defineContentType('twitterProfile', 'Twitter/X profile', [
            { path: 'author_name', label: 'Profile name' },
            { path: 'author_handle', label: 'Profile handle' },
            { path: 'author_id', label: 'Profile ID' },
            { path: 'description', label: 'Profile description' },
            { path: 'bio_links', label: 'Profile links' },
            { path: 'media', label: 'Profile media metadata' },
        ]),
        defineContentType('subreddit', 'Subreddit', [
            { path: 'title', label: 'Title' },
            { path: 'display_name', label: 'Display name' },
            { path: 'description', label: 'Description' },
            { path: 'subreddit_id', label: 'Subreddit ID' },
            { path: 'media', label: 'Subreddit media metadata' },
        ]),
        defineContentType('youtubeChannel', 'YouTube channel', [
            { path: 'title', label: 'Title' },
            { path: 'description', label: 'Description' },
            { path: 'channel_handle', label: 'Channel handle' },
            { path: 'avatar_path', label: 'Avatar asset path' },
            { path: 'avatar', label: 'Avatar metadata' },
            { path: 'banner', label: 'Banner metadata' },
        ]),
        defineContentType('book', 'Book', [
            { path: 'title', label: 'Title' },
            { path: 'subtitle', label: 'Subtitle' },
            { path: 'authors', label: 'Authors' },
            { path: 'publisher', label: 'Publisher' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'page_count', label: 'Page count' },
            { path: 'language', label: 'Language' },
            { path: 'categories', label: 'Categories' },
            { path: 'description', label: 'Description' },
            { path: 'cover_url', label: 'Cover URL' },
            { path: 'source_identity', label: 'Source identity' },
        ]),
        defineContentType('audiobook', 'Audiobook', [
            { path: 'title', label: 'Title' },
            { path: 'subtitle', label: 'Subtitle' },
            { path: 'authors', label: 'Authors' },
            { path: 'narrators', label: 'Narrators' },
            { path: 'publisher', label: 'Publisher' },
            { path: 'published_at', label: 'Published time in milliseconds' },
            { path: 'language', label: 'Language' },
            { path: 'categories', label: 'Categories' },
            { path: 'description', label: 'Description' },
            { path: 'cover_url', label: 'Cover URL' },
            { path: 'source_identity', label: 'Source identity' },
        ]),
    ]

export const OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE = new Map(
    OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS.map((definition) => [
        definition.type,
        definition,
    ]),
)

function defineContentType(
    type: ObsidianImportContentType,
    label: string,
    placeholders: TemplatePlaceholderDefinition[],
): ImportContentTypeDefinition {
    return {
        type,
        label,
        placeholders: mergePlaceholders([
            ...COMMON_PLACEHOLDERS,
            ...placeholders,
        ]),
    }
}

function mergePlaceholders(
    placeholders: TemplatePlaceholderDefinition[],
): TemplatePlaceholderDefinition[] {
    const seen = new Set<string>()
    const merged: TemplatePlaceholderDefinition[] = []

    for (const placeholder of placeholders) {
        if (seen.has(placeholder.path)) {
            continue
        }
        seen.add(placeholder.path)
        merged.push(placeholder)
    }

    return merged
}
