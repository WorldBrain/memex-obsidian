import type {
    CommonJson,
    CommonSupabaseClient,
} from '@memex/common/storage/supabase-types'

type UnknownRecord = Record<string, unknown>

export interface ObsidianPullImportStorageRule {
    ruleId: string
    ruleOrder: number
    contentTypes: string[]
}

export interface PollObsidianImportsParams {
    sinceUpdatedAt: string
    rules: ObsidianPullImportStorageRule[]
    limit: number
}

export interface ObsidianPullImportStorageInterface {
    pollImports(params: PollObsidianImportsParams): Promise<unknown>
    loadTagNames(tagIds: string[]): Promise<string[]>
    loadContentEntityMetadata(contentId: string): Promise<UnknownRecord | null>
}

export class ObsidianPullImportStorage implements ObsidianPullImportStorageInterface {
    constructor(private readonly supabaseClient: CommonSupabaseClient) {}

    async pollImports(params: PollObsidianImportsParams): Promise<unknown> {
        const { data, error } = await this.supabaseClient.rpc(
            'memex_poll_obsidian_imports',
            {
                p_since_updated_at: params.sinceUpdatedAt,
                p_rules: params.rules as unknown as CommonJson,
                p_limit: params.limit,
            },
        )

        if (error != null) {
            throw error
        }

        return data
    }

    async loadTagNames(tagIds: string[]): Promise<string[]> {
        const { data, error } = await this.supabaseClient
            .from('user_tags')
            .select('id,name')
            .in('id', tagIds)

        if (error != null) {
            throw error
        }

        const tagNamesById = new Map<string, string>()
        for (const row of Array.isArray(data) ? data : []) {
            if (!isRecord(row)) {
                continue
            }

            const id = normalizeString(row.id)
            const name = normalizeString(row.name)
            if (id && name) {
                tagNamesById.set(id, name)
            }
        }

        return tagIds
            .map((tagId) => tagNamesById.get(tagId) ?? '')
            .filter(Boolean)
    }

    async loadContentEntityMetadata(
        contentId: string,
    ): Promise<UnknownRecord | null> {
        const { data, error } = await this.supabaseClient
            .from('content_entities')
            .select('metadata')
            .eq('id', contentId)
            .maybeSingle()

        if (error != null) {
            throw error
        }

        return isRecord(data?.metadata) ? data.metadata : null
    }
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is UnknownRecord {
    return value != null && typeof value === 'object' && !Array.isArray(value)
}
