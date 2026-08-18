import type { AuthSessionPayload } from '@memex/common/features/auth/services/types'

const OBSIDIAN_AUTH_SESSION_SECRET_ID = 'memex-auth-session'

interface PersistedObsidianAuthSession {
    v: 1
    session: AuthSessionPayload
}

export interface ObsidianSecretStorageLike {
    getSecret(id: string): string | null
    setSecret(id: string, secret: string): void
}

export interface ObsidianAuthSessionStorageInterface {
    load(): {
        session: AuthSessionPayload | null
        invalid: boolean
    }
    save(session: AuthSessionPayload): void
    clear(): void
}

export class ObsidianAuthSessionStorage implements ObsidianAuthSessionStorageInterface {
    private readonly secretId: string

    constructor(
        private readonly secretStorage: ObsidianSecretStorageLike,
        secretId = OBSIDIAN_AUTH_SESSION_SECRET_ID,
    ) {
        this.secretId = secretId
    }

    load(): { session: AuthSessionPayload | null; invalid: boolean } {
        const rawSession = this.secretStorage.getSecret(this.secretId)
        const session = parseStoredObsidianAuthSession(rawSession)
        return {
            session,
            invalid: Boolean(rawSession?.trim()) && session == null,
        }
    }

    save(session: AuthSessionPayload): void {
        this.secretStorage.setSecret(
            this.secretId,
            serializeObsidianAuthSession(session),
        )
    }

    clear(): void {
        this.secretStorage.setSecret(this.secretId, '')
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
