import { ItemView, WorkspaceLeaf } from 'obsidian'
import type { ObsidianRuntime } from './runtime'
import type { ObsidianSidebarSessionCache } from './sidebar-session-cache'
import {
    OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
    type MemexSidebarHostMessage,
} from '~/features/obsidian/sidebar-iframe-bridge'

export const MEMEX_OBSIDIAN_VIEW_TYPE = 'memex-sidebar'

export class MemexSidebarView extends ItemView {
    constructor(
        leaf: WorkspaceLeaf,
        private readonly runtime: ObsidianRuntime,
        private readonly sidebarSessionCache: ObsidianSidebarSessionCache,
    ) {
        super(leaf)
    }

    getViewType(): string {
        return MEMEX_OBSIDIAN_VIEW_TYPE
    }

    getDisplayText(): string {
        return 'Memex Sidebar'
    }

    async onOpen(): Promise<void> {
        await this.runtime.ensureContext()
        this.sidebarSessionCache.attach(this.contentEl)
    }

    async onClose(): Promise<void> {
        this.sidebarSessionCache.park()
    }

    openSearchNotes(params: { contentEntityId: string; title: string }): void {
        const message: MemexSidebarHostMessage = {
            type: 'memex:host:event',
            bridgeVersion: OBSIDIAN_SIDEBAR_BRIDGE_VERSION,
            event: {
                type: 'openSearchNotes',
                contentEntityId: params.contentEntityId,
                title: params.title,
            },
        }

        this.sidebarSessionCache.postMessage(message)
    }
}
