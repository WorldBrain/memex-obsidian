import type {
    AuthChangeEvent,
    Session as SupabaseSession,
} from '@supabase/supabase-js'
import type { AuthSessionPayload } from '@memex/common/features/auth/services/types'
import { toAuthSessionPayload } from '@memex/common/features/auth/services/supabase-base'

const OBSIDIAN_AUTH_SESSION_SECRET_ID = 'memex-auth-session'

type PersistedSupabaseSession = Pick<
    SupabaseSession,
    | 'access_token'
    | 'refresh_token'
    | 'expires_at'
    | 'token_type'
    | 'provider_token'
    | 'provider_refresh_token'
>

interface PersistedObsidianAuthSession {
    v: 1
    session: AuthSessionPayload
}

interface SecretStorageLike {
    getSecret(id: string): string | null
    setSecret(id: string, secret: string): void
}

interface SupabaseAuthLike {
    setSession(tokens: {
        access_token: string
        refresh_token: string
    }): Promise<{ error: Error | null }>
    getSession(): Promise<{
        data: { session: PersistedSupabaseSession | null }
        error: Error | null
    }>
    onAuthStateChange(
        callback: (
            event: AuthChangeEvent,
            session: PersistedSupabaseSession | null,
        ) => void,
    ): {
        data: {
            subscription: {
                unsubscribe(): void
            }
        }
    }
}

interface ObsidianAuthSessionPersistenceOptions {
    secretStorage: SecretStorageLike
    auth: SupabaseAuthLike
    secretId?: string
    onWarning?: (message: string, error?: unknown) => void
}

export class ObsidianAuthSessionPersistence {
    private readonly secretId: string
    private readonly onWarning?: (message: string, error?: unknown) => void

    constructor(
        private readonly options: ObsidianAuthSessionPersistenceOptions,
    ) {
        this.secretId = options.secretId ?? OBSIDIAN_AUTH_SESSION_SECRET_ID
        this.onWarning = options.onWarning
    }

    async restoreSession(): Promise<void> {
        const rawStoredSession = this.options.secretStorage.getSecret(
            this.secretId,
        )
        if (!rawStoredSession || rawStoredSession.trim().length === 0) {
            return
        }

        const storedSession = parseStoredObsidianAuthSession(rawStoredSession)
        if (storedSession == null) {
            this.clearStoredSession()
            return
        }

        const { error } = await this.options.auth.setSession({
            access_token: storedSession.accessToken,
            refresh_token: storedSession.refreshToken,
        })
        if (error) {
            this.warn(
                'Failed to restore persisted Obsidian auth session',
                error,
            )
            this.clearStoredSession()
        }
    }

    startSync(): () => void {
        const { data } = this.options.auth.onAuthStateChange(
            (_event, session) => {
                this.persistSession(session)
            },
        )

        return () => {
            data.subscription.unsubscribe()
        }
    }

    async syncCurrentSession(): Promise<void> {
        const { data, error } = await this.options.auth.getSession()
        if (error) {
            this.warn('Failed to sync current Obsidian auth session', error)
            return
        }

        this.persistSession(data.session)
    }

    private persistSession(session: PersistedSupabaseSession | null): void {
        try {
            if (session == null) {
                this.clearStoredSession()
                return
            }

            this.options.secretStorage.setSecret(
                this.secretId,
                serializeObsidianAuthSession(toAuthSessionPayload(session)),
            )
        } catch (error) {
            this.warn('Failed to persist Obsidian auth session', error)
        }
    }

    private clearStoredSession(): void {
        try {
            this.options.secretStorage.setSecret(this.secretId, '')
        } catch (error) {
            this.warn('Failed to clear persisted Obsidian auth session', error)
        }
    }

    private warn(message: string, error?: unknown): void {
        this.onWarning?.(message, error)
    }
}

export function serializeObsidianAuthSession(
    session: AuthSessionPayload,
): string {
    const payload: PersistedObsidianAuthSession = {
        v: 1,
        session,
    }

    return JSON.stringify(payload)
}

export function parseStoredObsidianAuthSession(
    rawValue: string | null | undefined,
): AuthSessionPayload | null {
    if (!rawValue || rawValue.trim().length === 0) {
        return null
    }

    try {
        const parsed = JSON.parse(
            rawValue,
        ) as Partial<PersistedObsidianAuthSession>
        if (parsed.v !== 1 || !isAuthSessionPayload(parsed.session)) {
            return null
        }

        return parsed.session
    } catch {
        return null
    }
}

function isAuthSessionPayload(value: unknown): value is AuthSessionPayload {
    if (value == null || typeof value !== 'object') {
        return false
    }

    const session = value as Partial<AuthSessionPayload>
    return (
        typeof session.accessToken === 'string' &&
        typeof session.refreshToken === 'string' &&
        isNullableNumber(session.expiresAt) &&
        isNullableString(session.tokenType) &&
        isNullableString(session.providerToken) &&
        isNullableString(session.providerRefreshToken)
    )
}

function isNullableString(value: unknown): value is string | null {
    return typeof value === 'string' || value == null
}

function isNullableNumber(value: unknown): value is number | null {
    return typeof value === 'number' || value == null
}
