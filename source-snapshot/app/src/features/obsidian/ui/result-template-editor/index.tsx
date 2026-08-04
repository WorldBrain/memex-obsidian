import { ButtonComponent } from '@memex/common/features/button-component'
import { Radio } from '@memex/common/features/ui-components/radio'
import { TextArea } from '@memex/common/features/ui-components/text-area'
import { TextField } from '@memex/common/features/ui-components/text-field'
import { useLogic } from '@memex/common/features/ui-logic/hook'
import React from 'react'
import styled from 'styled-components'
import {
    OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS,
    OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE,
    type ObsidianImportContentType,
    type TemplatePlaceholderDefinition,
} from '~/entries/obsidian/pull-import-definitions'
import type {
    ResultTemplateMetadata,
    ResultTemplateSettings,
} from '@memex/common/features/result-templates'
import { ResultTemplateEditorLogic } from './logic'

const RESULT_TEMPLATE_PLACEHOLDER_MIME_TYPE =
    'application/x-memex-result-template-placeholder'

export interface ResultTemplateEditorProps {
    initialContentType: ObsidianImportContentType
    currentContentTypeMetadata: ResultTemplateMetadata
    settings: ResultTemplateSettings
    showEmbedOption: boolean
    onSave: (settings: ResultTemplateSettings) => Promise<void>
    onClose: () => void
}

export const ResultTemplateEditor: React.FC<ResultTemplateEditorProps> = ({
    initialContentType,
    currentContentTypeMetadata,
    settings,
    showEmbedOption,
    onSave,
    onClose,
}) => {
    const [isDraggingPlaceholder, setIsDraggingPlaceholder] =
        React.useState(false)
    const [placeholderQuery, setPlaceholderQuery] = React.useState('')
    const { logic, state } = useLogic(ResultTemplateEditorLogic, {
        initialContentType,
        settings,
        showEmbedOption,
        onSave,
        onClose,
    })
    const selectedDefinition =
        OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITION_BY_TYPE.get(
            state.selectedContentType,
        )
    const placeholders = mergePlaceholderDefinitions(
        selectedDefinition?.placeholders ?? [],
        state.selectedContentType === initialContentType
            ? getMetadataPlaceholderDefinitions(currentContentTypeMetadata)
            : [],
    )
    const normalizedPlaceholderQuery = placeholderQuery.trim().toLowerCase()
    const filteredPlaceholders =
        normalizedPlaceholderQuery.length === 0
            ? placeholders
            : placeholders.filter(
                  (placeholder) =>
                      placeholder.path
                          .toLowerCase()
                          .includes(normalizedPlaceholderQuery) ||
                      placeholder.label
                          .toLowerCase()
                          .includes(normalizedPlaceholderQuery),
              )
    const isSaveDisabled =
        state.mode === 'custom' && state.template.trim().length === 0
    const handlePlaceholderDrop = (
        event: React.DragEvent<HTMLTextAreaElement>,
    ): void => {
        const path = event.dataTransfer.getData(
            RESULT_TEMPLATE_PLACEHOLDER_MIME_TYPE,
        )
        if (path.length === 0) {
            return
        }

        event.preventDefault()
        event.stopPropagation()
        const textArea = event.currentTarget
        const selectionStart = textArea.selectionStart ?? state.template.length
        const selectionEnd = textArea.selectionEnd ?? selectionStart
        const placeholder = `{{${path}}}`
        logic.insertPlaceholder(path, { selectionStart, selectionEnd })
        setIsDraggingPlaceholder(false)

        window.requestAnimationFrame(() => {
            const caretPosition = selectionStart + placeholder.length
            textArea.focus()
            textArea.setSelectionRange(caretPosition, caretPosition)
        })
    }

    return (
        <EditorRoot data-result-card-interactive="true">
            <Header>
                <HeaderText>
                    <Title>Result template</Title>
                    <Subtitle>
                        Choose how copied and dragged results are formatted.
                    </Subtitle>
                </HeaderText>
                <HeaderActions>
                    <ButtonComponent
                        type="secondary"
                        size="sm"
                        label="Cancel"
                        onClick={onClose}
                    />
                    <ButtonComponent
                        type="primary"
                        size="sm"
                        label="Save template"
                        disabled={isSaveDisabled}
                        onClick={logic.save}
                    />
                </HeaderActions>
            </Header>
            <EditorBody>
                <ContentTypeList aria-label="Content types">
                    {OBSIDIAN_IMPORT_CONTENT_TYPE_DEFINITIONS.map(
                        (definition) => (
                            <ContentTypeButton
                                key={definition.type}
                                type="button"
                                $selected={
                                    definition.type ===
                                    state.selectedContentType
                                }
                                onClick={() =>
                                    logic.selectContentType(definition.type)
                                }
                            >
                                {definition.label}
                            </ContentTypeButton>
                        ),
                    )}
                </ContentTypeList>
                <TemplateColumn>
                    <SectionHeading>
                        {selectedDefinition?.label ?? state.selectedContentType}
                    </SectionHeading>
                    <ModeOptions>
                        {showEmbedOption && (
                            <ModeCard
                                $selected={state.mode === 'embed'}
                                onClick={() => logic.setMode('embed')}
                            >
                                <Radio
                                    name="result-template-mode"
                                    checked={state.mode === 'embed'}
                                    onChange={() => logic.setMode('embed')}
                                    label="Embed card"
                                />
                                <ModeDescription>
                                    Insert the interactive Memex card. This is
                                    the default in Obsidian.
                                </ModeDescription>
                            </ModeCard>
                        )}
                        <ModeCard
                            $selected={state.mode === 'custom'}
                            onClick={() => logic.setMode('custom')}
                        >
                            <Radio
                                name="result-template-mode"
                                checked={state.mode === 'custom'}
                                onChange={() => logic.setMode('custom')}
                                label="Custom Markdown"
                            />
                            <ModeDescription>
                                Render your own Markdown with result fields.
                            </ModeDescription>
                        </ModeCard>
                    </ModeOptions>
                    {state.mode === 'custom' && (
                        <CustomTemplateSection>
                            <FieldLabel htmlFor="result-template">
                                Markdown template
                            </FieldLabel>
                            <TemplateTextArea
                                id="result-template"
                                value={state.template}
                                onChange={logic.setTemplate}
                                $isDropTargetActive={isDraggingPlaceholder}
                                onDragOver={(event) => {
                                    if (
                                        !event.dataTransfer.types.includes(
                                            RESULT_TEMPLATE_PLACEHOLDER_MIME_TYPE,
                                        )
                                    ) {
                                        return
                                    }

                                    event.preventDefault()
                                    event.stopPropagation()
                                    event.dataTransfer.dropEffect = 'copy'
                                }}
                                onDrop={handlePlaceholderDrop}
                                rows={9}
                                resize="vertical"
                                spellCheck={false}
                                ariaLabel="Markdown result template"
                            />
                            <PlaceholderHeader>
                                <PlaceholderTitleGroup>
                                    <PlaceholderHeading>
                                        Available placeholders
                                    </PlaceholderHeading>
                                    <ButtonComponent
                                        type="naked"
                                        size="xs"
                                        icon="info"
                                        iconSize="14px"
                                        ariaLabel="About template placeholders"
                                        tooltip="Click a placeholder to append it to the template, or drag it into the Markdown field."
                                        tooltipPlacement="top"
                                    />
                                </PlaceholderTitleGroup>
                                <PlaceholderSearchField
                                    value={placeholderQuery}
                                    onChange={setPlaceholderQuery}
                                    placeholder="Search placeholders"
                                    ariaLabel="Search available placeholders"
                                    icon="searchIcon"
                                    size="sm"
                                />
                            </PlaceholderHeader>
                            <PlaceholderList>
                                {filteredPlaceholders.length > 0 ? (
                                    filteredPlaceholders.map((placeholder) => (
                                        <PlaceholderButton
                                            key={placeholder.path}
                                            type="button"
                                            title={placeholder.label}
                                            draggable
                                            aria-label={`Insert {{${placeholder.path}}}`}
                                            onDragStart={(event) => {
                                                event.stopPropagation()
                                                event.dataTransfer.effectAllowed =
                                                    'copy'
                                                event.dataTransfer.setData(
                                                    RESULT_TEMPLATE_PLACEHOLDER_MIME_TYPE,
                                                    placeholder.path,
                                                )
                                                event.dataTransfer.setData(
                                                    'text/plain',
                                                    `{{${placeholder.path}}}`,
                                                )
                                                setIsDraggingPlaceholder(true)
                                            }}
                                            onDragEnd={(event) => {
                                                event.stopPropagation()
                                                setIsDraggingPlaceholder(false)
                                            }}
                                            onClick={() =>
                                                logic.insertPlaceholder(
                                                    placeholder.path,
                                                )
                                            }
                                        >
                                            <PlaceholderToken>
                                                {`{{${placeholder.path}}}`}
                                            </PlaceholderToken>
                                            <PlaceholderLabel>
                                                {placeholder.label}
                                            </PlaceholderLabel>
                                        </PlaceholderButton>
                                    ))
                                ) : (
                                    <PlaceholderEmptyState>
                                        No placeholders found
                                    </PlaceholderEmptyState>
                                )}
                            </PlaceholderList>
                        </CustomTemplateSection>
                    )}
                </TemplateColumn>
            </EditorBody>
        </EditorRoot>
    )
}

function mergePlaceholderDefinitions(
    ...definitionLists: TemplatePlaceholderDefinition[][]
): TemplatePlaceholderDefinition[] {
    const definitions = new Map<string, TemplatePlaceholderDefinition>()
    for (const definition of definitionLists.flat()) {
        if (!isAvailableTemplatePlaceholder(definition.path)) {
            continue
        }
        definitions.set(definition.path, definition)
    }

    return [...definitions.values()].sort(
        (first, second) =>
            getPlaceholderPriority(first) - getPlaceholderPriority(second),
    )
}

function isAvailableTemplatePlaceholder(path: string): boolean {
    const normalizedPath = path.toLowerCase()
    const normalizedLeaf = normalizedPath.split('.').at(-1) ?? normalizedPath
    const excludedPaths = new Set([
        'id',
        'content_id',
        'library_id',
        'status',
        'unsaved',
        'renderkey',
        'type',
        'snippets',
        'import_updated_at',
        'rule_id',
        'rule_order',
        'tag_ids',
        'content',
        'private',
        'parent_content_id',
        'parent_library_id',
        'parent_content_type',
        'content.type',
        'user_id',
        'tag_entities',
        'related_content_entities',
    ])

    if (
        excludedPaths.has(normalizedPath) ||
        normalizedPath.startsWith('content.')
    ) {
        return false
    }

    return !(
        normalizedLeaf === 'isfake' ||
        normalizedLeaf === 'faketype' ||
        normalizedLeaf === 'selectedresultcontentid' ||
        normalizedPath.startsWith('pendingsearchentry') ||
        normalizedPath.startsWith('pendingimageupload') ||
        normalizedPath.startsWith('pendingpdfimport') ||
        normalizedPath.startsWith('kindleimportsave')
    )
}

function getMetadataPlaceholderDefinitions(
    metadata: ResultTemplateMetadata,
): TemplatePlaceholderDefinition[] {
    const paths = new Set<string>()

    const visit = (value: unknown, path: string, depth: number): void => {
        const isNestedRecord = isRecord(value)
        if (path.length > 0 && !isNestedRecord) {
            paths.add(path)
        }
        if (depth >= 4 || !isNestedRecord) {
            return
        }

        for (const [key, nestedValue] of Object.entries(value)) {
            visit(
                nestedValue,
                path.length > 0 ? `${path}.${key}` : key,
                depth + 1,
            )
        }
    }

    visit(metadata, '', 0)

    return [...paths].map((path) => ({
        path,
        label: humanizePlaceholderPath(path),
    }))
}

function getPlaceholderPriority(
    placeholder: TemplatePlaceholderDefinition,
): number {
    const path = placeholder.path.toLowerCase()
    const leaf = path.split('.').at(-1) ?? path
    const label = placeholder.label.toLowerCase()

    if (label.includes('json')) {
        return 100
    }
    if (
        leaf === 'title' ||
        leaf === 'name' ||
        leaf === 'subtitle' ||
        leaf === 'source_title'
    ) {
        return 10
    }
    if (leaf === 'text' || leaf === 'description' || leaf === 'content') {
        return 20
    }
    if (
        leaf === 'url' ||
        leaf.endsWith('_url') ||
        leaf.endsWith('_urls') ||
        leaf.includes('share') ||
        leaf.includes('reader')
    ) {
        return 30
    }
    if (leaf === 'tags' || leaf === 'tag_names') {
        return 40
    }
    if (leaf === 'summary' || leaf === 'summary_markdown') {
        return 50
    }
    if (leaf === 'transcript' || leaf === 'transcript_markdown') {
        return 60
    }
    if (
        leaf === 'id' ||
        leaf.endsWith('_id') ||
        leaf.endsWith('_ids') ||
        leaf === 'type' ||
        leaf.endsWith('_type') ||
        leaf === 'private' ||
        leaf.endsWith('_status') ||
        leaf === 'created_at' ||
        leaf === 'updated_at' ||
        leaf === 'import_updated_at' ||
        leaf === 'rule_order' ||
        leaf === 'storage_path' ||
        leaf === 'mime_type' ||
        leaf === 'tag_entities' ||
        leaf === 'related_content_entities' ||
        leaf === 'snippets'
    ) {
        return 100
    }

    return 70
}

function humanizePlaceholderPath(path: string): string {
    return path
        .split('.')
        .map((segment) =>
            segment
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/[_-]+/g, ' '),
        )
        .join(' › ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value != null && !Array.isArray(value)
}

const EditorRoot = styled.div`
    width: min(720px, calc(100vw - 24px));
    height: min(680px, calc(100vh - 24px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: ${(props) => props.theme.surface.searchOverlayBackground};
    color: ${(props) => props.theme.colors.textPrimary};
`

const Header = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: ${(props) => props.theme.spacing['3']};
    padding: ${(props) => props.theme.spacing['4']};
    border-bottom: 1px solid ${(props) => props.theme.border.default};
`

const HeaderText = styled.div`
    min-width: 0;
`

const Title = styled.div`
    font-size: 16px;
    font-weight: 600;
    font-family:
        'IBM Plex Serif', ${(props) => props.theme.typography.fontFamily.serif};
`

const Subtitle = styled.div`
    margin-top: 4px;
    color: ${(props) => props.theme.colors.textSecondary};
    font-size: 13px;
    line-height: 1.4;
`

const HeaderActions = styled.div`
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: ${(props) => props.theme.spacing['2']};
`

const EditorBody = styled.div`
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(150px, 0.38fr) minmax(0, 1fr);
    overflow: hidden;

    @media (max-width: 520px) {
        grid-template-columns: 1fr;
        overflow: auto;
    }
`

const ContentTypeList = styled.div`
    min-height: 0;
    padding: ${(props) => props.theme.spacing['2']};
    border-right: 1px solid ${(props) => props.theme.border.default};
    overflow-y: auto;

    @media (max-width: 520px) {
        max-height: 160px;
        border-right: 0;
        border-bottom: 1px solid ${(props) => props.theme.border.default};
    }
`

const ContentTypeButton = styled.button<{ $selected: boolean }>`
    width: 100%;
    min-height: 34px;
    padding: 0 ${(props) => props.theme.spacing['2']};
    border: 0;
    border-radius: ${(props) => props.theme.borderRadius.lg};
    background: ${(props) =>
        props.$selected ? props.theme.colors.backgroundBg2 : 'transparent'};
    color: ${(props) => props.theme.colors.textPrimary};
    text-align: left;
    cursor: pointer;

    &:hover {
        background: ${(props) => props.theme.colors.backgroundBg2};
    }
`

const TemplateColumn = styled.div`
    min-width: 0;
    min-height: 0;
    padding: ${(props) => props.theme.spacing['4']};
    overflow-y: auto;
`

const SectionHeading = styled.div`
    margin-bottom: ${(props) => props.theme.spacing['3']};
    font-size: 14px;
    font-weight: 600;
`

const ModeOptions = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: ${(props) => props.theme.spacing['2']};

    @media (max-width: 520px) {
        grid-template-columns: 1fr;
    }
`

const ModeCard = styled.div<{ $selected: boolean }>`
    padding: ${(props) => props.theme.spacing['3']};
    border: 1px solid
        ${(props) =>
            props.$selected
                ? props.theme.border.focus
                : props.theme.border.default};
    border-radius: ${(props) => props.theme.borderRadius.xl};
    background: ${(props) => props.theme.colors.backgroundBg1};
    cursor: pointer;
`

const ModeDescription = styled.div`
    margin-top: ${(props) => props.theme.spacing['2']};
    color: ${(props) => props.theme.colors.textSecondary};
    font-size: 12px;
    line-height: 1.4;
`

const CustomTemplateSection = styled.div`
    margin-top: ${(props) => props.theme.spacing['4']};
`

const FieldLabel = styled.label`
    display: block;
    margin-bottom: ${(props) => props.theme.spacing['2']};
    font-size: 13px;
    font-weight: 600;
`

const TemplateTextArea = styled(TextArea)<{
    $isDropTargetActive: boolean
}>`
    min-height: 180px;
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    box-shadow: ${(props) =>
        props.$isDropTargetActive
            ? `0 0 0 2px ${props.theme.border.focus}`
            : 'none'};
`

const PlaceholderHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${(props) => props.theme.spacing['3']};
    margin-top: ${(props) => props.theme.spacing['4']};

    @media (max-width: 520px) {
        align-items: stretch;
        flex-direction: column;
    }
`

const PlaceholderTitleGroup = styled.div`
    display: flex;
    align-items: center;
    gap: ${(props) => props.theme.spacing['1']};
    min-width: max-content;
`

const PlaceholderHeading = styled.div`
    font-size: 15px;
    font-weight: 600;
`

const PlaceholderSearchField = styled(TextField)`
    width: min(240px, 48%);

    @media (max-width: 520px) {
        width: 100%;
    }
`

const PlaceholderList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: ${(props) => props.theme.spacing['2']};
`

const PlaceholderButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${(props) => props.theme.spacing['3']};
    width: 100%;
    min-height: 34px;
    padding: 7px 10px;
    border: 1px solid ${(props) => props.theme.border.default};
    border-radius: ${(props) => props.theme.borderRadius.md};
    background: ${(props) => props.theme.colors.backgroundBg2};
    color: ${(props) => props.theme.colors.textSecondary};
    text-align: left;
    cursor: grab;

    &:active {
        cursor: grabbing;
    }

    &:hover {
        color: ${(props) => props.theme.colors.textPrimary};
        border-color: ${(props) => props.theme.border.focus};
    }
`

const PlaceholderToken = styled.span`
    min-width: 0;
    overflow: hidden;
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
`

const PlaceholderLabel = styled.span`
    flex: 0 1 auto;
    color: ${(props) => props.theme.colors.textSecondary};
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`

const PlaceholderEmptyState = styled.div`
    padding: ${(props) => props.theme.spacing['4']};
    border: 1px dashed ${(props) => props.theme.border.default};
    border-radius: ${(props) => props.theme.borderRadius.md};
    color: ${(props) => props.theme.colors.textSecondary};
    font-size: 12px;
    text-align: center;
`
