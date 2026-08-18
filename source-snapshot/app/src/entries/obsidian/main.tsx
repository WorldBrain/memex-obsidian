import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import {
    App,
    DropdownComponent,
    Editor,
    FuzzySuggestModal,
    MarkdownRenderChild,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    SecretComponent,
    Setting,
    TFolder,
    type TAbstractFile,
    normalizePath,
} from 'obsidian'
import { ObsidianResultCardBlock } from './result-card-block'
import { ObsidianRuntime } from './runtime'
import { ObsidianSidebarSessionCache } from './sidebar-session-cache'
import { ObsidianAuthSessionLogic } from './auth-session-persistence'
import { MEMEX_OBSIDIAN_VIEW_TYPE, MemexSidebarView } from './view'
import { openExternalUrlInObsidianHost } from './external-url'
import { getObsidianColorTheme } from './theme'
import {
    formatDroppedMemexResultCardCodeBlock,
    getEditorPositionAfterInsertedText,
    MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE,
    MEMEX_RESULT_CARD_DRAG_MIME_TYPE,
} from '~/features/obsidian/result-card-format'
import { getSupabaseClient } from '~/setup/supabase'
import {
    DEFAULT_SETTINGS,
    OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS,
    OBSIDIAN_IMPORT_DOCS_URL,
    type MemexObsidianSettings,
    type ObsidianImportContentType,
    type PullImportRuleSettings,
    type PullImportSettings,
} from './pull-import-definitions'
import {
    ObsidianPullImportAuthRequiredError,
    ObsidianPullImportLogic,
    createDefaultPullImportRule,
    normalizeMemexObsidianSettings,
    type PullImportRunResult,
} from './pull-import-service'
import { ObsidianPullImportStorage } from './storage/pull-import'
import { ObsidianVaultStorage } from './storage/vault'
import { ObsidianAuthSessionStorage } from './storage/auth-session'
import {
    ObsidianAuthService,
    type ObsidianAuthServiceInterface,
} from '~/features/obsidian/services/auth'
import { ObsidianTimerService } from '~/features/obsidian/services/timer'

const OAUTH_PROTOCOL_ACTION = 'memex-auth'
const OAUTH_LOGIN_PROVIDER = 'google'
const ALL_CONTENT_TYPES_DROPDOWN_VALUE = '__all_content_types__'
const CUSTOM_CONTENT_TYPES_DROPDOWN_VALUE = '__custom_content_types__'

type ContentTypeDropdownValue =
    | ObsidianImportContentType
    | typeof ALL_CONTENT_TYPES_DROPDOWN_VALUE
    | typeof CUSTOM_CONTENT_TYPES_DROPDOWN_VALUE

type FolderSuggestion = {
    path: string
    label: string
}

class FolderSuggestModal extends FuzzySuggestModal<FolderSuggestion> {
    constructor(
        app: App,
        private readonly options: {
            currentPath: string
            onChoose: (path: string) => void
        },
    ) {
        super(app)
        this.setPlaceholder('Search vault folders')
    }

    getItems(): FolderSuggestion[] {
        const folders = this.app.vault
            .getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder)
            .map((folder) => ({
                path: normalizePath(folder.path),
                label: normalizePath(folder.path),
            }))
            .filter((folder) => folder.path.length > 0)
            .sort((first, second) => first.path.localeCompare(second.path))

        const currentPath = normalizePath(this.options.currentPath)
        const folderPaths = new Set(folders.map((folder) => folder.path))
        if (currentPath.length > 0 && !folderPaths.has(currentPath)) {
            folders.unshift({
                path: currentPath,
                label: `${currentPath} (current)`,
            })
        }

        return [{ path: '', label: 'Vault root' }, ...folders]
    }

    getItemText(item: FolderSuggestion): string {
        return item.label
    }

    onChooseItem(
        item: FolderSuggestion,
        _event: MouseEvent | KeyboardEvent,
    ): void {
        this.options.onChoose(item.path)
    }
}

function getFolderSettingButtonText(path: string): string {
    const normalizedPath = normalizePath(path)
    return normalizedPath.length > 0 ? normalizedPath : 'Vault root'
}

function getContentTypeDropdownValue(
    contentTypes: ObsidianImportContentType[],
): ContentTypeDropdownValue {
    if (areAllImportContentTypesSelected(contentTypes)) {
        return ALL_CONTENT_TYPES_DROPDOWN_VALUE
    }

    return contentTypes.length === 1
        ? contentTypes[0]
        : CUSTOM_CONTENT_TYPES_DROPDOWN_VALUE
}

function areAllImportContentTypesSelected(
    contentTypes: ObsidianImportContentType[],
): boolean {
    const selectedTypes = new Set(contentTypes)
    return OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS.every((definition) =>
        selectedTypes.has(definition.type),
    )
}

class CallbackUrlModal extends Modal {
    private callbackUrl = ''

    constructor(
        app: App,
        private readonly onSubmit: (callbackUrl: string) => void,
    ) {
        super(app)
    }

    onOpen(): void {
        const { contentEl } = this
        contentEl.replaceChildren()

        const title = document.createElement('h3')
        title.textContent = 'Paste Memex OAuth Callback URL'
        contentEl.appendChild(title)

        new Setting(contentEl)
            .setName('Callback URL')
            .setDesc('Paste the full URL you were redirected to after login.')
            .addTextArea((text) => {
                text.setPlaceholder('obsidian://memex-auth?code=...')
                text.inputEl.rows = 4
                text.onChange((value) => {
                    this.callbackUrl = value.trim()
                })
            })

        new Setting(contentEl).addButton((button) => {
            button
                .setButtonText('Complete Login')
                .setCta()
                .onClick(() => {
                    if (!this.callbackUrl) {
                        new Notice('Please paste a callback URL first.')
                        return
                    }
                    this.onSubmit(this.callbackUrl)
                    this.close()
                })
        })
    }
}

class ResultCardRenderChild extends MarkdownRenderChild {
    private root: Root | null = null
    private shadowHost: HTMLDivElement | null = null
    private shadowRoot: ShadowRoot | null = null
    private stopContainerClickHandling: (() => void) | null = null

    constructor(
        containerEl: HTMLElement,
        private readonly plugin: MemexObsidianPlugin,
        private readonly runtime: ObsidianRuntime,
        private readonly source: string,
    ) {
        super(containerEl)
    }

    async onload(): Promise<void> {
        await this.runtime.ensureContext()
        const shadowHost = document.createElement('div')
        shadowHost.className = 'memex-obsidian-result-card-shadow-host'
        shadowHost.style.display = 'block'
        shadowHost.style.margin = '1rem 0'
        const shadowRoot = shadowHost.attachShadow({ mode: 'open' })
        const mountEl = document.createElement('div')
        mountEl.style.display = 'block'
        shadowRoot.appendChild(mountEl)
        this.containerEl.replaceChildren(shadowHost)
        this.shadowHost = shadowHost
        this.shadowRoot = shadowRoot

        this.root = createRoot(mountEl)
        this.root.render(
            <ObsidianResultCardBlock
                runtime={this.runtime}
                source={this.source}
                isolationRoot={shadowRoot}
                onOpenExternalUrl={(url) => this.plugin.openExternalUrl(url)}
                onOpenNotes={(params) =>
                    this.plugin.openSearchNotesInSidebar(params)
                }
            />,
        )
        this.stopContainerClickHandling = this.registerContainerClickHandling()
    }

    onunload(): void {
        this.stopContainerClickHandling?.()
        this.stopContainerClickHandling = null
        this.root?.unmount()
        this.root = null
        this.shadowHost?.remove()
        this.shadowHost = null
        this.shadowRoot = null
    }

    private hasInteractiveTarget(event: MouseEvent): boolean {
        const interactiveTargetSelector = [
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            '[contenteditable="true"]',
            '[data-result-card-interactive="true"]',
            '[data-inline-video-player="true"]',
            '[data-result-card-action-menu="true"]',
            '[data-result-card-tag-pill="true"]',
            '[data-testid="mobile-action-sheet-panel"]',
        ].join(',')

        return event.composedPath().some((target) => {
            return (
                target instanceof HTMLElement &&
                target.matches(interactiveTargetSelector)
            )
        })
    }

    private registerContainerClickHandling(): () => void {
        const handleContainerClick = (event: MouseEvent) => {
            if (this.hasInteractiveTarget(event)) {
                return
            }

            const resultCardBlock = this.shadowRoot?.querySelector(
                '.memex-obsidian-result-card-block',
            ) as HTMLElement | null

            if (resultCardBlock == null) {
                return
            }

            if (event.shiftKey) {
                const notesContentEntityId =
                    resultCardBlock.dataset.notesContentId
                const notesTitle = resultCardBlock.dataset.notesTitle
                if (!notesContentEntityId || !notesTitle) {
                    return
                }

                event.preventDefault()
                event.stopPropagation()
                void this.plugin.openSearchNotesInSidebar({
                    contentEntityId: notesContentEntityId,
                    title: notesTitle,
                })
                return
            }

            const resultUrl = resultCardBlock.dataset.resultUrl
            if (!resultUrl) {
                return
            }

            event.preventDefault()
            event.stopPropagation()
            void this.plugin.openExternalUrl(resultUrl)
        }

        this.containerEl.addEventListener('click', handleContainerClick)

        return () => {
            this.containerEl.removeEventListener('click', handleContainerClick)
        }
    }
}

class MemexObsidianSettingTab extends PluginSettingTab {
    constructor(
        app: App,
        private readonly plugin: MemexObsidianPlugin,
    ) {
        super(app, plugin)
    }

    display(): void {
        const { containerEl } = this
        containerEl.replaceChildren()

        new Setting(containerEl)
            .setName('Login with Memex')
            .setDesc('Start OAuth login in your browser and redirect back.')
            .addButton((button) => {
                button
                    .setButtonText('Login')
                    .setCta()
                    .onClick(() => {
                        void this.plugin.startLoginFlow()
                    })
            })

        new Setting(containerEl)
            .setName('Manual callback fallback')
            .setDesc(
                'Use this when callback redirect handling fails on your platform.',
            )
            .addButton((button) => {
                button
                    .setButtonText('Paste Callback URL')
                    .onClick(() => this.plugin.openCallbackUrlModal())
            })

        new Setting(containerEl)
            .setName('Callback URL secret')
            .setDesc(
                'SecretStorage key for remembering the last successful callback URL.',
            )
            .addComponent((el) =>
                new SecretComponent(this.app, el)
                    .setValue(this.plugin.settings.callbackSecretId)
                    .onChange((value) => {
                        this.plugin.settings.callbackSecretId = value
                        void this.plugin.saveSettings()
                    }),
            )

        const pullImportTitle = document.createElement('h3')
        pullImportTitle.textContent = 'Pull imports'
        containerEl.appendChild(pullImportTitle)

        this.addPullImportCheckboxSetting({
            name: 'Enable pull imports',
            desc: 'Check Memex on an interval and import new matching content into this vault.',
            checked: this.plugin.settings.pullImport.enabled,
            onChange: (enabled) => {
                const pullImport = this.plugin.settings.pullImport
                void this.plugin.updatePullImportSettings({
                    ...pullImport,
                    enabled,
                    lastFetchedUpdatedAt:
                        enabled && pullImport.lastFetchedUpdatedAt == null
                            ? new Date().toISOString()
                            : pullImport.lastFetchedUpdatedAt,
                })
            },
        })

        this.addPullImportTextSetting({
            name: 'Poll interval',
            desc: 'Minutes between checks. The minimum is 1 minute.',
            value: String(this.plugin.settings.pullImport.pollIntervalMinutes),
            inputType: 'number',
            onChange: (value) => {
                void this.plugin.updatePullImportSettings({
                    ...this.plugin.settings.pullImport,
                    pollIntervalMinutes: Number.parseInt(value, 10),
                })
            },
        })

        this.addPullImportFolderSetting({
            name: 'Memex plugin folder',
            desc: 'Top-level vault folder used for Memex plugin templates and imports.',
            value: this.plugin.settings.pullImport.pluginFolderPath,
            onChange: (value) => {
                void this.plugin
                    .updatePullImportSettings({
                        ...this.plugin.settings.pullImport,
                        pluginFolderPath: value,
                    })
                    .then(() => this.display())
            },
        })

        this.addPullImportFolderSetting({
            name: 'Template folder',
            desc: 'Vault folder containing one editable template per Memex content type.',
            value: this.plugin.settings.pullImport.templatesFolderPath,
            onChange: (value) => {
                void this.plugin
                    .updatePullImportSettings({
                        ...this.plugin.settings.pullImport,
                        templatesFolderPath: value,
                    })
                    .then(() => this.display())
            },
        })

        new Setting(containerEl)
            .setName('Import cursor')
            .setDesc(
                this.plugin.settings.pullImport.lastFetchedUpdatedAt ??
                    'Imports will start from the current time when first enabled or run.',
            )
            .addButton((button) => {
                button.setButtonText('Reset to Now').onClick(() => {
                    void this.plugin.updatePullImportSettings({
                        ...this.plugin.settings.pullImport,
                        lastFetchedUpdatedAt: new Date().toISOString(),
                    })
                })
            })

        new Setting(containerEl)
            .setName('Run pull import now')
            .setDesc('Check Memex immediately using the current rules.')
            .addButton((button) => {
                button
                    .setButtonText('Run Now')
                    .setCta()
                    .onClick(() => {
                        void this.plugin.runPullImportNow()
                    })
            })

        new Setting(containerEl)
            .setName('Template placeholder docs')
            .setDesc('Open the list of supported template placeholders.')
            .addButton((button) => {
                button.setButtonText('Open Docs').onClick(() => {
                    this.plugin.openExternalUrl(OBSIDIAN_IMPORT_DOCS_URL)
                })
            })

        const rulesTitle = document.createElement('h4')
        rulesTitle.textContent = 'Import rules'
        containerEl.appendChild(rulesTitle)

        this.plugin.settings.pullImport.rules.forEach((rule, index) => {
            this.displayPullImportRule(rule, index)
        })

        new Setting(containerEl)
            .setName('Add import rule')
            .setDesc(
                'Rules are evaluated independently. Overlaps create one note per matching rule.',
            )
            .addButton((button) => {
                button.setButtonText('Add Rule').onClick(() => {
                    void this.plugin
                        .addPullImportRule()
                        .then(() => this.display())
                })
            })
    }

    private displayPullImportRule(
        rule: PullImportRuleSettings,
        index: number,
    ): void {
        const title = document.createElement('h5')
        title.textContent = `${index + 1}. ${rule.name}`
        this.containerEl.appendChild(title)

        this.addPullImportCheckboxSetting({
            name: 'Rule enabled',
            desc: 'Disabled rules are ignored by polling.',
            checked: rule.enabled,
            onChange: (enabled) => {
                void this.plugin.updatePullImportRule(rule.id, { enabled })
            },
        })

        this.addPullImportTextSetting({
            name: 'Rule name',
            desc: 'Only shown in these settings.',
            value: rule.name,
            onChange: (name) => {
                void this.plugin.updatePullImportRule(rule.id, { name })
            },
        })

        this.addPullImportFolderSetting({
            name: 'Destination folder',
            desc: 'Imported notes for this rule are created in this folder.',
            value: rule.targetFolderPath,
            onChange: (targetFolderPath) => {
                void this.plugin
                    .updatePullImportRule(rule.id, {
                        targetFolderPath,
                    })
                    .then(() => this.display())
            },
        })

        new Setting(this.containerEl)
            .setName('Content types')
            .setDesc('Choose which Memex content type this rule should import.')
            .addDropdown((dropdown) => {
                this.configureContentTypeDropdown(dropdown, rule)
            })

        new Setting(this.containerEl)
            .setName('Remove rule')
            .setDesc('Remove this import rule.')
            .addButton((button) => {
                button.setButtonText('Remove').onClick(() => {
                    void this.plugin
                        .removePullImportRule(rule.id)
                        .then(() => this.display())
                })
            })
    }

    private addPullImportCheckboxSetting(params: {
        name: string
        desc: string
        checked: boolean
        onChange: (checked: boolean) => void
    }): void {
        new Setting(this.containerEl)
            .setName(params.name)
            .setDesc(params.desc)
            .addComponent((el) => {
                const input = document.createElement('input')
                input.type = 'checkbox'
                input.checked = params.checked
                input.addEventListener('change', () => {
                    params.onChange(input.checked)
                })
                el.appendChild(input)
            })
    }

    private addPullImportTextSetting(params: {
        name: string
        desc: string
        value: string
        inputType?: 'number' | 'text'
        onChange: (value: string) => void
    }): void {
        new Setting(this.containerEl)
            .setName(params.name)
            .setDesc(params.desc)
            .addComponent((el) => {
                const input = document.createElement('input')
                input.type = params.inputType ?? 'text'
                input.value = params.value
                input.style.minWidth = '240px'
                input.addEventListener('change', () => {
                    params.onChange(input.value)
                })
                el.appendChild(input)
            })
    }

    private addPullImportFolderSetting(params: {
        name: string
        desc: string
        value: string
        onChange: (value: string) => void
    }): void {
        new Setting(this.containerEl)
            .setName(params.name)
            .setDesc(params.desc)
            .addButton((button) => {
                button
                    .setButtonText(getFolderSettingButtonText(params.value))
                    .onClick(() => {
                        new FolderSuggestModal(this.app, {
                            currentPath: params.value,
                            onChoose: params.onChange,
                        }).open()
                    })
            })
    }

    private configureContentTypeDropdown(
        dropdown: DropdownComponent,
        rule: PullImportRuleSettings,
    ): void {
        const selectedValue = getContentTypeDropdownValue(rule.contentTypes)

        dropdown.addOption(
            ALL_CONTENT_TYPES_DROPDOWN_VALUE,
            `All content types (${OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS.length})`,
        )
        if (selectedValue === CUSTOM_CONTENT_TYPES_DROPDOWN_VALUE) {
            dropdown.addOption(
                CUSTOM_CONTENT_TYPES_DROPDOWN_VALUE,
                `Custom selection (${rule.contentTypes.length})`,
            )
        }
        for (const definition of OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS) {
            dropdown.addOption(definition.type, definition.label)
        }

        dropdown.setValue(selectedValue)
        dropdown.onChange((value) => {
            if (value === CUSTOM_CONTENT_TYPES_DROPDOWN_VALUE) {
                return
            }

            const contentTypes =
                value === ALL_CONTENT_TYPES_DROPDOWN_VALUE
                    ? OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS.map(
                          (definition) => definition.type,
                      )
                    : [value as ObsidianImportContentType]

            void this.plugin.updatePullImportRule(rule.id, { contentTypes })
        })
    }
}

export default class MemexObsidianPlugin extends Plugin {
    public settings: MemexObsidianSettings = DEFAULT_SETTINGS
    private readonly runtime = new ObsidianRuntime({
        resolveRuntimeUrl: (path) => this.resolveRuntimeUrl(path),
        initialTheme: getObsidianColorTheme(),
    })
    private readonly sidebarSessionCache = new ObsidianSidebarSessionCache({
        runtime: this.runtime,
        startLoginFlow: async () => {
            await this.startLoginFlow()
        },
    })
    private authSessionLogic: ObsidianAuthSessionLogic | null = null
    private authService: ObsidianAuthServiceInterface | null = null
    private stopAuthSessionSync: (() => void) | null = null
    private pullImportLogic: ObsidianPullImportLogic | null = null
    private isPullImportLoginFlowOpen = false

    private resolveRuntimeUrl(path: string): string | null {
        const adapter = this.app.vault?.adapter
        const pluginDir = this.manifest?.dir
        if (adapter?.getResourcePath == null || !pluginDir) {
            return null
        }

        const normalizedPath = normalizePath(
            `${pluginDir}/${path.startsWith('/') ? path.slice(1) : path}`,
        )
        return adapter.getResourcePath(normalizedPath)
    }

    async onload(): Promise<void> {
        this.syncObsidianTheme()
        this.registerStartupThemeSync()
        await this.loadSettings()
        const authSessionLogic = this.getAuthSessionLogic()
        await authSessionLogic.restoreSession()
        this.stopAuthSessionSync = authSessionLogic.startSync()
        await authSessionLogic.syncCurrentSession()
        this.pullImportLogic = new ObsidianPullImportLogic({
            storage: new ObsidianPullImportStorage(getSupabaseClient()),
            vaultStorage: new ObsidianVaultStorage(this.app),
            timerService: new ObsidianTimerService(),
            getSettings: () => this.settings.pullImport,
            updateSettings: (settings) =>
                this.updatePullImportSettings(settings),
        })
        await this.pullImportLogic.initialize()
        this.configurePullImportPolling()
        if (this.settings.pullImport.enabled) {
            void this.runPullImport({ silent: true })
        }

        this.registerView(
            MEMEX_OBSIDIAN_VIEW_TYPE,
            (leaf) =>
                new MemexSidebarView(
                    leaf,
                    this.runtime,
                    this.sidebarSessionCache,
                ),
        )

        this.addSettingTab(new MemexObsidianSettingTab(this.app, this))

        this.addCommand({
            id: 'toggle-memex-sidebar',
            name: 'Toggle Memex Sidebar',
            callback: () => {
                void this.toggleSidebar()
            },
        })

        this.addCommand({
            id: 'memex-login-with-browser',
            name: 'Login with Memex',
            callback: () => {
                void this.startLoginFlow()
            },
        })

        this.addCommand({
            id: 'memex-paste-callback-url',
            name: 'Paste Memex Callback URL',
            callback: () => this.openCallbackUrlModal(),
        })

        this.addCommand({
            id: 'memex-run-pull-import',
            name: 'Run Memex Pull Import',
            callback: () => {
                void this.runPullImportNow()
            },
        })

        this.registerEvent(
            this.app.workspace.on('editor-drop', (event, editor) => {
                void this.handleEditorDrop(event, editor)
            }),
        )

        this.registerEvent(
            this.app.workspace.on('css-change', () => {
                this.syncObsidianTheme()
            }),
        )

        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                void this.handlePullImportVaultRename(file, oldPath)
            }),
        )

        this.registerObsidianProtocolHandler(
            OAUTH_PROTOCOL_ACTION,
            (params) => {
                void this.handleProtocolCallback(params)
            },
        )

        this.registerMarkdownCodeBlockProcessor(
            MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE,
            (source, el, context) => {
                const child = new ResultCardRenderChild(
                    el,
                    this,
                    this.runtime,
                    source,
                )
                context.addChild(child)
            },
        )
    }

    private syncObsidianTheme(): void {
        this.runtime.setHostColorTheme(getObsidianColorTheme())
    }

    private registerStartupThemeSync(): void {
        this.app.workspace.onLayoutReady?.(() => {
            this.syncObsidianTheme()
        })

        const requestAnimationFrameId = window.requestAnimationFrame(() => {
            this.syncObsidianTheme()
        })
        this.register(() => {
            window.cancelAnimationFrame(requestAnimationFrameId)
        })

        const timeoutIds = [0, 100, 500].map((delay) =>
            window.setTimeout(() => {
                this.syncObsidianTheme()
            }, delay),
        )
        this.register(() => {
            timeoutIds.forEach((timeoutId) => {
                window.clearTimeout(timeoutId)
            })
        })
    }

    private configurePullImportPolling(): void {
        const intervalId = this.pullImportLogic?.configurePolling(() => {
            void this.runPullImport({ silent: true })
        })

        if (intervalId != null) {
            this.registerInterval(intervalId)
        }
    }

    private async runPullImport(params: {
        silent: boolean
    }): Promise<PullImportRunResult | null> {
        if (this.pullImportLogic == null) {
            return null
        }

        try {
            if (!(await this.hasMemexAuthSessionForPullImport())) {
                await this.handlePullImportAuthRequired(params)
                return null
            }

            return await this.pullImportLogic.runOnce()
        } catch (error) {
            if (error instanceof ObsidianPullImportAuthRequiredError) {
                await this.handlePullImportAuthRequired(params)
                return null
            }

            console.warn('[Memex Obsidian] Pull import failed', error)
            if (!params.silent) {
                throw error
            }
            return null
        }
    }

    private async hasMemexAuthSessionForPullImport(): Promise<boolean> {
        try {
            return (await this.getAuthService().getSession()) != null
        } catch (error) {
            console.warn(
                '[Memex Obsidian] Could not read auth session before pull import.',
                error,
            )
            return true
        }
    }

    private async handlePullImportAuthRequired(params: {
        silent: boolean
    }): Promise<void> {
        if (this.isPullImportLoginFlowOpen) {
            if (!params.silent) {
                new Notice(
                    'You are not logged in to Memex. Complete the open login flow to continue Obsidian pull imports.',
                )
            }
            return
        }

        this.isPullImportLoginFlowOpen = true
        const didOpenLogin = await this.startLoginFlow({
            successNotice:
                'You are not logged in to Memex. Opening login to continue Obsidian pull imports.',
        })
        if (!didOpenLogin) {
            this.isPullImportLoginFlowOpen = false
        }
    }

    private async handlePullImportVaultRename(
        file: TAbstractFile,
        oldPath: string,
    ): Promise<void> {
        const didUpdate =
            (await this.pullImportLogic?.handleVaultRename(file, oldPath)) ??
            false
        if (didUpdate) {
            this.configurePullImportPolling()
        }
    }

    async onunload(): Promise<void> {
        this.pullImportLogic?.stopPolling()
        this.stopAuthSessionSync?.()
        this.stopAuthSessionSync = null
        this.sidebarSessionCache.dispose()
        await this.runtime.dispose()
        this.app.workspace
            .getLeavesOfType(MEMEX_OBSIDIAN_VIEW_TYPE)
            .forEach((leaf) => leaf.detach())
    }

    async loadSettings(): Promise<void> {
        const loaded = await this.loadData()
        this.settings = normalizeMemexObsidianSettings(loaded)
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings)
    }

    async updatePullImportSettings(
        pullImport: PullImportSettings,
    ): Promise<void> {
        const wasEnabled = this.settings.pullImport.enabled
        this.settings = normalizeMemexObsidianSettings({
            ...this.settings,
            pullImport,
        })
        await this.saveSettings()
        this.configurePullImportPolling()
        if (!wasEnabled && this.settings.pullImport.enabled) {
            void this.runPullImport({ silent: true })
        }
    }

    async addPullImportRule(): Promise<void> {
        await this.updatePullImportSettings({
            ...this.settings.pullImport,
            rules: [
                ...this.settings.pullImport.rules,
                createDefaultPullImportRule(),
            ],
        })
    }

    async removePullImportRule(ruleId: string): Promise<void> {
        await this.updatePullImportSettings({
            ...this.settings.pullImport,
            rules: this.settings.pullImport.rules.filter(
                (rule) => rule.id !== ruleId,
            ),
        })
    }

    async updatePullImportRule(
        ruleId: string,
        patch: Partial<PullImportRuleSettings>,
    ): Promise<void> {
        await this.updatePullImportSettings({
            ...this.settings.pullImport,
            rules: this.settings.pullImport.rules.map((rule) =>
                rule.id === ruleId ? { ...rule, ...patch } : rule,
            ),
        })
    }

    async runPullImportNow(): Promise<void> {
        try {
            const result = await this.runPullImport({ silent: false })
            if (result == null) {
                return
            }

            if (result.initializedCursor) {
                new Notice(
                    'Memex pull imports will start with new items from now.',
                )
                return
            }

            new Notice(
                `Memex pull import complete. Imported ${result.importedCount}, skipped ${result.skippedCount}.`,
            )
        } catch (error) {
            new Notice(
                error instanceof Error
                    ? `Memex pull import failed: ${error.message}`
                    : 'Memex pull import failed.',
            )
        }
    }

    async toggleSidebar(): Promise<void> {
        const existingLeaves = this.app.workspace.getLeavesOfType(
            MEMEX_OBSIDIAN_VIEW_TYPE,
        )
        if (existingLeaves.length > 0) {
            existingLeaves.forEach((leaf) => leaf.detach())
            return
        }

        const leaf =
            this.app.workspace.getRightLeaf(false) ??
            this.app.workspace.getLeaf(false)

        if (!leaf) {
            new Notice('Could not open Memex sidebar leaf.')
            return
        }

        await leaf.setViewState({
            type: MEMEX_OBSIDIAN_VIEW_TYPE,
            active: true,
        })
        await this.app.workspace.revealLeaf(leaf)
    }

    async ensureSidebarOpen(): Promise<void> {
        const existingLeaves = this.app.workspace.getLeavesOfType(
            MEMEX_OBSIDIAN_VIEW_TYPE,
        )
        if (existingLeaves.length > 0) {
            await this.app.workspace.revealLeaf(existingLeaves[0])
            return
        }

        const leaf =
            this.app.workspace.getRightLeaf(false) ??
            this.app.workspace.getLeaf(false)

        if (!leaf) {
            new Notice('Could not open Memex sidebar leaf.')
            return
        }

        await leaf.setViewState({
            type: MEMEX_OBSIDIAN_VIEW_TYPE,
            active: true,
        })
        await this.app.workspace.revealLeaf(leaf)
    }

    async openSearchNotesInSidebar(params: {
        contentEntityId: string
        title: string
    }): Promise<void> {
        await this.ensureSidebarOpen()
        const sidebarView = this.app.workspace.getLeavesOfType(
            MEMEX_OBSIDIAN_VIEW_TYPE,
        )[0]?.view

        if (!(sidebarView instanceof MemexSidebarView)) {
            return
        }

        sidebarView.openSearchNotes(params)
    }

    async startLoginFlow(
        options: { successNotice?: string } = {},
    ): Promise<boolean> {
        try {
            const authUrl = await this.runtime.startOAuthLogin()
            if (!authUrl) {
                new Notice('Could not generate Memex login URL.')
                return false
            }

            window.open(authUrl, '_blank', 'noopener,noreferrer')
            new Notice(
                options.successNotice ?? 'Opened Memex login in your browser.',
            )
            return true
        } catch (error) {
            new Notice(
                error instanceof Error
                    ? `Memex login failed: ${error.message}`
                    : 'Memex login failed.',
            )
            return false
        }
    }

    openCallbackUrlModal(): void {
        const modal = new CallbackUrlModal(this.app, (callbackUrl) => {
            void this.completeOAuthFromCallbackUrl(callbackUrl)
        })
        modal.open()
    }

    async completeOAuthFromCallbackUrl(callbackUrl: string): Promise<void> {
        try {
            await this.runtime.completeOAuthFromCallbackUrl(
                callbackUrl,
                OAUTH_LOGIN_PROVIDER,
            )
            await this.getAuthSessionLogic().syncCurrentSession()
            try {
                this.app.secretStorage.setSecret(
                    this.settings.callbackSecretId,
                    callbackUrl,
                )
            } catch (error) {
                console.warn(
                    'Could not save callback URL into SecretStorage',
                    error,
                )
            }
            new Notice('Memex login complete.')
        } catch (error) {
            new Notice(
                error instanceof Error
                    ? `OAuth callback failed: ${error.message}`
                    : 'OAuth callback failed.',
            )
        } finally {
            this.isPullImportLoginFlowOpen = false
        }
    }

    private async handleProtocolCallback(
        params: Record<string, string>,
    ): Promise<void> {
        const callbackUrl = this.buildCallbackUrlFromProtocolParams(params)
        if (!callbackUrl) {
            new Notice('Missing callback params in obsidian://memex-auth URL.')
            return
        }
        await this.completeOAuthFromCallbackUrl(callbackUrl)
    }

    openExternalUrl(url: string): void {
        const workspaceOpenUrl = this.app.workspace.openUrl
        const didOpen =
            workspaceOpenUrl != null
                ? (workspaceOpenUrl.call(this.app.workspace, url), true)
                : openExternalUrlInObsidianHost(url)
        if (!didOpen) {
            new Notice('Could not open external URL.')
        }
    }

    private buildCallbackUrlFromProtocolParams(
        params: Record<string, string>,
    ): string | null {
        const query = new URLSearchParams()
        let hashPayload: string | null = null

        for (const [key, value] of Object.entries(params)) {
            const normalizedKey = key.trim()
            if (normalizedKey.length === 0 || normalizedKey === 'action') {
                continue
            }

            if (normalizedKey === 'hash') {
                const normalizedHash = this.normalizeOAuthHashPayload(value)
                if (normalizedHash.length > 0) {
                    hashPayload = normalizedHash
                }
                continue
            }

            query.set(normalizedKey, value)
        }

        const queryString = query.toString()
        if (!queryString && !hashPayload) {
            return null
        }

        return `obsidian://${OAUTH_PROTOCOL_ACTION}${queryString ? `?${queryString}` : ''}${hashPayload ? `#${hashPayload}` : ''}`
    }

    private normalizeOAuthHashPayload(rawHash: string): string {
        let normalized = rawHash.trim()
        if (normalized.startsWith('#')) {
            normalized = normalized.slice(1)
        }

        // Obsidian protocol handlers may pass URL-encoded hash fragments in a
        // dedicated "hash" query parameter. Decode up to twice to handle nested
        // encoding without risking an infinite loop on malformed input.
        for (let index = 0; index < 2; index += 1) {
            try {
                const decoded = decodeURIComponent(normalized)
                if (decoded === normalized) {
                    break
                }
                normalized = decoded
            } catch {
                break
            }
        }

        return normalized
    }

    private async handleEditorDrop(
        event: DragEvent,
        editor: Editor,
    ): Promise<void> {
        if (event.defaultPrevented) {
            return
        }

        const resultCardCodeBlock = event.dataTransfer?.getData(
            MEMEX_RESULT_CARD_DRAG_MIME_TYPE,
        )
        if (resultCardCodeBlock?.trim()) {
            event.preventDefault()
            const insertAt = editor.getCursor()
            const insertedText =
                formatDroppedMemexResultCardCodeBlock(resultCardCodeBlock)
            editor.replaceRange(insertedText, insertAt)
            editor.setCursor(
                getEditorPositionAfterInsertedText(insertAt, insertedText),
            )
            return
        }

        const rawData = event.dataTransfer?.getData(
            'application/x-memex-reference',
        )
        if (!rawData) {
            return
        }

        const parsed = this.parseMemexReferenceDragData(rawData)
        if (parsed == null) {
            return
        }

        event.preventDefault()

        const insertionText = await this.resolveDroppedReferenceText(
            parsed.contentId,
        )
        editor.replaceRange(insertionText, editor.getCursor())
    }

    private parseMemexReferenceDragData(
        rawData: string,
    ): { contentId: string } | null {
        try {
            const parsed = JSON.parse(rawData) as { contentId?: string }
            if (!parsed.contentId) {
                return null
            }
            return { contentId: parsed.contentId }
        } catch {
            return null
        }
    }

    private async resolveDroppedReferenceText(
        contentId: string,
    ): Promise<string> {
        return `[[memex:${contentId}]]`
    }

    private getAuthSessionLogic(): ObsidianAuthSessionLogic {
        if (this.authSessionLogic == null) {
            this.authSessionLogic = new ObsidianAuthSessionLogic({
                storage: new ObsidianAuthSessionStorage(this.app.secretStorage),
                authService: this.getAuthService(),
                onWarning: (message, error) => {
                    console.warn(`[Memex Obsidian] ${message}`, error)
                },
            })
        }

        return this.authSessionLogic
    }

    private getAuthService(): ObsidianAuthServiceInterface {
        if (this.authService == null) {
            this.authService = new ObsidianAuthService(getSupabaseClient().auth)
        }

        return this.authService
    }
}
