import type { AuthSessionPayload } from '@memex/common/features/auth/services/types'
import type { ObsidianAuthServiceInterface } from '~/features/obsidian/services/auth'
import type { ObsidianAuthSessionStorageInterface } from './storage/auth-session'
export {
    parseStoredObsidianAuthSession,
    serializeObsidianAuthSession,
} from './storage/auth-session'

interface ObsidianAuthSessionPersistenceOptions {
    storage: ObsidianAuthSessionStorageInterface
    authService: ObsidianAuthServiceInterface
    onWarning?: (message: string, error?: unknown) => void
}

export class ObsidianAuthSessionLogic {
    private readonly onWarning?: (message: string, error?: unknown) => void
    private readonly authService: ObsidianAuthServiceInterface
    private readonly storage: ObsidianAuthSessionStorageInterface

    constructor(options: ObsidianAuthSessionPersistenceOptions) {
        this.onWarning = options.onWarning
        this.storage = options.storage
        this.authService = options.authService
    }

    async restoreSession(): Promise<void> {
        const { session: storedSession, invalid } = this.storage.load()
        if (invalid) {
            this.clearStoredSession()
            return
        }
        if (storedSession == null) {
            return
        }

        try {
            await this.authService.restoreSession(storedSession)
        } catch (error) {
            this.warn(
                'Failed to restore persisted Obsidian auth session',
                error,
            )
            this.clearStoredSession()
        }
    }

    startSync(): () => void {
        return this.authService.onSessionChanged((session) => {
            this.persistSession(session)
        })
    }

    async syncCurrentSession(): Promise<void> {
        try {
            const session = await this.authService.getSession()
            this.persistSession(session)
        } catch (error) {
            this.warn('Failed to sync current Obsidian auth session', error)
        }
    }

    private persistSession(session: AuthSessionPayload | null): void {
        try {
            if (session == null) {
                this.clearStoredSession()
                return
            }

            this.storage.save(session)
        } catch (error) {
            this.warn('Failed to persist Obsidian auth session', error)
        }
    }

    private clearStoredSession(): void {
        try {
            this.storage.clear()
        } catch (error) {
            this.warn('Failed to clear persisted Obsidian auth session', error)
        }
    }

    private warn(message: string, error?: unknown): void {
        this.onWarning?.(message, error)
    }
}

/** Compatibility alias for existing Obsidian entry consumers. */
export class ObsidianAuthSessionPersistence extends ObsidianAuthSessionLogic {}
