export interface ObsidianTimerServiceInterface {
    scheduleRepeating(callback: () => void, intervalMs: number): number
    cancel(intervalId: number): void
}

export class ObsidianTimerService implements ObsidianTimerServiceInterface {
    scheduleRepeating(callback: () => void, intervalMs: number): number {
        return window.setInterval(callback, intervalMs)
    }

    cancel(intervalId: number): void {
        window.clearInterval(intervalId)
    }
}
