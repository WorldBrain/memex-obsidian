import { describe, expect, it } from 'vitest'
import { OBSIDIAN_INLINE_RESULT_CARD_ICONS } from './inline-result-card-icons'

describe('OBSIDIAN_INLINE_RESULT_CARD_ICONS', () => {
    it('encodes inline SVG icons as data URLs for CSS mask usage', () => {
        for (const iconUrl of Object.values(
            OBSIDIAN_INLINE_RESULT_CARD_ICONS,
        )) {
            expect(iconUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true)
            expect(iconUrl.includes('<svg')).toBe(false)
        }
    })
})
