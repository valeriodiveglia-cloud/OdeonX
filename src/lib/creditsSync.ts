// src/lib/creditsSync.ts
'use client'

import { supabase } from '@/lib/supabase_shim'

type EventName = 'credits_changed' | 'payments_changed'

type Handler = () => void

class CreditsSignalBus {
  private bc: BroadcastChannel | null = null
  private ch: ReturnType<typeof supabase.channel> | null = null
  private handlers: Set<Handler> = new Set()
  private ready = false

  constructor() {
    // BroadcastChannel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.bc = new BroadcastChannel('credits-sync')
      this.bc.addEventListener('message', (ev: MessageEvent) => {
        const t = String(ev?.data?.t || '')
        if (t === 'credits_changed' || t === 'payments_changed') this.bump()
      })
    }

    // Supabase Realtime broadcast, sottoscritto una sola volta
    try {
      this.ch = supabase
        .channel('credits-signals', { config: { broadcast: { self: true } } })
        .on('broadcast', { event: 'credits_changed' }, () => this.bump())
        .on('broadcast', { event: 'payments_changed' }, () => this.bump())
        .subscribe((status) => {
          this.ready = status === 'SUBSCRIBED'
        })
    } catch {
      // ignore
    }

    // localStorage heartbeat cross-tab
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (!e.key) return
        if (
          e.key === 'credits_last_emit_at' ||
          e.key === 'credits_payments_last_emit_at' ||
          e.key === 'dr_branch_last_emit_at'
        ) this.bump()
      })
    }
  }

  private bump() {
    for (const h of this.handlers) {
      try { h() } catch {}
    }
  }

  onBump(h: Handler) {
    this.handlers.add(h)
    return () => this.handlers.delete(h)
  }

  emit(ev: EventName, payload?: Record<string, any>) {
    // 1) custom event locale
    try { window.dispatchEvent(new CustomEvent(`credits:${ev.replace('_', ':')}`, { detail: payload || {} })) } catch {}

    // 2) localStorage heartbeat cross-tab
    try {
      const key = ev === 'payments_changed' ? 'credits_payments_last_emit_at' : 'credits_last_emit_at'
      localStorage.setItem(key, String(Date.now()))
    } catch {}

    // 3) BroadcastChannel
    try { this.bc?.postMessage({ t: ev, at: Date.now(), ...(payload || {}) }) } catch {}

    // 4) Supabase broadcast su canale già subscribed
    try {
      if (this.ch) {
        this.ch.send({ type: 'broadcast', event: ev, payload: { at: Date.now(), ...(payload || {}) } })
      }
    } catch {}
  }
}

let _bus: CreditsSignalBus | null = null
export function creditsBus() {
  if (!_bus) _bus = new CreditsSignalBus()
  return _bus
}