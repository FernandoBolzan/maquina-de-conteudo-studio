import type { ProjectDetail } from '../shared/contracts';

export interface TextEditorState { dirty: boolean; invalid: boolean; saving: boolean }
export type EditorSaveResult = { ok: true; detail: ProjectDetail } | { ok: false; reason: 'invalid' | 'error'; message?: string };
export interface TextEditorHandle { save(): Promise<EditorSaveResult> }
