import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(
    (process as unknown as { cwd: () => string }).cwd(),
    '..',
)
const migrationSql = readFileSync(
    resolve(
        repoRoot,
        'supabase',
        'migrations',
        '20260620120000_memex_obsidian_pull_imports_rpc.sql',
    ),
    'utf8',
)

describe('memex_poll_obsidian_imports migration contract', () => {
    it('accepts rule groups and expands ready rows into matching rules', () => {
        expect(migrationSql).toContain(
            'create or replace function public.memex_poll_obsidian_imports',
        )
        expect(migrationSql).toContain('p_rules jsonb')
        expect(migrationSql).toContain("rule_entry->>'ruleId'")
        expect(migrationSql).toContain("rule_entry->>'ruleOrder'")
        expect(migrationSql).toContain("rule_entry->'contentTypes'")
        expect(migrationSql).toContain(
            'ready_row.content_type = any(rule_row.content_types)',
        )
        expect(migrationSql).toContain(
            'order by rule_order asc, updated_at asc, content_id asc',
        )
    })

    it('uses the authenticated user library and indexing-done readiness gate', () => {
        expect(migrationSql).toContain('v_user_id uuid := auth.uid()')
        expect(migrationSql).toContain('uce.user_id = v_user_id')
        expect(migrationSql).toContain(
            "coalesce(ce.metadata->>'status', '') = 'indexing-done'",
        )
        expect(migrationSql).toContain("status <> 'indexing-done'")
        expect(migrationSql).toContain('ce.updated_at > v_since_updated_at')
        expect(migrationSql).toContain('ce.updated_at < v_blocked_at')
    })

    it('returns the JSON shape the Obsidian importer parses', () => {
        for (const key of [
            "'items'",
            "'next_updated_at'",
            "'blocked_at'",
            "'has_more'",
            "'rule_id'",
            "'rule_order'",
            "'content_id'",
            "'library_id'",
            "'content_type'",
            "'updated_at'",
            "'metadata'",
        ]) {
            expect(migrationSql).toContain(key)
        }
    })

    it('adds parent metadata for annotations so Obsidian can append to the parent note', () => {
        expect(migrationSql).toContain('user_content_entity_references')
        expect(migrationSql).toContain('selector_ref.source_library_id')
        expect(migrationSql).toContain("'parent_content_id'")
        expect(migrationSql).toContain("'parent_library_id'")
        expect(migrationSql).toContain("'parent_content_type'")
        expect(migrationSql).toContain("'target_entity'")
        expect(migrationSql).toContain(
            "ce.type = 'annotation'::public.content_entity_type",
        )
    })
})
