import type {
    AuthChangeEvent,
    Session as SupabaseSession,
} from '@supabase/supabase-js'
import type { AuthSessionPayload } from '@memex/common/features/auth/services/types'
import { toAuthSessionPayload } from '@memex/common/features/auth/services/supabase-base'

type ObsidianSupabaseSession = Pick<
    SupabaseSession,
    | 'access_token'
    | 'refresh_token'
    | 'expires_at'
    | 'token_type'
    | 'provider_token'
    | 'provider_refresh_token'
>

export interface ObsidianSupabaseAuthLike {
    setSession(tokens: {
        access_token: string
        refresh_token: string
    }): Promise<{ error: Error | null }>
    getSession(): Promise<{
        data: { session: ObsidianSupabaseSession | null }
        error: Error | null
    }>
    onAuthStateChange(
        callback: (
            event: AuthChangeEvent,
            session: ObsidianSupabaseSession | null,
        ) => void,
    ): {
        data: {
            subscription: {
                unsubscribe(): void
            }
        }
    }
}

export interface ObsidianAuthServiceInterface {
    restoreSession(session: AuthSessionPayload): Promise<void>
    getSession(): Promise<AuthSessionPayload | null>
    onSessionChanged(
        callback: (session: AuthSessionPayload | null) => void,
    ): () => void
}

export class ObsidianAuthService implements ObsidianAuthServiceInterface {
    constructor(private readonly auth: ObsidianSupabaseAuthLike) {}

    async restoreSession(session: AuthSessionPayload): Promise<void> {
        const { error } = await this.auth.setSession({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
        })
        if (error != null) {
            throw error
        }
    }

    async getSession(): Promise<AuthSessionPayload | null> {
        const { data, error } = await this.auth.getSession()
        if (error != null) {
            throw error
        }

        return data.session == null ? null : toAuthSessionPayload(data.session)
    }

    onSessionChanged(
        callback: (session: AuthSessionPayload | null) => void,
    ): () => void {
        const { data } = this.auth.onAuthStateChange(
            (
                _event: AuthChangeEvent,
                session: ObsidianSupabaseSession | null,
            ) => {
                callback(session == null ? null : toAuthSessionPayload(session))
            },
        )

        return () => data.subscription.unsubscribe()
    }
}
