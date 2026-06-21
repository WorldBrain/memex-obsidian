// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { App, TAbstractFile, TFile, Vault } from 'obsidian'
import type { CommonSupabaseClient } from '@memex/common/storage/supabase-types'
import {
    DEFAULT_MEMEX_IMPORTS_FOLDER,
    DEFAULT_MEMEX_PLUGIN_FOLDER,
    DEFAULT_MEMEX_TEMPLATES_FOLDER,
    DEFAULT_PULL_IMPORT_SETTINGS,
    type PullImportSettings,
} from './pull-import-definitions'

import {
    ObsidianPullImportService,
    getImportFilePath,
    getHiddenContentIdMarker,
    renderTemplate,
} from './pull-import-service'

describe('renderTemplate', () => {
    it('renders nested metadata placeholders and formats arrays', () => {
        const rendered = renderTemplate(
            [
                '# {{metadata.title}}',
                'Author: {{ metadata.author.name }}',
                'Tags: {{metadata.tags}}',
                'Media: {{metadata.media}}',
                'Missing: {{metadata.missing}}',
            ].join('\n'),
            {
                title: 'Example',
                author: { name: 'Ada' },
                tags: ['research', 'web'],
                media: [{ type: 'image', url: 'https://example.com/a.png' }],
            },
        )

        expect(rendered).toContain('# Example')
        expect(rendered).toContain('Author: Ada')
        expect(rendered).toContain('Tags: research, web')
        expect(rendered).toContain(
            'Media: [{"type":"image","url":"https://example.com/a.png"}]',
        )
        expect(rendered).toContain('Missing: ')
    })
})

describe('ObsidianPullImportService', () => {
    let vault: FakeVault
    let settings: PullImportSettings
    let rpc: ReturnType<typeof vi.fn>
    let service: ObsidianPullImportService

    beforeEach(() => {
        vault = new FakeVault()
        settings = {
            ...DEFAULT_PULL_IMPORT_SETTINGS,
            rules: [
                {
                    id: 'rule-a',
                    name: 'Articles',
                    enabled: true,
                    contentTypes: ['web'],
                    targetFolderPath: DEFAULT_MEMEX_IMPORTS_FOLDER,
                },
            ],
        }
        rpc = vi.fn()
        service = createService({
            vault,
            settingsRef: () => settings,
            updateSettings: async (nextSettings) => {
                settings = nextSettings
            },
            rpc,
        })
    })

    it('restores missing default templates without overwriting edited templates', async () => {
        await service.initialize()

        const webTemplatePath = `${DEFAULT_MEMEX_TEMPLATES_FOLDER}/web.md`
        expect(vault.files.has(webTemplatePath)).toBe(true)

        vault.files.set(webTemplatePath, 'custom template')
        await service.ensureDefaultTemplates()

        expect(vault.files.get(webTemplatePath)).toBe('custom template')
        expect(
            vault.files.has(`${DEFAULT_MEMEX_TEMPLATES_FOLDER}/pdf.md`),
        ).toBe(true)
    })

    it('remaps plugin, template, and rule folders when the plugin folder is renamed', async () => {
        await service.handleVaultRename(
            { path: 'Knowledge/Memex Plugin' } as TAbstractFile,
            DEFAULT_MEMEX_PLUGIN_FOLDER,
        )

        expect(settings.pluginFolderPath).toBe('Knowledge/Memex Plugin')
        expect(settings.templatesFolderPath).toBe(
            'Knowledge/Memex Plugin/Templates',
        )
        expect(settings.rules[0]?.targetFolderPath).toBe(
            'Knowledge/Memex Plugin/Imports',
        )
    })

    it('initializes the cursor from now before the first run', async () => {
        settings = {
            ...settings,
            lastFetchedUpdatedAt: null,
        }
        service = createService({
            vault,
            settingsRef: () => settings,
            updateSettings: async (nextSettings) => {
                settings = nextSettings
            },
            rpc,
            now: () => new Date('2026-06-20T12:00:00.000Z'),
        })

        const result = await service.runOnce()

        expect(result.initializedCursor).toBe(true)
        expect(settings.lastFetchedUpdatedAt).toBe('2026-06-20T12:00:00.000Z')
        expect(rpc).not.toHaveBeenCalled()
    })

    it('writes one import file per matching rule and advances the cursor after success', async () => {
        settings = {
            ...settings,
            lastFetchedUpdatedAt: '2026-06-20T12:00:00.000Z',
            rules: [
                {
                    id: 'rule-a',
                    name: 'Articles',
                    enabled: true,
                    contentTypes: ['web'],
                    targetFolderPath: 'Articles',
                },
                {
                    id: 'rule-b',
                    name: 'Research',
                    enabled: true,
                    contentTypes: ['web'],
                    targetFolderPath: 'Research',
                },
            ],
        }
        rpc.mockResolvedValue({
            data: {
                items: [
                    createRpcItem({ rule_id: 'rule-a', rule_order: 0 }),
                    createRpcItem({ rule_id: 'rule-b', rule_order: 1 }),
                ],
                next_updated_at: '2026-06-20T12:05:00.000Z',
                blocked_at: null,
                has_more: false,
            },
            error: null,
        })

        const result = await service.runOnce()

        expect(result.importedCount).toBe(2)
        expect(settings.lastFetchedUpdatedAt).toBe('2026-06-20T12:05:00.000Z')
        expect(rpc).toHaveBeenCalledWith('memex_poll_obsidian_imports', {
            p_since_updated_at: '2026-06-20T12:00:00.000Z',
            p_rules: [
                {
                    ruleId: 'rule-a',
                    ruleOrder: 0,
                    contentTypes: ['web'],
                },
                {
                    ruleId: 'rule-b',
                    ruleOrder: 1,
                    contentTypes: ['web'],
                },
            ],
            p_limit: 50,
        })
        expect(Array.from(vault.files.keys())).toEqual(
            expect.arrayContaining([
                'Articles/Example Article - content--rule-a.md',
                'Research/Example Article - content--rule-b.md',
            ]),
        )
        expect(
            vault.files.get('Articles/Example Article - content--rule-a.md'),
        ).toContain(getHiddenContentIdMarker('content-123456789'))
    })

    it('appends annotations to the imported parent note by hidden content id', async () => {
        settings = {
            ...settings,
            lastFetchedUpdatedAt: '2026-06-20T12:00:00.000Z',
            rules: [
                {
                    id: 'rule-annotations',
                    name: 'Annotations',
                    enabled: true,
                    contentTypes: ['annotation'],
                    targetFolderPath: 'Annotations',
                },
            ],
        }
        vault.files.set(
            'Articles/Parent.md',
            [
                '---',
                'memex_id: "parent-content-123"',
                '---',
                '',
                getHiddenContentIdMarker('parent-content-123'),
                '',
                '# Parent page',
            ].join('\n'),
        )
        const annotationItem = createRpcItem({
            rule_id: 'rule-annotations',
            rule_order: 0,
            content_id: 'annotation-123456789',
            content_type: 'annotation',
            metadata: {
                id: 'annotation-123456789',
                type: 'annotation',
                text: 'Important quote from the parent page.',
                parent_content_id: 'parent-content-123',
            },
        })
        rpc.mockResolvedValue({
            data: {
                items: [annotationItem],
                next_updated_at: '2026-06-20T12:05:00.000Z',
                blocked_at: null,
                has_more: false,
            },
            error: null,
        })

        const result = await service.runOnce()

        expect(result.importedCount).toBe(1)
        expect(vault.files.get('Articles/Parent.md')).toContain(
            '## Annotations',
        )
        expect(vault.files.get('Articles/Parent.md')).toContain(
            '<!-- memex-annotation-id: annotation-123456789; rule-id: rule-annotations -->',
        )
        expect(vault.files.get('Articles/Parent.md')).toContain(
            'Important quote from the parent page.',
        )
        expect(
            Array.from(vault.files.keys()).some((path) =>
                path.startsWith('Annotations/'),
            ),
        ).toBe(false)
    })

    it('skips annotation appends that are already present on the parent note', async () => {
        settings = {
            ...settings,
            lastFetchedUpdatedAt: '2026-06-20T12:00:00.000Z',
            rules: [
                {
                    id: 'rule-annotations',
                    name: 'Annotations',
                    enabled: true,
                    contentTypes: ['annotation'],
                    targetFolderPath: 'Annotations',
                },
            ],
        }
        vault.files.set(
            'Articles/Parent.md',
            [
                getHiddenContentIdMarker('parent-content-123'),
                '',
                '## Annotations',
                '',
                '<!-- memex-annotation-id: annotation-123456789; rule-id: rule-annotations -->',
                '### Existing annotation',
            ].join('\n'),
        )
        rpc.mockResolvedValue({
            data: {
                items: [
                    createRpcItem({
                        rule_id: 'rule-annotations',
                        rule_order: 0,
                        content_id: 'annotation-123456789',
                        content_type: 'annotation',
                        metadata: {
                            id: 'annotation-123456789',
                            type: 'annotation',
                            text: 'Duplicate annotation.',
                            parent_content_id: 'parent-content-123',
                        },
                    }),
                ],
                next_updated_at: '2026-06-20T12:05:00.000Z',
                blocked_at: null,
                has_more: false,
            },
            error: null,
        })

        const result = await service.runOnce()

        expect(result.importedCount).toBe(0)
        expect(result.skippedCount).toBe(1)
        expect(
            vault.files
                .get('Articles/Parent.md')
                ?.match(/memex-annotation-id/g),
        ).toHaveLength(1)
    })

    it('does not advance the cursor when an import write fails', async () => {
        settings = {
            ...settings,
            lastFetchedUpdatedAt: '2026-06-20T12:00:00.000Z',
        }
        rpc.mockResolvedValue({
            data: {
                items: [createRpcItem({ rule_id: 'rule-a', rule_order: 0 })],
                next_updated_at: '2026-06-20T12:05:00.000Z',
                blocked_at: null,
                has_more: false,
            },
            error: null,
        })
        vault.failCreatePath = getImportFilePath({
            item: createRpcItem({ rule_id: 'rule-a', rule_order: 0 }),
            rule: settings.rules[0],
        })

        await expect(service.runOnce()).rejects.toThrow('create failed')
        expect(settings.lastFetchedUpdatedAt).toBe('2026-06-20T12:00:00.000Z')
    })

    it('skips existing deterministic import files and still advances the cursor', async () => {
        settings = {
            ...settings,
            lastFetchedUpdatedAt: '2026-06-20T12:00:00.000Z',
        }
        const item = createRpcItem({ rule_id: 'rule-a', rule_order: 0 })
        vault.files.set(
            getImportFilePath({
                item,
                rule: settings.rules[0],
            }),
            'already imported',
        )
        rpc.mockResolvedValue({
            data: {
                items: [item],
                next_updated_at: '2026-06-20T12:05:00.000Z',
                blocked_at: null,
                has_more: false,
            },
            error: null,
        })

        const result = await service.runOnce()

        expect(result.importedCount).toBe(0)
        expect(result.skippedCount).toBe(1)
        expect(settings.lastFetchedUpdatedAt).toBe('2026-06-20T12:05:00.000Z')
    })
})

function createService(params: {
    vault: FakeVault
    settingsRef: () => PullImportSettings
    updateSettings: (settings: PullImportSettings) => Promise<void>
    rpc: ReturnType<typeof vi.fn>
    now?: () => Date
}): ObsidianPullImportService {
    return new ObsidianPullImportService({
        app: { vault: params.vault as unknown as Vault } as App,
        supabaseClient: {
            rpc: params.rpc,
        } as unknown as CommonSupabaseClient,
        getSettings: params.settingsRef,
        updateSettings: params.updateSettings,
        now: params.now,
    })
}

function createRpcItem(
    overrides: {
        rule_id?: string
        rule_order?: number
        content_id?: string
        library_id?: string
        content_type?: 'web' | 'annotation'
        metadata?: Record<string, unknown>
    } = {},
) {
    const contentType = overrides.content_type ?? 'web'
    const contentId = overrides.content_id ?? 'content-123456789'

    return {
        rule_id: overrides.rule_id ?? 'rule-a',
        rule_order: overrides.rule_order ?? 0,
        content_id: contentId,
        library_id: overrides.library_id ?? 'library-123',
        content_type: contentType,
        updated_at: '2026-06-20T12:05:00.000Z',
        metadata: {
            id: contentId,
            type: contentType,
            title: 'Example Article',
            url: 'https://example.com/article',
            updated_at: 1781957100000,
            ...overrides.metadata,
        },
    }
}

class FakeVault {
    readonly files = new Map<string, string>()
    readonly folders = new Set<string>()
    failCreatePath: string | null = null

    getAbstractFileByPath(path: string): TAbstractFile | null {
        if (this.files.has(path)) {
            return { path } as TFile
        }
        if (this.folders.has(path)) {
            return { path } as TAbstractFile
        }
        return null
    }

    getMarkdownFiles(): TFile[] {
        return Array.from(this.files.keys())
            .filter((path) => path.endsWith('.md'))
            .map((path) => ({ path }) as TFile)
    }

    async create(path: string, data: string): Promise<TFile> {
        if (path === this.failCreatePath) {
            throw new Error('create failed')
        }
        this.files.set(path, data)
        return { path } as TFile
    }

    async createFolder(path: string): Promise<void> {
        this.folders.add(path)
    }

    async read(file: TFile): Promise<string> {
        return this.files.get(file.path) ?? ''
    }

    async process(file: TFile, fn: (data: string) => string): Promise<void> {
        this.files.set(file.path, fn(this.files.get(file.path) ?? ''))
    }
}
