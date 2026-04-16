import {
    App,
    Editor,
    MarkdownRenderChild,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
} from 'obsidian'
import type { AuthSessionPayload } from './bridge-protocol'
import {
    OBSIDIAN_OAUTH_CALLBACK_URL,
    getObsidianHostedAuthUrl,
} from './bridge-protocol'
import {
    formatDroppedMemexResultCardCodeBlock,
    getEditorPositionAfterInsertedText,
    MEMEX_RESULT_CARD_CODE_BLOCK_LANGUAGE,
    MEMEX_RESULT_CARD_DRAG_MIME_TYPE,
    renderMemexResultCardBlock,
} from './result-card'
import { MEMEX_OBSIDIAN_VIEW_TYPE, MemexSidebarView } from './sidebar-view'

const OAUTH_PROTOCOL_ACTION = 'memex-auth'

interface StoredPluginData {
    authSession: AuthSessionPayload | null
}

const DEFAULT_DATA: StoredPluginData = {
    authSession: null,
}

class ResultCardRenderChild extends MarkdownRenderChild {
    constructor(
        containerEl: HTMLElement,
        private readonly plugin: MemexObsidianPlugin,
        private readonly source: string,
    ) {
        super(containerEl)
    }

    onload(): void {
        renderMemexResultCardBlock({
            app: this.plugin.app,
            containerEl: this.containerEl,
            plugin: this.plugin,
            source: this.source,
            onOpenNotes: (params) => this.plugin.openSearchNotesInSidebar(params),
        })
    }

    onunload(): void {
        this.containerEl.replaceChildren()
    }
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
                text.setPlaceholder(`${OBSIDIAN_OAUTH_CALLBACK_URL}?hash=...`)
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
            .setDesc('Start the hosted Memex login flow in your browser.')
            .addButton((button) => {
                button
                    .setButtonText('Login with Memex')
                    .setCta()
                    .onClick(() => {
                        void this.plugin.startLoginFlow()
                    })
            })

        new Setting(containerEl)
            .setName('Manual callback fallback')
            .setDesc(
                'Use this when callback redirect handling fails on your machine.',
            )
            .addButton((button) => {
                button
                    .setButtonText('Paste Callback URL')
                    .onClick(() => this.plugin.openCallbackUrlModal())
            })
    }
}

export class MemexObsidianPlugin extends Plugin {
    private dataState: StoredPluginData = DEFAULT_DATA

    async onload(): Promise<void> {
        await this.loadPluginData()

        this.registerView(
            MEMEX_OBSIDIAN_VIEW_TYPE,
            (leaf) => new MemexSidebarView(leaf, this),
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

        this.registerEvent(
            this.app.workspace.on('editor-drop', (event, editor) => {
                void this.handleEditorDrop(event, editor)
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
                context.addChild(new ResultCardRenderChild(el, this, source))
            },
        )
    }

    async onunload(): Promise<void> {
        this.app.workspace
            .getLeavesOfType(MEMEX_OBSIDIAN_VIEW_TYPE)
            .forEach((leaf) => leaf.detach())
    }

    getAuthSession(): AuthSessionPayload | null {
        return this.dataState.authSession
    }

    async toggleSidebar(): Promise<void> {
        const existingLeaves = this.app.workspace.getLeavesOfType(
            MEMEX_OBSIDIAN_VIEW_TYPE,
        )
        if (existingLeaves.length > 0) {
            existingLeaves.forEach((leaf) => leaf.detach())
            return
        }

        await this.ensureSidebarOpen()
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

    async startLoginFlow(): Promise<void> {
        const authUrl = getObsidianHostedAuthUrl()
        window.open(authUrl, '_blank', 'noopener,noreferrer')
        new Notice('Opened Memex login in your browser.')
    }

    openCallbackUrlModal(): void {
        const modal = new CallbackUrlModal(this.app, (callbackUrl) => {
            void this.completeOAuthFromCallbackUrl(callbackUrl)
        })
        modal.open()
    }

    async completeOAuthFromCallbackUrl(callbackUrl: string): Promise<void> {
        try {
            const session = parseAuthSessionPayload(callbackUrl)
            this.dataState = {
                ...this.dataState,
                authSession: session,
            }
            await this.persistPluginData()
            this.syncAuthSessionToOpenSidebars()
            new Notice('Memex login complete.')
        } catch (error) {
            new Notice(
                error instanceof Error
                    ? `OAuth callback failed: ${error.message}`
                    : 'OAuth callback failed.',
            )
        }
    }

    private async loadPluginData(): Promise<void> {
        const loaded = (await this.loadData()) as Partial<StoredPluginData> | null
        this.dataState = {
            ...DEFAULT_DATA,
            ...(loaded ?? {}),
        }
    }

    private async persistPluginData(): Promise<void> {
        await this.saveData(this.dataState)
    }

    private syncAuthSessionToOpenSidebars(): void {
        const sidebarLeaves = this.app.workspace.getLeavesOfType(
            MEMEX_OBSIDIAN_VIEW_TYPE,
        )

        for (const leaf of sidebarLeaves) {
            const sidebarView = leaf.view
            if (!(sidebarView instanceof MemexSidebarView)) {
                continue
            }

            sidebarView.syncAuthSession(this.dataState.authSession)
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

    private buildCallbackUrlFromProtocolParams(
        params: Record<string, string>,
    ): string | null {
        const query = new URLSearchParams()
        let hashPayload: string | null = null

        for (const [key, value] of Object.entries(params)) {
            const normalizedKey = key.trim()
            if (!normalizedKey || normalizedKey === 'action') {
                continue
            }

            if (normalizedKey === 'hash') {
                const normalizedHash = this.normalizeOAuthHashPayload(value)
                if (normalizedHash) {
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
        editor.replaceRange(`[[memex:${parsed.contentId}]]`, editor.getCursor())
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
}

function parseAuthSessionPayload(callbackUrl: string): AuthSessionPayload {
    const callback = new URL(callbackUrl)
    const hashParams = new URLSearchParams(callback.hash.replace(/^#/, ''))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const queryError =
        callback.searchParams.get('error_description') ??
        callback.searchParams.get('error')
    const hashError =
        hashParams.get('error_description') ?? hashParams.get('error')

    if (!accessToken || !refreshToken) {
        throw new Error(
            queryError ||
                hashError ||
                `Missing OAuth callback parameters in URL: ${callbackUrl}`,
        )
    }

    return {
        accessToken,
        refreshToken,
        expiresAt: extractJwtExpiration(accessToken),
        tokenType: 'bearer',
        providerToken: null,
        providerRefreshToken: null,
    }
}

function extractJwtExpiration(token: string): number | null {
    const parts = token.split('.')
    if (parts.length < 2) {
        return null
    }

    try {
        const payload = JSON.parse(decodeBase64Url(parts[1])) as {
            exp?: unknown
        }
        return typeof payload.exp === 'number' ? payload.exp : null
    } catch {
        return null
    }
}

function decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4
    const padded =
        padding === 0
            ? normalized
            : normalized.padEnd(normalized.length + (4 - padding), '=')
    return atob(padded)
}

export default MemexObsidianPlugin
