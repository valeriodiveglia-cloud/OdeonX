// src/app/event-calculator/_state/types.ts

export type Id = string

export type EventHeader = {
  name: string
  host: string
  poc: string
  phone: string
  email: string
  company: string
  date: string
  /** legacy: manteniamo per retro-compatibilità, ma non usato nell'UI nuova */
  time?: string
  /** nuovo: inizio/fine */
  timeStart: string
  timeEnd: string
  location: string
  pax: number | ''
  notes: string
}

export type EventCalcState = {
  header: EventHeader
}

export type EventCalcActions = {
  updateHeader: (patch: Partial<EventHeader>) => void
}

export type EventCalcContextType = EventCalcState & EventCalcActions
