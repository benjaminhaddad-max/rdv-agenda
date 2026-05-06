'use client'

import { Calendar as CalendarIcon, Plus } from 'lucide-react'
import WeekCalendar from '@/components/WeekCalendar'

export default function AgendaPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2ea3f2] to-[#0038f0] flex items-center justify-center">
              <CalendarIcon size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Agenda</h1>
              <p className="text-xs text-slate-500">Planification et RDV de toute l&apos;équipe</p>
            </div>
          </div>
          <a
            href="/telepro"
            className="inline-flex items-center gap-2 bg-[#ccac71] hover:bg-[#b89a5e] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Nouveau RDV
          </a>
        </div>
      </div>

      {/* Calendrier */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <WeekCalendar adminMode />
      </div>
    </div>
  )
}
