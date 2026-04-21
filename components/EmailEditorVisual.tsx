'use client'

import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { EditorRef, EmailEditorProps } from 'react-email-editor'

// Unlayer doit être chargé côté client uniquement (iframe + globals window)
const EmailEditor = dynamic(() => import('react-email-editor'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, color: '#516f90', fontSize: 13 }}>
      Chargement de l&apos;éditeur visuel…
    </div>
  ),
}) as React.ComponentType<EmailEditorProps & { ref?: React.Ref<EditorRef> }>

// ─── Types ────────────────────────────────────────────────────────────────
export interface EmailEditorVisualRef {
  /** Exporte HTML + design JSON (à sauvegarder en base) */
  exportContent: () => Promise<{ html: string; design: unknown }>
  /** Remplace le contenu affiché par un design JSON précédemment sauvegardé */
  loadDesign: (design: unknown) => void
}

interface Props {
  /** Design JSON précédent à recharger (sinon template vide) */
  initialDesign?: unknown
  /** Notifie le parent à chaque modif (utilisé pour "dirty" indicator) */
  onChange?: () => void
  height?: number
}

// ─── Composant ────────────────────────────────────────────────────────────
const EmailEditorVisual = forwardRef<EmailEditorVisualRef, Props>(function EmailEditorVisual(
  { initialDesign, onChange, height = 700 }: Props,
  ref,
) {
  const editorRef = useRef<EditorRef>(null)
  const [ready, setReady] = useState(false)

  // Expose méthodes au parent via ref
  useImperativeHandle(ref, () => ({
    exportContent: () =>
      new Promise(resolve => {
        const unlayer = editorRef.current?.editor
        if (!unlayer) { resolve({ html: '', design: null }); return }
        unlayer.exportHtml((data: { design: unknown; html: string }) => {
          resolve({ html: data.html, design: data.design })
        })
      }),
    loadDesign: (design: unknown) => {
      const unlayer = editorRef.current?.editor
      if (unlayer && design) {
        unlayer.loadDesign(design as Parameters<typeof unlayer.loadDesign>[0])
      }
    },
  }), [])

  // Quand l'éditeur est prêt, on charge le design initial + on s'abonne aux changements
  const onReady: EmailEditorProps['onReady'] = (unlayer) => {
    setReady(true)
    if (initialDesign) {
      try {
        unlayer.loadDesign(initialDesign as Parameters<typeof unlayer.loadDesign>[0])
      } catch (e) {
        console.error('[EmailEditor] erreur loadDesign :', e)
      }
    }
    if (onChange) {
      unlayer.addEventListener('design:updated', () => onChange())
    }
  }

  return (
    <div style={{ position: 'relative', border: '1px solid #cbd6e2', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
      <EmailEditor
        ref={editorRef}
        onReady={onReady}
        minHeight={height}
        style={{ height }}
        options={{
          locale: 'fr-FR',
          displayMode: 'email',
          appearance: {
            theme: 'modern_light',
            panels: {
              tools: { dock: 'left' },
            },
          },
          mergeTags: {
            prenom: { name: 'Prénom', value: '{{prenom}}', sample: 'Léa' },
            nom:    { name: 'Nom',    value: '{{nom}}',    sample: 'Dupont' },
            email:  { name: 'Email',  value: '{{email}}',  sample: 'lea@exemple.fr' },
          },
          tools: {
            // Outils activés (Brevo-like) : texte, image, bouton, HTML, diviseur, espacement, vidéo, menu, réseaux sociaux
            button: { enabled: true },
            text: { enabled: true },
            image: { enabled: true },
            divider: { enabled: true },
            spacer: { enabled: true },
            html: { enabled: true },
            video: { enabled: true },
            menu: { enabled: true },
            social: { enabled: true },
          },
          features: {
            preview: true,
            undoRedo: true,
            textEditor: {
              spellChecker: true,
              tables: true,
              emojis: true,
            },
          },
          customCSS: [
            'body { font-family: Inter, system-ui, sans-serif; }',
          ],
        }}
      />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f8fa', color: '#516f90', fontSize: 13, pointerEvents: 'none' }}>
          Chargement de l&apos;éditeur visuel…
        </div>
      )}
    </div>
  )
})

export default EmailEditorVisual
