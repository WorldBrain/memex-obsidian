import { describe, expect, it, vi } from 'vitest'
import type {
    AuthChangeEvent,
    Session as SupabaseSession,
} from '@supabase/supabase-js'
import type { AuthSessionPayload } from '@memex/common/features/auth/services/types'
import {
    ObsidianAuthSessionPersistence,
    parseStoredObsidianAuthSession,
    serializeObsidianAuthSession,
} from './auth-session-persistence'

type PersistedSupabaseSession = Pick<
    SupabaseSession,
    | 'access_token'
    | 'refresh_token'
    | 'expires_at'
    | 'token_type'
    | 'provider_token'
    | 'provider_refresh_token'
>

const TEST_SESSION: AuthSessionPayload = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: 123,
    tokenType: 'bearer',
    providerToken: null,
    providerRefreshToken: null,
}

describe('parseStoredObsidianAuthSession', () => {
    it('returns null for empty or invalid values', () => {
        expect(parseStoredObsidianAuthSession(null)).toBeNull()
        expect(parseStoredObsidianAuthSession('')).toBeNull()
        expect(parseStoredObsidianAuthSession('{')).toBeNull()
        expect(
            parseStoredObsidianAuthSession(JSON.stringify({ v: 2 })),
        ).toBeNull()
    })

    it('returns the stored auth session for valid payloads', () => {
        expect(
            parseStoredObsidianAuthSession(
                serializeObsidianAuthSession(TEST_SESSION),
            ),
        ).toEqual(TEST_SESSION)
    })
})

describe('ObsidianAuthSessionPersistence', () => {
    it('restores a valid stored session', async () => {
        const { persistence, auth } = setup({
            storedSecret: serializeObsidianAuthSession(TEST_SESSION),
        })

        await persistence.restoreSession()

        expect(auth.setSession).toHaveBeenCalledWith({
            access_token: TEST_SESSION.accessToken,
            refresh_token: TEST_SESSION.refreshToken,
        })
    })

    it('clears the stored secret when the payload is invalid', async () => {
        const { persistence, secretStorage, auth } = setup({
            storedSecret: '{"invalid":true}',
        })

        await persistence.restoreSession()

        expect(auth.setSession).not.toHaveBeenCalled()
        expect(secretStorage.setSecret).toHaveBeenCalledWith(
            'memex-auth-session',
            '',
        )
    })

    it('clears the stored secret when session restore fails', async () => {
        const { persistence, secretStorage } = setup({
            storedSecret: serializeObsidianAuthSession(TEST_SESSION),
            setSessionError: new Error('restore failed'),
        })

        await persistence.restoreSession()

        expect(secretStorage.setSecret).toHaveBeenCalledWith(
            'memex-auth-session',
            '',
        )
    })

    it('syncs the current Supabase session into secret storage', async () => {
        const currentSession = createSupabaseSession({
            access_token: 'fresh-access-token',
            refresh_token: 'fresh-refresh-token',
        })
        const { persistence, secretStorage } = setup({
            currentSession,
        })

        await persistence.syncCurrentSession()

        expect(secretStorage.setSecret).toHaveBeenLastCalledWith(
            'memex-auth-session',
            serializeObsidianAuthSession({
                accessToken: 'fresh-access-token',
                refreshToken: 'fresh-refresh-token',
                expiresAt: currentSession.expires_at ?? null,
                tokenType: currentSession.token_type ?? null,
                providerToken: currentSession.provider_token ?? null,
                providerRefreshToken:
                    currentSession.provider_refresh_token ?? null,
            }),
        )
    })

    it('tracks auth state changes and clears the secret on sign-out', () => {
        const { persistence, secretStorage, emitAuthStateChange, unsubscribe } =
            setup()

        const stopSync = persistence.startSync()

        emitAuthStateChange(
            'SIGNED_IN',
            createSupabaseSession({
                access_token: 'signed-in-access-token',
                refresh_token: 'signed-in-refresh-token',
            }),
        )

        expect(secretStorage.setSecret).toHaveBeenNthCalledWith(
            1,
            'memex-auth-session',
            serializeObsidianAuthSession({
                accessToken: 'signed-in-access-token',
                refreshToken: 'signed-in-refresh-token',
                expiresAt: 123,
                tokenType: 'bearer',
                providerToken: null,
                providerRefreshToken: null,
            }),
        )

        emitAuthStateChange('SIGNED_OUT', null)

        expect(secretStorage.setSecret).toHaveBeenNthCalledWith(
            2,
            'memex-auth-session',
            '',
        )

        stopSync()

        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })
})

function setup(options?: {
    storedSecret?: string | null
    currentSession?: PersistedSupabaseSession | null
    setSessionError?: Error | null
}) {
    let authStateListener:
        | ((
              event: AuthChangeEvent,
              session: PersistedSupabaseSession | null,
          ) => void)
        | null = null

    const secretStorage = {
        getSecret: vi.fn((id: string) =>
            id === 'memex-auth-session'
                ? (options?.storedSecret ?? null)
                : null,
        ),
        setSecret: vi.fn(),
    }

    const unsubscribe = vi.fn()
    const auth = {
        setSession: vi.fn().mockResolvedValue({
            error: options?.setSessionError ?? null,
        }),
        getSession: vi.fn().mockResolvedValue({
            data: { session: options?.currentSession ?? null },
            error: null,
        }),
        onAuthStateChange: vi.fn((callback) => {
            authStateListener = callback
            return {
                data: {
                    subscription: {
                        unsubscribe,
                    },
                },
            }
        }),
    }

    const persistence = new ObsidianAuthSessionPersistence({
        secretStorage,
        auth,
    })

    return {
        persistence,
        secretStorage,
        auth,
        unsubscribe,
        emitAuthStateChange(
            event: AuthChangeEvent,
            session: PersistedSupabaseSession | null,
        ) {
            authStateListener?.(event, session)
        },
    }
}

function createSupabaseSession(
    overrides: Partial<PersistedSupabaseSession> = {},
): PersistedSupabaseSession {
    return {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: 123,
        token_type: 'bearer',
        provider_token: null,
        provider_refresh_token: null,
        ...overrides,
    }
}
