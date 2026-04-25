const RESULT_CARD_SURFACE_SELECTOR = '.result-card-frame'

const RESULT_CARD_INTERACTIVE_TARGET_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[data-result-card-interactive="true"]',
    '[data-inline-video-player="true"]',
    '[data-result-card-action-menu="true"]',
    '[data-result-card-tag-pill="true"]',
    '[data-testid="mobile-action-sheet-panel"]',
].join(',')

function findAncestorWithinContainer(
    containerEl: HTMLElement,
    target: HTMLElement | null,
    selector: string,
): HTMLElement | null {
    let current: HTMLElement | null = target
    while (current != null && current !== containerEl) {
        if (current.matches(selector)) {
            return current
        }
        current = current.parentElement
    }

    return null
}

export function shouldHandleObsidianResultCardContainerClick(params: {
    containerEl: HTMLElement
    target: HTMLElement | null
}): boolean {
    if (params.target == null) {
        return false
    }

    if (
        findAncestorWithinContainer(
            params.containerEl,
            params.target,
            RESULT_CARD_INTERACTIVE_TARGET_SELECTOR,
        ) != null
    ) {
        return false
    }

    if (
        findAncestorWithinContainer(
            params.containerEl,
            params.target,
            RESULT_CARD_SURFACE_SELECTOR,
        ) != null
    ) {
        return false
    }

    return true
}
