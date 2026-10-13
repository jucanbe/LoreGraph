import { autocompletion } from '@codemirror/autocomplete'
import { StreamLanguage } from '@codemirror/language'
import { sparql } from '@codemirror/legacy-modes/mode/sparql'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo, type KeyboardEvent } from 'react'
import { useTheme } from '@/theme/ThemeProvider'
import { sparqlCompletionSource } from './completions'
import { editorTheme } from './editor-theme'

const sparqlLanguage = StreamLanguage.define(sparql)
const BASIC_SETUP = { autocompletion: false, foldGutter: false, highlightActiveLineGutter: true }

/** Extensiones del editor (lenguaje, autocompletado con los prefijos de la campaña, accesibilidad). */
function buildExtensions(prefijos: Record<string, string>, ariaLabel: string): Extension[] {
  return [
    sparqlLanguage,
    autocompletion({ override: [sparqlCompletionSource(() => prefijos)], activateOnTyping: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
  ]
}

/** Editor SPARQL (CodeMirror 6): resaltado, autocompletado de prefijos y Ctrl/Cmd+Enter para ejecutar. */
export function SparqlEditor({
  value,
  onChange,
  onRun,
  prefijos,
  ariaLabel,
  placeholder,
  onCreateView,
}: {
  value: string
  onChange: (v: string) => void
  onRun: () => void
  prefijos: Record<string, string>
  ariaLabel: string
  placeholder?: string
  onCreateView?: (view: EditorView) => void
}) {
  const { resolved } = useTheme()
  const theme = useMemo(() => editorTheme(resolved === 'dark'), [resolved])
  const extensions = useMemo(() => buildExtensions(prefijos, ariaLabel), [prefijos, ariaLabel])

  // Ctrl/Cmd+Enter se captura antes de que CodeMirror inserte el salto de línea.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      e.stopPropagation()
      onRun()
    }
  }

  return (
    <div onKeyDownCapture={onKeyDownCapture}>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={theme}
        extensions={extensions}
        basicSetup={BASIC_SETUP}
        minHeight="10rem"
        maxHeight="50svh"
        placeholder={placeholder}
        onCreateEditor={(view) => onCreateView?.(view)}
        className="overflow-hidden rounded-lg border text-sm [&_.cm-editor]:min-h-40"
      />
    </div>
  )
}
