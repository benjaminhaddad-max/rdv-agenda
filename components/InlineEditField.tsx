'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface BaseProps {
  value: string | null | undefined
  onSave: (newValue: string) => Promise<void>
  placeholder?: string
  color?: string
  fontSize?: number
  fontWeight?: number
}

interface TextProps extends BaseProps { type?: 'text' }
interface SelectProps extends BaseProps { type: 'select'; options: { value: string; label: string }[] }
interface DateProps extends BaseProps { type: 'date' }

type Props = TextProps | SelectProps | DateProps

export default function InlineEditField(props: Props) {
  const { value, onSave, placeholder = '—', color = '#e8eaf0', fontSize = 13, fontWeight = 400, type = 'text' } = props

  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value ?? '')
  const [saving, setSaving]   = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select()
    }
  }, [editing])

  const save = useCallback(async () => {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '').trim()) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch {
      // Stay in editing mode on error
    } finally {
      setSaving(false)
    }
  }, [draft, value, onSave])

  const cancel = useCallback(() => {
    setDraft(value ?? '')
    setEditing(false)
  }, [value])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }, [save, cancel])

  // Display mode
  if (!editing) {
    const displayValue = type === 'select' && 'options' in props
      ? props.options.find(o => o.value === value)?.label ?? value
      : type === 'date' && value
        ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
        : value

    return (
      <span
        onClick={() => { setDraft(value ?? ''); setEditing(true) }}
        title="Cliquer pour modifier"
        style={{
          color: displayValue ? color : '#3a5070',
          fontSize,
          fontWeight,
          cursor: 'pointer',
          borderBottom: '1px dashed transparent',
          transition: 'border-color 0.15s',
          padding: '2px 0',
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderBottomColor = '#2d4a6b')}
        onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
      >
        {displayValue || placeholder}
      </span>
    )
  }

  // Edit mode
  const inputStyle: React.CSSProperties = {
    background: '#0b1624',
    border: `1px solid ${saving ? '#ccac71' : '#2d4a6b'}`,
    borderRadius: 6,
    padding: '4px 8px',
    color: '#e8eaf0',
    fontSize,
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    maxWidth: 250,
    opacity: saving ? 0.6 : 1,
  }

  if (type === 'select' && 'options' in props) {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={e => { setDraft(e.target.value); }}
        onBlur={() => save()}
        onKeyDown={handleKeyDown}
        disabled={saving}
        style={inputStyle}
      >
        <option value="">—</option>
        {props.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    )
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={type === 'date' ? 'date' : 'text'}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => save()}
      onKeyDown={handleKeyDown}
      disabled={saving}
      placeholder={placeholder}
      style={inputStyle}
    />
  )
}
