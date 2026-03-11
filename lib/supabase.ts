import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Browser client (for 'use client' components — login, logout)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Server client with auth (for server components & API routes — reads session from cookies)
export async function createServerSupabase() {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* read-only in RSC */ }
          })
        },
      },
    }
  )
}

// Service role client (bypass RLS — for API routes & server components)
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type AppointmentStatus = 'non_assigne' | 'confirme' | 'va_reflechir' | 'no_show' | 'annule' | 'preinscription'
export type UserRole = 'admin' | 'commercial' | 'manager' | 'telepro'
export type AppointmentSource = 'telepro' | 'prospect' | 'admin'

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          role: UserRole
          slug: string
          hubspot_owner_id: string | null
          avatar_color: string
          auth_id: string | null
          created_at: string
        }
      }
      availability: {
        Row: {
          id: string
          user_id: string
          day_of_week: number // 0=Sun, 1=Mon... 6=Sat
          start_time: string // "09:00"
          end_time: string   // "18:00"
          is_active: boolean
        }
      }
      appointments: {
        Row: {
          id: string
          commercial_id: string | null  // nullable = non assigné
          prospect_name: string
          prospect_email: string
          prospect_phone: string | null
          start_at: string // ISO datetime
          end_at: string
          status: AppointmentStatus
          source: AppointmentSource
          formation_type: string | null
          hubspot_deal_id: string | null
          notes: string | null
          created_at: string
        }
      }
    }
  }
}
