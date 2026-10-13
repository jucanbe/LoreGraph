/**
 * Tema de CodeMirror basado en las variables CSS de la aplicación (respeta
 * claro/oscuro y los temas de módulo) y resaltado de sintaxis legible en ambos.
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

function baseTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        fontSize: '13px',
      },
      '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', caretColor: 'var(--foreground)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
      '.cm-gutters': {
        backgroundColor: 'color-mix(in oklab, var(--muted) 60%, transparent)',
        color: 'var(--muted-foreground)',
        border: 'none',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)' },
      '.cm-activeLineGutter': { backgroundColor: 'color-mix(in oklab, var(--muted) 80%, transparent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent) !important',
      },
      '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklab, var(--primary) 20%, transparent)', outline: 'none' },
      '.cm-tooltip': {
        backgroundColor: 'var(--popover)',
        color: 'var(--popover-foreground)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-foreground)',
      },
      '.cm-completionDetail': { color: 'var(--muted-foreground)', fontStyle: 'normal', marginLeft: '0.75em' },
      '.cm-placeholder': { color: 'var(--muted-foreground)' },
      '&.cm-focused': { outline: 'none' },
    },
    { dark },
  )
}

const light = HighlightStyle.define([
  { tag: tags.keyword, color: '#7c3aed', fontWeight: '600' },
  { tag: tags.atom, color: '#0369a1' },
  { tag: [tags.local(tags.variableName), tags.special(tags.variableName)], color: '#b45309' },
  { tag: tags.standard(tags.variableName), color: '#0f766e' },
  { tag: tags.string, color: '#15803d' },
  { tag: tags.number, color: '#be123c' },
  { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.meta, color: '#9333ea' },
  { tag: tags.operator, color: '#475569' },
])

const dark = HighlightStyle.define([
  { tag: tags.keyword, color: '#c4b5fd', fontWeight: '600' },
  { tag: tags.atom, color: '#7dd3fc' },
  { tag: [tags.local(tags.variableName), tags.special(tags.variableName)], color: '#fcd34d' },
  { tag: tags.standard(tags.variableName), color: '#5eead4' },
  { tag: tags.string, color: '#86efac' },
  { tag: tags.number, color: '#fda4af' },
  { tag: tags.comment, color: '#9ca3af', fontStyle: 'italic' },
  { tag: tags.meta, color: '#d8b4fe' },
  { tag: tags.operator, color: '#cbd5e1' },
])

export function editorTheme(isDark: boolean): Extension {
  return [baseTheme(isDark), syntaxHighlighting(isDark ? dark : light)]
}
