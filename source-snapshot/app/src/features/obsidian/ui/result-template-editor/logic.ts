import { Logic } from '@memex/common/features/ui-logic/logic'
import type { DragEvent } from 'react'
import {
    OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE,
    type ObsidianImportContentType,
} from '~/entries/obsidian/pull-import-definitions'
import {
    getResultTemplateSetting,
    type ResultTemplateMode,
    type ResultTemplateSetting,
    type ResultTemplateSettings,
} from '@memex/common/features/result-templates'

export interface ResultTemplateEditorDependencies {
    initialContentType: ObsidianImportContentType
    settings: ResultTemplateSettings
    showEmbedOption: boolean
    onSave: (settings: ResultTemplateSettings) => Promise<void>
    onClose: () => void
    window: Window
}

export interface ResultTemplateEditorState {
    selectedContentType: ObsidianImportContentType
    mode: ResultTemplateMode
    template: string
    draftSettings: ResultTemplateSettings
    isDraggingPlaceholder: boolean
    placeholderQuery: string
}

export class ResultTemplateEditorLogic extends Logic<
    ResultTemplateEditorDependencies,
    ResultTemplateEditorState
> {
    getInitialState(): ResultTemplateEditorState {
        const draftSettings = { ...this.deps.settings }
        return {
            ...this.getStateForContentType(
            this.deps.initialContentType,
            draftSettings,
            ),
            isDraggingPlaceholder: false,
            placeholderQuery: '',
        }
    }

    setPlaceholderQuery = (placeholderQuery: string): void =>
        this.setState({ placeholderQuery })

    setDraggingPlaceholder = (isDraggingPlaceholder: boolean): void =>
        this.setState({ isDraggingPlaceholder })

    handlePlaceholderDrop = (
        event: DragEvent<HTMLTextAreaElement>,
        mimeType: string,
    ): void => {
        const path = event.dataTransfer.getData(mimeType)
        if (path.length === 0) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        const textArea = event.currentTarget
        const selectionStart = textArea.selectionStart ?? this.state.template.length
        const selectionEnd = textArea.selectionEnd ?? selectionStart
        const placeholder = `{{${path}}}`
        this.insertPlaceholder(path, { selectionStart, selectionEnd })
        this.setDraggingPlaceholder(false)
        this.deps.window.requestAnimationFrame(() => {
            const caretPosition = selectionStart + placeholder.length
            textArea.focus()
            textArea.setSelectionRange(caretPosition, caretPosition)
        })
    }

    selectContentType = (contentType: ObsidianImportContentType): void => {
        this.setState(
            this.getStateForContentType(contentType, this.state.draftSettings),
        )
    }

    setMode = (mode: ResultTemplateMode): void => {
        const template =
            mode === 'custom' && this.state.template.trim().length === 0
                ? buildStarterTemplate(this.state.selectedContentType)
                : this.state.template

        this.setCurrentSetting({ mode, template })
    }

    setTemplate = (template: string): void => {
        this.setCurrentSetting({
            mode: this.state.mode,
            template,
        })
    }

    insertPlaceholder = (
        path: string,
        selection?: { selectionStart: number; selectionEnd: number },
    ): void => {
        const placeholder = `{{${path}}}`
        if (selection != null) {
            this.setCurrentSetting({
                mode: this.state.mode,
                template: `${this.state.template.slice(0, selection.selectionStart)}${placeholder}${this.state.template.slice(selection.selectionEnd)}`,
            })
            return
        }

        const separator = this.state.template.trim().length === 0 ? '' : ' '
        this.setCurrentSetting({
            mode: this.state.mode,
            template: `${this.state.template}${separator}${placeholder}`,
        })
    }

    save = async (): Promise<void> => {
        if (
            this.state.mode === 'custom' &&
            this.state.template.trim().length === 0
        ) {
            return
        }

        await this.deps.onSave(this.state.draftSettings)
        this.deps.onClose()
    }

    private setCurrentSetting(setting: ResultTemplateSetting): void {
        this.setState({
            mode: setting.mode,
            template: setting.template,
            draftSettings: {
                ...this.state.draftSettings,
                [this.state.selectedContentType]: setting,
            },
        })
    }

    private getStateForContentType(
        contentType: ObsidianImportContentType,
        draftSettings: ResultTemplateSettings,
    ): ResultTemplateEditorState {
        const setting = getResultTemplateSetting(draftSettings, contentType)
        const mode = this.deps.showEmbedOption ? setting.mode : 'custom'
        const template =
            mode === 'custom' && setting.template.trim().length === 0
                ? buildStarterTemplate(contentType)
                : setting.template
        const nextDraftSettings = {
            ...draftSettings,
            [contentType]: { mode, template },
        }

        return {
            selectedContentType: contentType,
            mode,
            template,
            draftSettings: nextDraftSettings,
            isDraggingPlaceholder: this.state?.isDraggingPlaceholder ?? false,
            placeholderQuery: this.state?.placeholderQuery ?? '',
        }
    }
}

function buildStarterTemplate(contentType: ObsidianImportContentType): string {
    const definition =
        OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE.get(contentType)
    const paths = new Set(
        definition?.placeholders.map((placeholder) => placeholder.path) ?? [],
    )
    const titlePath = [
        'title',
        'author_name',
        'name',
        'text',
        'description',
        'id',
    ].find((path) => paths.has(path))
    const bodyPath = [
        'summary_markdown',
        'summary',
        'text',
        'description',
    ].find((path) => path !== titlePath && paths.has(path))
    const sourcePath = ['url', 'source_url', 'normalized_url'].find((path) =>
        paths.has(path),
    )
    const sections = [
        titlePath != null ? `# {{${titlePath}}}` : null,
        bodyPath != null ? `{{${bodyPath}}}` : null,
        sourcePath != null ? `[Source]({{${sourcePath}}})` : null,
    ].filter((section): section is string => section != null)

    return sections.length > 0 ? sections.join('\n\n') : '{{id}}'
}
