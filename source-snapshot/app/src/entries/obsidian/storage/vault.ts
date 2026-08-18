import type { App, TAbstractFile, TFile, Vault } from 'obsidian'

export interface ObsidianVaultStorageInterface {
    ensureFolder(folderPath: string): Promise<void>
    getFile(path: string): TAbstractFile | null
    isMarkdownFile(file: TAbstractFile): file is TFile
    createFile(path: string, contents: string): Promise<TFile>
    readFile(file: TFile): Promise<string>
    processFile(
        file: TFile,
        transform: (contents: string) => string,
    ): Promise<void>
    findMarkdownFile(params: {
        matches: (markdown: string) => boolean
    }): Promise<TFile | null>
}

export class ObsidianVaultStorage implements ObsidianVaultStorageInterface {
    private readonly vault: Vault

    constructor(app: Pick<App, 'vault'>) {
        this.vault = app.vault
    }

    async ensureFolder(folderPath: string): Promise<void> {
        const normalizedPath = normalizePath(folderPath)
        const segments = normalizedPath.split('/').filter(Boolean)
        let currentPath = ''

        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment

            if (this.vault.getAbstractFileByPath(currentPath) != null) {
                continue
            }

            await this.vault.createFolder(currentPath)
        }
    }

    getFile(path: string): TAbstractFile | null {
        return this.vault.getAbstractFileByPath(path)
    }

    isMarkdownFile(file: TAbstractFile): file is TFile {
        return this.vault
            .getMarkdownFiles()
            .some((markdownFile) => markdownFile.path === file.path)
    }

    async createFile(path: string, contents: string): Promise<TFile> {
        return this.vault.create(path, contents)
    }

    async readFile(file: TFile): Promise<string> {
        return this.vault.read(file)
    }

    async processFile(
        file: TFile,
        transform: (contents: string) => string,
    ): Promise<void> {
        await this.vault.process(file, transform)
    }

    async findMarkdownFile(params: {
        matches: (markdown: string) => boolean
    }): Promise<TFile | null> {
        for (const file of this.vault.getMarkdownFiles()) {
            const markdown = await this.vault.read(file)
            if (params.matches(markdown)) {
                return file
            }
        }

        return null
    }
}

function normalizePath(path: string): string {
    return path
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/|\/$/g, '')
}
