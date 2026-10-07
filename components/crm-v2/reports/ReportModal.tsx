'use client'

import { useEffect, type ReactNode } from 'react'
import { CrmV2BottomSheet, CrmV2CloseButton } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

/**
 * Fenêtre centrée de la rubrique Analytics (création de dashboard, ajout de widget…).
 * Sur mobile, bascule en panneau qui monte du bas.
 */
export function CrmV2ReportModal({
  title, onClose, children, footer, width = 440,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isMobile) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile, onClose])

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: crmV2.text }}>{title}</h3>
      <CrmV2CloseButton onClick={onClose} />
    </div>
  )

  if (isMobile) {
    return (
      <CrmV2BottomSheet open onClose={onClose} header={header} footer={footer}>
        <div style={{ padding: 16 }}>{children}</div>
      </CrmV2BottomSheet>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.28)', zIndex: 1000 }} />
      <div
        role="dialog"
        aria-modal="true"
        className="crm-v2"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)',
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 20, boxShadow: crmV2.shadowPanel,
          zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: crmV2.font, color: crmV2.text,
        }}
      >
        <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${crmV2.border}`, flexShrink: 0 }}>{header}</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20 }}>{children}</div>
        {footer && (
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${crmV2.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
