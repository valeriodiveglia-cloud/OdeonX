'use client'

import { useEffect, useState } from 'react'
import { CheckCircleIcon, PlusIcon, Cog6ToothIcon, XMarkIcon, TrashIcon, Squares2X2Icon,WrenchScrewdriverIcon, BookOpenIcon, ClipboardDocumentListIcon  } from '@heroicons/react/24/outline'
import { t, type Lang } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import { supabase } from '@/lib/supabase_shim'
import { useRouter } from 'next/navigation'
import { toBool } from '@/lib/normalize'
import TagManagerModal from '@/components/modals/TagManagerModal'



export type Currency = 'VND' | 'USD' | 'EUR' | 'GBP'

export type AppSettingsUI = {
  restaurant_name: string
  company_name: string
  address: string
  tax_code: string
  phone: string
  email: string
  website: string
  logo_mime: string | null
  logo_data: string | null
  language_code: Lang
  currency: Currency
  vat_enabled: boolean
  vat_rate: number | null
  default_markup_equipment_pct: number | null
  default_markup_recipes_pct: number | null
  materials_review_months: number
  csv_require_confirm_refs: boolean
  materials_exclusive_default: boolean
  equipment_review_months: number
  equipment_csv_require_confirm_refs: boolean
  recipes_review_months: number
  recipes_split_mode: 'split' | 'single'
  recipes_tab1_name: string
  recipes_tab2_name: string | null
}

type AppSettingsRow = AppSettingsUI & { id: 'singleton'; updated_at?: string | null }
const TBL_APP = 'app_settings'

const TBL_ACCOUNTS = 'app_accounts'
type AccountRole = 'owner' | 'admin' | 'staff'
type AccountRow = {
  id: string
  user_id?: string | null
  email: string
  phone: string | null
  name: string | null
  position: string | null
  role: AccountRole
  is_active: boolean
  created_at: string
  first_login_at?: string | null
}

async function uploadLogoToStorage(file: File) {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png'
  const path = `logos/company.${ext}`
  const { error } = await supabase.storage
    .from('app-assets')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/png', cacheControl: '3600' })
  if (error) throw error
  return path
}
async function getLogoSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from('app-assets').createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="text-sm font-semibold text-gray-800 mb-3">{title}</div>
      {children}
    </div>
  )
}

function Toggle({ id, checked, onChange, label, disabled, hint }: {
  id: string
  checked: boolean | null | undefined
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="py-1">
      <label htmlFor={id} className="flex items-center justify-between gap-4">
        <span className="text-gray-900">{label}</span>
        <div className="flex items-center gap-3">
          <input id={id} type="checkbox" className="sr-only peer" checked={!!checked} onChange={e => onChange(e.target.checked)} disabled={disabled}/>
          <div className={`w-11 h-6 rounded-full relative transition-colors ${!!checked ? 'bg-blue-600' : 'bg-gray-200'} ${disabled ? 'opacity-50' : ''}`}>
            <div className={`absolute top-0.5 left-0.5 h-5 w-5 bg-white border rounded-full transition-transform ${!!checked ? 'translate-x-full' : ''}`} />
          </div>
        </div>
      </label>
      {hint ? <div className="text-xs text-gray-600 mt-1">{hint}</div> : null}
    </div>
  )
}

function Modal({ open, title, children, onClose, width = 'max-w-xl' }: {
  open: boolean; title: string; children: React.ReactNode; onClose: () => void; width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full ${width} bg-white rounded-2xl shadow-lg p-4`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-semibold text-gray-900">{title}</div>
          <button onClick={onClose} className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100">
            <XMarkIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function parseNumOrNull(v: string): number | null {
  if (v === '' || v == null) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)))
}
function clampFloat(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
function isValidEmail(x: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) }

async function sendAccessLink(email: string) {
  const r = await authFetch('/api/users/send-access-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'include',
    body: JSON.stringify({
      email,
      redirectToBase:
        typeof window !== 'undefined'
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_URL
    }),
  })
  const ct = r.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await r.json() : { error: await r.text() }
  if (!r.ok) throw new Error(data?.error || 'Send link failed')
  return data as { ok: true; mode: 'invite' | 'password_reset' }
}

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init.headers || {})
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers, cache: 'no-store' })
}

export default function SettingsClient({ initial }: { initial: AppSettingsUI }) {
  const router = useRouter()
  const { language: ctxLang, setVatEnabled, setVatRate, reloadSettings, revision, setLanguage } = useSettings()

  const [s, setS] = useState<AppSettingsUI>(initial)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const lang = ctxLang

  const [authReady, setAuthReady] = useState(false)
  const [currentUser, setCurrentUser] = useState<null | { id: string; email?: string | null }>(null)

  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null)

  async function refetchAppSettingsIntoState() {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) return
    if (!data) return

    // ⬇️ FIX: NON riscrivere a 1.5 quando > 5: mantieni sempre il valore come moltiplicatore ×
    const rawDm = Number((data as any).default_markup_equipment_pct)
    const normalizedDm = Number.isFinite(rawDm) && rawDm > 0 ? rawDm : 1.5

    const normalized: AppSettingsUI = {
      ...data,
      default_markup_equipment_pct: normalizedDm,
      vat_enabled: toBool(data.vat_enabled, false),
      csv_require_confirm_refs: toBool(data.csv_require_confirm_refs, true),
      materials_exclusive_default: toBool(data.materials_exclusive_default, true),
      equipment_csv_require_confirm_refs: toBool(data.equipment_csv_require_confirm_refs, true),
      materials_review_months: Number.isFinite(data.materials_review_months) ? data.materials_review_months : 4,
      equipment_review_months: Number.isFinite(data.equipment_review_months) ? data.equipment_review_months : 4,
      recipes_review_months: Number.isFinite(data.recipes_review_months) ? data.recipes_review_months : 4,
    }
    setS(normalized)
    setDirty(false)
  }

  useEffect(() => {
    let unsub: (() => void) | null = null
    supabase.auth.getSession().then(({ data }: any) => {
      setCurrentUser(data.session?.user ?? null as any)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setCurrentUser(session?.user ?? null as any)
      setAuthReady(true)
    })
    unsub = () => sub.subscription.unsubscribe()
    return () => { unsub?.() }
  }, [])

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 'singleton')
        .maybeSingle()
      if (!error && data && !cancelled) {
        // ⬇️ FIX: non forzare a 1.5 quando > 5
        const rawDm = Number((data as any).default_markup_equipment_pct)
        const normalizedDm = Number.isFinite(rawDm) && rawDm > 0 ? rawDm : 1.5

        const normalized: AppSettingsUI = {
          ...data,
          default_markup_equipment_pct: normalizedDm,
          vat_enabled: toBool(data.vat_enabled, false),
          csv_require_confirm_refs: toBool(data.csv_require_confirm_refs, true),
          materials_exclusive_default: toBool(data.materials_exclusive_default, true),
          equipment_csv_require_confirm_refs: toBool(data.equipment_csv_require_confirm_refs, true),
          materials_review_months: Number.isFinite(data.materials_review_months) ? data.materials_review_months : 4,
          equipment_review_months: Number.isFinite(data.equipment_review_months) ? data.equipment_review_months : 4,
          recipes_review_months: Number.isFinite(data.recipes_review_months) ? data.recipes_review_months : 4,
        }
        setS(prev => (dirty ? prev : normalized))
      }
    })()
    return () => { cancelled = true }
  }, [authReady, currentUser?.id])

  useEffect(() => {
    if (typeof initial.recipes_review_months !== 'number') {
      setS(prev => ({ ...prev, recipes_review_months: 4 }))
    }
  }, [initial])

  useEffect(() => {
    ;(async () => { await refetchAppSettingsIntoState() })()
  }, [revision])

  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('app-events')
      bc.onmessage = (e) => {
        if (e?.data === 'data-reset') {
          ;(async () => {
            await refetchAppSettingsIntoState()
            router.refresh()
          })()
        }
      }
    } catch {}
    return () => { try { bc?.close() } catch {} }
  }, [router])

  function patch<K extends keyof AppSettingsUI>(key: K, val: AppSettingsUI[K]) {
    setS(prev => { const next = { ...prev, [key]: val }; setDirty(true); return next })
  }

  async function handleLogoUpload(file: File) {
    if (!file) return
    try {
      const path = await uploadLogoToStorage(file)
      patch('logo_mime', file.type || 'image/png')
      patch('logo_data', `storage:${path}`)
      const url = await getLogoSignedUrl(path)
      setLogoSignedUrl(url)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    ;(async () => {
      const token = s.logo_data || ''
      if (token?.startsWith('storage:')) {
        const path = token.slice('storage:'.length)
        try {
          const url = await getLogoSignedUrl(path)
          setLogoSignedUrl(url)
        } catch (e) {
          console.warn('Signed URL error:', (e as any)?.message || e)
          setLogoSignedUrl(null)
        }
      } else {
        setLogoSignedUrl(null)
      }
    })()
  }, [s.logo_data])

  async function onSave() {
    setSaving(true)
    try {
      const payload: AppSettingsRow = {
        id: 'singleton',
        restaurant_name: (s.restaurant_name ?? '').trim(),
        company_name: (s.company_name ?? '').trim(),
        address: (s.address ?? '').trim(),
        tax_code: (s.tax_code ?? '').trim(),
        phone: (s.phone ?? '').trim(),
        email: (s.email ?? '').trim(),
        website: (s.website ?? '').trim(),
        logo_mime: s.logo_mime ?? null,
        logo_data: s.logo_data ?? null,
        language_code: s.language_code,
        currency: s.currency,
        vat_enabled: !!s.vat_enabled,
        vat_rate: s.vat_enabled ? clampInt(s.vat_rate ?? 0, 0, 100) : null,

        // ✅ SALVIAMO SEMPRE COME MOLTIPLICATORE × (no conversioni / no >5→1.5)
        default_markup_equipment_pct:
          s.default_markup_equipment_pct == null
            ? null
            : clampFloat(Number(s.default_markup_equipment_pct) || 0, 0, 100),

        default_markup_recipes_pct:
          s.default_markup_recipes_pct == null ? null : clampInt(s.default_markup_recipes_pct, 0, 100),

        materials_review_months: clampInt(s.materials_review_months ?? 4, 0, 12),
        csv_require_confirm_refs: !!s.csv_require_confirm_refs,
        materials_exclusive_default: !!s.materials_exclusive_default,
        equipment_review_months: clampInt(s.equipment_review_months ?? 4, 0, 12),
        equipment_csv_require_confirm_refs: !!s.equipment_csv_require_confirm_refs,
        recipes_review_months: clampInt(s.recipes_review_months ?? 4, 0, 12),
        recipes_split_mode: s.recipes_split_mode,
        recipes_tab1_name: s.recipes_tab1_name ?? 'Final',
        recipes_tab2_name: s.recipes_split_mode === 'split' ? (s.recipes_tab2_name ?? 'Prep') : null,
        updated_at: new Date().toISOString(),
      }

      // 1) UPDATE
      const upd = await supabase
        .from(TBL_APP)
        .update({ ...payload })
        .eq('id', 'singleton')
        .select()

      if (upd.error) throw upd.error

      let saved: any | null = null

      if ((upd.data?.length ?? 0) > 0) {
        saved = upd.data[0]
      } else {
        // 2) INSERT se non esiste
        const ins = await supabase
          .from(TBL_APP)
          .insert(payload)
          .select()
          .single()

        if (ins.error) throw ins.error
        saved = ins.data
      }

      setS(saved as AppSettingsUI)
      setDirty(false)
      setSaveMessage(t('SavedOk', s.language_code))
      setTimeout(() => setSaveMessage(null), 2500)

      try {
        setVatEnabled(!!saved.vat_enabled)
        setVatRate(saved.vat_rate ?? 0)
        setLanguage(saved.language_code as Lang)
      } catch {}

      router.refresh()
    } catch (err: any) {
      setSaveMessage(`${t('SavedErr', lang)}: ${err?.message || String(err)}`)
      setTimeout(() => setSaveMessage(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  function onResetLocal() {
    setS(prev => ({
      ...prev,
      restaurant_name: '',
      company_name: '',
      address: '',
      tax_code: '',
      phone: '',
      email: '',
      website: '',
      language_code: 'en',
      currency: 'VND',
      vat_enabled: false,
      vat_rate: 10,
      // default moltiplicatore
      default_markup_equipment_pct: 1.5,
      materials_review_months: 4,
      csv_require_confirm_refs: true,
      materials_exclusive_default: true,
      equipment_review_months: 4,
      equipment_csv_require_confirm_refs: true,
      recipes_review_months: 4,
      recipes_split_mode: 'split',
      recipes_tab1_name: 'Final',
      recipes_tab2_name: 'Prep',
    }))
    setDirty(true)
  }

  const legacyLogoDataUrl =
    s.logo_data && !s.logo_data.startsWith('storage:')
      ? (s.logo_data.startsWith('data:')
          ? s.logo_data
          : (s.logo_mime ? `data:${s.logo_mime};base64,${s.logo_data}` : null))
      : null

  const logoSrc = logoSignedUrl || legacyLogoDataUrl

  function handleRemoveLogo() {
    patch('logo_data', null)
    patch('logo_mime', null)
    setLogoSignedUrl(null)
  }

  const handleMonthsChange = (key: 'materials_review_months' | 'equipment_review_months') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      const n = clampInt(parseInt(v, 10) || 0, 0, 12)
      patch(key as any, n as any)
    }

  const [manageOpen, setManageOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [accLoading, setAccLoading] = useState(false)
  const [acc, setAcc] = useState<AccountRow[]>([])
  const [accMsg, setAccMsg] = useState<string | null>(null)
  const [accMsgKind, setAccMsgKind] = useState<'ok' | 'err'>('err')
  const showAccOk = (msg: string) => { setAccMsg(msg); setAccMsgKind('ok'); }
  const showAccErr = (msg: string) => { setAccMsg(msg); setAccMsgKind('err'); }

  const [selected, setSelected] = useState<AccountRow | null>(null)
  const [myRole, setMyRole] = useState<AccountRole | null>(null)

  useEffect(() => {
    if (!authReady || !currentUser?.id) return
    ;(async () => {
      const { data } = await supabase
        .from('app_accounts')
        .select('role')
        .eq('user_id', currentUser.id)
        .maybeSingle()
      setMyRole((data?.role as AccountRole) ?? null)
    })()
  }, [authReady, currentUser?.id])

  const canSeeAccounts = myRole === 'owner' || myRole === 'admin'

  const [formAdd, setFormAdd] = useState<{ email: string; phone: string; name: string; position: string; role: AccountRole; is_active: boolean; }>(
    { email: '', phone: '', name: '', position: '', role: 'staff', is_active: true }
  )

  const [formEdit, setFormEdit] = useState<{ id: string; email: string; phone: string; name: string; position: string; role: AccountRole; is_active: boolean } | null>(null)

  function resetAddForm() {
    setFormAdd({ email: '', phone: '', name: '', position: '', role: 'staff', is_active: true })
    setAccMsg(null)
  }

  async function ensureCurrentUserAccount() {
    if (!authReady) return
    const user = currentUser
    if (!user) { showAccErr('Not authenticated'); return }
    let { data: existing, error: selErr } = await supabase
      .from('app_accounts')
      .select('id, user_id, email, role, first_login_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (selErr) { showAccErr(`Accounts select error: ${selErr.message}`); return }

    if (!existing) {
      const { data: byEmail } = await supabase
        .from('app_accounts')
        .select('id, role, first_login_at')
        .is('user_id', null)
        .eq('email', user.email ?? '')
        .maybeSingle()

      if (byEmail) {
        const { error: linkErr } = await supabase
          .from('app_accounts')
          .update({
            user_id: user.id,
            name: (user as any)?.user_metadata?.full_name ?? null,
            phone: (user as any)?.user_metadata?.phone ?? null,
            is_active: true
          })
          .eq('id', byEmail.id)
        if (linkErr) { showAccErr(`Accounts link error: ${linkErr.message}`); return }
        existing = { ...byEmail, user_id: user.id, email: user.email ?? '' } as any
      }
    }

    if (!existing) {
      let defaultRole: AccountRole = 'staff'
      const { count } = await supabase.from('app_accounts').select('id', { count: 'exact', head: true })
      if ((count ?? 0) === 0) defaultRole = 'owner'
      const { error: upErr } = await supabase.from('app_accounts').upsert({
        user_id: user.id, email: user.email ?? '', role: defaultRole, is_active: true,
        name: (user as any)?.user_metadata?.full_name ?? null,
        phone: (user as any)?.user_metadata?.phone ?? null, position: null,
      } as any, { onConflict: 'email' })
      if (upErr) showAccErr(`Accounts upsert error: ${upErr.message}`)
    }

    try {
      const { data: row } = await supabase
        .from('app_accounts')
        .select('id, first_login_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (row && !row.first_login_at) {
        const { error: markErr } = await supabase
          .from('app_accounts')
          .update({ first_login_at: new Date().toISOString() })
          .eq('id', row.id)
        if (markErr) console.warn('first_login_at update failed:', markErr.message)
      }
    } catch {}
  }

  useEffect(() => { if (authReady) { (async () => { await ensureCurrentUserAccount() })() } }, [authReady, currentUser?.id])

  async function fetchAccounts() {
    setAccLoading(true)
    const { data, error } = await supabase.from(TBL_ACCOUNTS).select('*').order('created_at', { ascending: true })
    if (error) showAccErr(`Accounts load error: ${error.message}`); else setAccMsg(null)
    setAcc(data || [])
    setAccLoading(false)
  }

  useEffect(() => { if (manageOpen) { (async () => { await ensureCurrentUserAccount(); await fetchAccounts() })() } }, [manageOpen])

  async function addAccount(): Promise<AccountRow | null> {
    const email = formAdd.email.trim().toLowerCase()
    if (!isValidEmail(email)) { showAccErr(t('InvalidEmail', lang) || 'Invalid email'); return null }
    const roleToSet: AccountRole = myRole === 'admin' ? 'staff' : formAdd.role
    const res = await authFetch('/api/users/admin-upsert', {
      method: 'POST',
      body: JSON.stringify({
        email,
        phone: formAdd.phone || null,
        name: formAdd.name || null,
        position: formAdd.position || null,
        role: roleToSet,
        is_active: formAdd.is_active,
      }),
    })
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : { error: await res.text() }
    if (!res.ok) { showAccErr(data?.error || 'Add failed'); return null }
    const created = data.data as AccountRow
    setAcc(a => [...a, created])
    return created
  }

  function openEdit(u: AccountRow) {
    setSelected(u)
    setFormEdit({ id: u.id, email: u.email, phone: u.phone || '', name: u.name || '', position: u.position || '', role: u.role, is_active: u.is_active })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!formEdit) return
    const intendedRole: AccountRole = myRole === 'admin' ? 'staff' : formEdit.role
    const res = await authFetch('/api/users/admin-upsert', {
      method: 'POST',
      body: JSON.stringify({
        id: formEdit.id,
        email: formEdit.email.trim().toLowerCase(),
        phone: formEdit.phone || null,
        name: formEdit.name || null,
        position: formEdit.position || null,
        role: intendedRole,
        is_active: formEdit.is_active,
      }),
    })
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : { error: await res.text() }
    if (!res.ok) { showAccErr(data?.error || 'Update failed'); return }
    setAcc(list => list.map(x => (x.id === formEdit.id ? (data.data as AccountRow) : x)))
    setEditOpen(false); setSelected(null); setFormEdit(null)
  }

  async function deleteAccount(id: string) {
    const u = acc.find(x => x.id === id)
    if (!u) return
    const canDeleteRow = myRole === 'owner' ? true : myRole === 'admin' ? u.role === 'staff' : false
    if (!canDeleteRow) { showAccErr(t('NotAllowed', lang) || 'Not allowed'); return }
    const old = acc
    setAcc(list => list.filter(x => x.id !== id))
    try {
      const res = await authFetch('/api/users/admin-delete', {
        method: 'POST',
        body: JSON.stringify({ accountId: u.id, userId: u.user_id || null, email: u.email || null }),
      })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { error: await res.text() }
      if (!res.ok) throw new Error(data?.error || 'Delete failed')
    } catch (e: any) {
      setAcc(old)
      showAccErr(`${t('SavedErr', lang) || 'Error'}: ${e?.message || String(e)}`)
    }
  }

  const [sendingLink, setSendingLink] = useState(false)
  const [sendingRow, setSendingRow] = useState<Record<string, boolean>>({})

  async function sendAuthLink(emailRaw?: string) {
    const email = (emailRaw ?? formAdd.email).trim().toLowerCase()
    if (!isValidEmail(email)) { showAccErr(t('InvalidEmail', lang) || 'Invalid email'); return }
    try {
      setSendingLink(true)
      await sendAccessLink(email)
      showAccOk(t('EmailSent', lang) || 'Email sent.')
      setTimeout(() => setAccMsg(null), 4000)
    } catch (e: any) {
      showAccErr(`${t('SendLinkError', lang) || 'Send link error'}: ${e?.message || String(e)}`)
    } finally {
      setSendingLink(false)
    }
  }

  async function sendAuthLinkForRow(u: AccountRow) {
    const email = (u.email || '').trim().toLowerCase()
    if (!isValidEmail(email)) { showAccErr(t('InvalidEmail', lang) || 'Invalid email'); return }
    try {
      setSendingRow(prev => ({ ...prev, [u.id]: true }))
      await sendAccessLink(email)
      showAccOk(t('EmailSent', lang) || 'Email sent.')
      setTimeout(() => setAccMsg(null), 4000)
    } catch (e: any) {
      showAccErr(`${t('SendLinkError', lang) || 'Send link error'}: ${e?.message || String(e)}`)
    } finally {
      setSendingRow(prev => ({ ...prev, [u.id]: false }))
    }
  }

  const [postInviteOpen, setPostInviteOpen] = useState(false)
  const [postInviteEmail, setPostInviteEmail] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function confirmSendInviteNow() {
    if (!postInviteEmail) { setPostInviteOpen(false); return }
    try {
      setSendingLink(true)
      await sendAccessLink(postInviteEmail)
      showAccOk(t('EmailSent', lang) || 'Email sent.')
    } catch (e: any) {
      showAccErr(`${t('SendLinkError', lang) || 'Send link error'}: ${e?.message || String(e)}`)
    } finally {
      setSendingLink(false)
      setPostInviteOpen(false)
      setPostInviteEmail(null)
    }
  }
  function skipInviteForNow() { setPostInviteOpen(false); setPostInviteEmail(null) }

  const [pwModalOpen, setPwModalOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw1, setNewPw1] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwKind, setPwKind] = useState<'ok' | 'err'>('ok')
  const [pwBusy, setPwBusy] = useState(false)

  function validatePassword(p: string) { return typeof p === 'string' && p.trim().length >= 8 }
  function resetPwForm() { setOldPw(''); setNewPw1(''); setNewPw2(''); setPwMsg(null) }

  async function submitChangePassword() {
    const email = currentUser?.email?.trim().toLowerCase()
    if (!email) { setPwKind('err'); setPwMsg('Session not ready. Please re-login.'); return }
    if (!oldPw.trim()) { setPwKind('err'); setPwMsg(t('EnterCurrentPassword', lang) || 'Enter your current password'); return }
    if (!validatePassword(newPw1.trim())) { setPwKind('err'); setPwMsg(t('PasswordTooShort', lang) || 'Password too short (min 8 characters)'); return }
    if (newPw1.trim() !== newPw2.trim()) { setPwKind('err'); setPwMsg(t('PasswordsDontMatch', lang) || 'Passwords do not match'); return }
    if (oldPw.trim() === newPw1.trim()) { setPwKind('err'); setPwMsg(t('NewEqualsOld', lang) || 'New password must be different from the current one'); return }
    try {
      setPwBusy(true)
      const re = await supabase.auth.signInWithPassword({ email, password: oldPw.trim() })
      if (re.error) { setPwKind('err'); setPwMsg(t('CurrentPasswordWrong', lang) || 'Current password is incorrect'); setPwBusy(false); return }
      const upd = await supabase.auth.updateUser({ password: newPw1.trim() })
      if (upd.error) { setPwKind('err'); setPwMsg(`${t('SavedErr', lang) || 'Error'}: ${upd.error.message}`); setPwBusy(false); return }
      setPwKind('ok'); setPwMsg(t('PasswordUpdated', lang) || 'Password updated')
      setTimeout(() => { setPwModalOpen(false); resetPwForm() }, 1000)
    } catch (e: any) {
      setPwKind('err'); setPwMsg(`${t('SavedErr', lang) || 'Error'}: ${e?.message || String(e)}`)
    } finally { setPwBusy(false) }
  }

  type Scope = 'materials' | 'suppliers' | 'categories' | 'recipes' | 'equipment' | 'all'
  const scopeLabelKey: Record<Scope, string> = {
    materials: 'ScopeMaterials', suppliers: 'ScopeSuppliers', categories: 'ScopeCategories',
    recipes: 'ScopeRecipes', equipment: 'ScopeEquipment', all: 'ScopeAll'
  }
  const scopeDescKey: Record<Scope, string> = {
    materials: 'ScopeDescMaterials', suppliers: 'ScopeDescSuppliers', categories: 'ScopeDescCategories',
    recipes: 'ScopeDescRecipes', equipment: 'ScopeDescEquipment', all: 'ScopeDescAll'
  }

  const [dataModalOpen, setDataModalOpen] = useState(false)
  const [dataScope, setDataScope] = useState<Scope>('materials')
  const [confirmText, setConfirmText] = useState('')
  const [confirmCheck, setConfirmCheck] = useState(false)
  const [dataBusy, setDataBusy] = useState(false)
  const [dataMsg, setDataMsg] = useState<string | null>(null)
  const [dataMsgKind, setDataMsgKind] = useState<'ok' | 'err'>('ok')
  const [dataDone, setDataDone] = useState(false)

  function openDataModal(scope: Scope) {
    setDataScope(scope); setConfirmText(''); setConfirmCheck(false); setDataMsg(null); setDataDone(false); setDataModalOpen(true)
  }

  async function callReset(scope: Scope) {
    setDataBusy(true); setDataMsg(null)
    try {
      const res = await authFetch('/api/admin/data-reset', { method: 'POST', body: JSON.stringify({ scope }) })
      const ct = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { error: await res.text() }
      if (!res.ok) throw new Error(data?.error || 'Reset failed')

      try { new BroadcastChannel('app-events').postMessage('data-reset') } catch {}

      await reloadSettings()
      await refetchAppSettingsIntoState()

      setDataMsg(t('ResetCompleted', lang) || 'Reset completed')
      setDataMsgKind('ok')
      setDataDone(true)

      router.refresh()
      setTimeout(() => setDataModalOpen(false), 900)
    } catch (e: any) {
      setDataMsg((t('SavedErr', lang) || 'Error') + ': ' + (e?.message || String(e)))
      setDataMsgKind('err')
    } finally {
      setDataBusy(false)
    }
  }

  const confirmPhrase = dataScope === 'all' ? 'RESET ALL' : 'RESET'
  const canConfirmReset = confirmCheck && confirmText.trim().toUpperCase() === confirmPhrase

  const [catModalOpen, setCatModalOpen] = useState(false)
  function goToCategories(kind: 'materials' | 'dish' | 'prep' | 'equipment') {
    setCatModalOpen(false); router.push(`/settings/categories/${encodeURIComponent(kind)}`)
  }

  const [tagModalOpen, setTagModalOpen] = useState(false) // ⬅️ ADD

  return (
    <div key={revision} className="max-w-5xl mx-auto p-4 text-gray-100">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white">{t('Settings', lang)}</h1>
          {saveMessage && <span className="text-sm text-green-400">{saveMessage}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onResetLocal} className="px-3 h-9 rounded-lg border border-blue-400/30 bg-blue-600/15 text-blue-200 hover:bg-blue-600/25">
            {t('Reset', lang)}
          </button>
          <button onClick={onSave} disabled={saving || !dirty} className={`px-3 h-9 rounded-lg ${saving || !dirty ? 'opacity-60' : 'hover:opacity-90'} bg-blue-600 text-white inline-flex items-center gap-2`}>
            <CheckCircleIcon className="w-5 h-5" />
            {t('Save', lang)}
          </button>
        </div>
      </div>

      <SectionCard title={t('CompanyInfo', lang) || 'Company Info'}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className="text-sm text-gray-800">{t('RestaurantName', lang) || 'Restaurant name'}</label>
            <input type="text" value={s.restaurant_name ?? ''} onChange={e => patch('restaurant_name', e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-sm text-gray-800">{t('CompanyName', lang) || 'Company name'}</label>
            <input type="text" value={s.company_name ?? ''} onChange={e => patch('company_name', e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10" />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-gray-800">{t('Address', lang) || 'Address'}</label>
            <input type="text" value={s.address ?? ''} onChange={e => patch('address', e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-sm text-gray-800">{t('TaxCode', lang) || 'Tax code'}</label>
            <input type="text" value={s.tax_code ?? ''} onChange={e => patch('tax_code', e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-sm text-gray-800">{t('Phone', lang) || 'Phone'}</label>
            <input type="text" value={s.phone ?? ''} onChange={e => patch('phone', e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-sm text-gray-800">{t('Email', lang) || 'Email'}</label>
            <input type="email" value={s.email ?? ''} onChange={e => patch('email', e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="text-sm text-gray-800">{t('Website', lang) || 'Website'}</label>
            <input type="text" value={s.website ?? ''} onChange={e => patch('website', e.target.value)} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10" />
          </div>

          <div className="col-span-2 md:col-span-1">
            <label className="text-sm text-gray-800">{t('Logo', lang) || 'Logo'}</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="logoInput"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleLogoUpload(f)
                }}
              />
              <button
                type="button"
                onClick={() => document.getElementById('logoInput')?.click()}
                className="px-3 h-9 rounded-lg border bg-white text-gray-800 hover:bg-gray-50"
              >
                {t('ChooseFile', lang) || 'Choose file'}
              </button>
              {logoSrc ? (
                <img src={logoSrc} alt="logo" className="ml-2 h-10 w-10 rounded object-contain border bg-white" />
              ) : null}
              {s.logo_data ? (
                <button
                  type="button"
                  className="ml-auto w-9 h-9 inline-flex items-center justify-center rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                  onClick={handleRemoveLogo}
                  title={t('Remove', lang) || 'Remove'}
                  aria-label={t('Remove', lang) || 'Remove'}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <SectionCard title={t('General', lang)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-800">{t('Language', lang)}</label>
              <select
                value={s.language_code}
                onChange={e => {
                  const newLang = e.target.value as Lang
                  patch('language_code', newLang)
                }}
                className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10">
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-800">{t('Currency', lang)}</label>
              <select value={s.currency} onChange={e => { patch('currency', e.target.value as Currency) }} className="mt-1 w-full border rounded-lg px-2 py-1 text-gray-900 bg-white h-10">
                {(['VND', 'USD', 'EUR', 'GBP'] as const).map(c => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('Profile', lang) || 'Profile'}>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">{t('ChangePasswordDesc', lang) || 'Update your password from here'}</div>
            <button type="button" onClick={() => { resetPwForm(); setPwModalOpen(true) }} className="px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-90">
              {t('ChangePassword', lang) || 'Change password'}
            </button>
          </div>
        </SectionCard>

        <SectionCard title={t('Materials', lang)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <label className="text-sm text-gray-800">{t('ReviewMonths', lang)}</label>
                <input type="number" min={0} max={12} value={s.materials_review_months} onChange={handleMonthsChange('materials_review_months')} className="border rounded-lg px-2 py-1 text-gray-900 h-9 w-24" />
              </div>
            </div>
            <div className="col-span-2 border-t pt-2">
              <Toggle id="csv_confirm_materials" checked={!!s.csv_require_confirm_refs} onChange={v => patch('csv_require_confirm_refs', !!v)} label={t('AskCsvConfirm', lang)} />
              <Toggle id="materials_exclusive_default" checked={!!s.materials_exclusive_default} onChange={v => patch('materials_exclusive_default', !!v)} label={t('MaterialsExclusiveDefault', lang)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('Equipment', lang)}>
          <div className="grid grid-cols-2 gap-3">
            {/* Review months: label sx / input piccolo dx */}
            <div className="col-span-2">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <label className="text-sm text-gray-800">{t('ReviewMonths', lang)}</label>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={s.equipment_review_months}
                  onChange={handleMonthsChange('equipment_review_months')}
                  className="border rounded-lg px-2 py-1 text-gray-900 h-9 w-24"
                />
              </div>
            </div>

            {/* Default Import Markup × (moltiplicatore) */}
            <div className="col-span-2">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <label className="text-sm text-gray-800">
                   {(t('DefaultImportMarkup', lang) || 'Default Import Markup')}{' '}
                   <span className="text-gray-500">(×)</span>
                </label>
                <div className="w-24">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={s.default_markup_equipment_pct ?? 1.5}
                    onChange={e => {
                      const raw = e.target.value
                      const v = raw === '' ? null : Number(raw)
                      patch('default_markup_equipment_pct', v == null || !isFinite(v) ? null : clampFloat(v, 0, 100))
                    }}
                    placeholder="1.5"
                    className="w-full border rounded-lg px-2 py-1 text-gray-900 h-9"
                  />
                </div>
              </div>
              <div className="text-xs text-gray-600 mt-1">
              </div>
            </div>

            <div className="col-span-2 border-t pt-2">
              <Toggle id="csv_confirm_equipment" checked={!!s.equipment_csv_require_confirm_refs} onChange={v => patch('equipment_csv_require_confirm_refs', !!v)} label={t('AskCsvConfirm', lang)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('Vat', lang)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Toggle id="vat_enabled" checked={!!s.vat_enabled} onChange={(v) => { patch('vat_enabled', !!v) }} label={t('VatEnable', lang)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-sm text-gray-800">{t('VatDefaultRate', lang)}</label>
              <div className="relative mt-1 w-40">
                <input
                  type="number"
                  step={1}
                  min={0}
                  max={100}
                  value={s.vat_rate ?? ''}
                  onChange={e => {
                    const parsed = parseNumOrNull(e.target.value)
                    const clamped = parsed == null ? null : clampInt(parsed, 0, 100)
                    patch('vat_rate', clamped)
                  }}
                  className={`w-full border rounded-lg pr-7 pl-2 py-1 text-gray-900 h-9 ${!s.vat_enabled ? 'bg-gray-100' : ''}`}
                  disabled={!s.vat_enabled}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 text-sm">%</span>
              </div>
            </div>
          </div>
        </SectionCard>
        
          <SectionCard title={t('Utilities', lang)}>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCatModalOpen(true)} className="px-3 h-9 rounded-lg border hover:bg-gray-50 text-gray-800">
                {t('EditCategories', lang)}
              </button>
              {/* ⬇️ NEW: Manage Tags (coerente con gli altri pulsanti) */}
              <button type="button" onClick={() => setTagModalOpen(true)} className="px-3 h-9 rounded-lg border hover:bg-gray-50 text-gray-800">
                {t('ManageTags', lang) || 'Manage tags'}
              </button>
              <button type="button" onClick={() => router.push('/trash')} className="px-3 h-9 rounded-lg border hover:bg-gray-50 text-gray-800">
                {t('Trash', lang)}
              </button>
              <button type="button" onClick={() => router.push('/archive')} className="px-3 h-9 rounded-lg border hover:bg-gray-50 text-gray-800">
                {t('Archive', lang)}
              </button>
            </div>
          </SectionCard>
            

        {canSeeAccounts && (
          <SectionCard title={t('Accounts', lang) || 'Accounts'}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { resetAddForm(); setAddOpen(true) }} className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-90">
                <PlusIcon className="w-5 h-5" /> {t('NewAccount', lang) || 'New Account'}
              </button>
              <button type="button" onClick={() => setManageOpen(true)} className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border text-gray-800 hover:bg-gray-50">
                <Cog6ToothIcon className="w-5 h-5" /> {t('ManageAccounts', lang) || 'Manage Accounts'}
              </button>
            </div>
          </SectionCard>
        )}

        {canSeeAccounts && (
          <SectionCard title={t('Data', lang) || 'Data'}>
            <div className="space-y-3">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                {t('DataDangerNote', lang)}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  { scope: 'materials', key: 'ResetMaterials' as const },
                  { scope: 'suppliers', key: 'ResetSuppliers' as const },
                  { scope: 'categories', key: 'ResetCategories' as const },
                  { scope: 'recipes', key: 'ResetRecipes' as const },
                  { scope: 'equipment', key: 'ResetEquipment' as const },
                ]).map(btn => (
                  <button key={btn.scope} type="button" onClick={() => openDataModal(btn.scope as any)}
                          className="w-full inline-flex items-center justify-center px-3 py-2 h-10 rounded-lg border hover:bg-gray-50 text-gray-800 text-sm whitespace-nowrap"
                          title={t(btn.key, lang)}>
                    {t(btn.key, lang)}
                  </button>
                ))}

                <button type="button" onClick={() => { if (myRole !== 'owner') return; openDataModal('all') }}
                        disabled={myRole !== 'owner'}
                        className={`w-full inline-flex items-center justify-center px-3 py-2 h-10 rounded-lg text-sm whitespace-nowrap ${
                          myRole !== 'owner' ? 'opacity-40 cursor-not-allowed border' : 'border hover:bg-red-50 text-red-600 border-red-300'
                        }`}
                        title={myRole !== 'owner' ? t('OnlyOwnerResetAll', lang) : t('ResetAll', lang)}>
                  {t('ResetAll', lang)}
                </button>
              </div>
            </div>
          </SectionCard>
        )}
      </div>

      {/* Data reset modal */}
      <Modal open={dataModalOpen} title={t('Reset', lang) + ' ' + t(scopeLabelKey[dataScope], lang)} onClose={() => setDataModalOpen(false)}>
        {!dataDone ? (
          <div className="space-y-3 text-gray-800">
            <p className="font-medium">{t(scopeDescKey[dataScope], lang)}</p>

            <div className="text-sm">
              {t('TypeToConfirm', lang)} <span className="font-mono font-bold">{confirmPhrase}</span>
            </div>
            <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} className="w-full border rounded-lg px-2 py-1 h-9" />

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmCheck} onChange={e => setConfirmCheck(e.target.checked)} />
              {t('IrreversibleAck', lang)}
            </label>

            {dataMsg && (
              <div className={`text-sm ${dataMsgKind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {dataMsg}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDataModalOpen(false)} className="px-3 h-9 rounded-lg border hover:bg-gray-50" disabled={dataBusy}>
                {t('Cancel', lang) || 'Cancel'}
              </button>
              <button type="button" onClick={() => callReset(dataScope)} disabled={!canConfirmReset || dataBusy}
                      className={`px-3 h-9 rounded-lg bg-red-600 text-white ${!canConfirmReset || dataBusy ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'}`}>
                {dataBusy ? (t('Loading', lang) || 'Loading…') : `${t('Reset', lang)} ${t(scopeLabelKey[dataScope], lang)}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-gray-800">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircleIcon className="w-5 h-5" />
              <span>{t('ResetCompleted', lang) || 'Reset completed'}</span>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <button type="button" onClick={() => setDataModalOpen(false)} className="px-4 h-9 rounded-lg bg-blue-600 text-white hover:opacity-90">
                {t('OK', lang) || 'OK'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Categories chooser modal */}
<Modal
  open={catModalOpen}
  title={t('ChooseCategories', lang)}
  onClose={() => setCatModalOpen(false)}
  width="max-w-md"
>
  <div className="space-y-4 text-gray-800">
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => goToCategories('materials')}
        className="w-full group flex items-center gap-3 rounded-xl border px-3 py-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 text-blue-700 grid place-items-center group-hover:bg-blue-100">
          <Squares2X2Icon className="w-5 h-5" />
        </div>
        <div className="font-medium">{t('MaterialCategories', lang)}</div>
      </button>

      <button
        type="button"
        onClick={() => goToCategories('dish')}
        className="w-full group flex items-center gap-3 rounded-xl border px-3 py-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center group-hover:bg-emerald-100">
          <BookOpenIcon className="w-5 h-5" />
        </div>
        <div className="font-medium">{t('DishCategories', lang)}</div>
      </button>

      <button
        type="button"
        onClick={() => goToCategories('prep')}
        className="w-full group flex items-center gap-3 rounded-xl border px-3 py-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <div className="shrink-0 w-10 h-10 rounded-lg bg-amber-50 text-amber-700 grid place-items-center group-hover:bg-amber-100">
          <ClipboardDocumentListIcon className="w-5 h-5" />
        </div>
        <div className="font-medium">{t('PrepCategories', lang)}</div>
      </button>

      <button
        type="button"
        onClick={() => goToCategories('equipment')}
        className="w-full group flex items-center gap-3 rounded-xl border px-3 py-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <div className="shrink-0 w-10 h-10 rounded-lg bg-purple-50 text-purple-700 grid place-items-center group-hover:bg-purple-100">
          <WrenchScrewdriverIcon className="w-5 h-5" />
        </div>
        <div className="font-medium">{t('EquipmentCategories', lang)}</div>
      </button>
    </div>

    <div className="pt-2 flex items-center justify-end">
      <button
        type="button"
        onClick={() => setCatModalOpen(false)}
        className="px-4 h-9 rounded-lg border hover:bg-gray-50"
      >
        {t('Cancel', lang) || 'Cancel'}
      </button>
    </div>
  </div>
</Modal>
        
      {/* Change password modal */}
      <Modal open={pwModalOpen} title={t('ChangePassword', lang) || 'Change password'} onClose={() => setPwModalOpen(false)} width="max-w-md">
        <div className="space-y-3 text-gray-800">
          <div className="space-y-2">
            <label className="text-sm text-gray-800">{t('CurrentPassword', lang) || 'Current password'}</label>
            <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} className="w-full border rounded-lg px-2 py-1 h-9" />
            <label className="text-sm text-gray-800">{t('NewPassword', lang) || 'New password'}</label>
            <input type="password" value={newPw1} onChange={e => setNewPw1(e.target.value)} className="w-full border rounded-lg px-2 py-1 h-9" />
            <label className="text-sm text-gray-800">{t('RepeatNewPassword', lang) || 'Repeat new password'}</label>
            <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} className="w-full border rounded-lg px-2 py-1 h-9" />
          </div>

          {pwMsg && (
            <div className={`text-sm ${pwKind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{pwMsg}</div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setPwModalOpen(false)} className="px-3 h-9 rounded-lg border hover:bg-gray-50" disabled={pwBusy}>
              {t('Cancel', lang) || 'Cancel'}
            </button>
            <button type="button" onClick={submitChangePassword} disabled={pwBusy} className={`px-3 h-9 rounded-lg bg-blue-600 text-white ${pwBusy ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'}`}>
              {pwBusy ? (t('Loading', lang) || 'Loading…') : (t('Save', lang) || 'Save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Accounts: Add */}
      <Modal open={addOpen} title={t('NewAccount', lang) || 'New account'} onClose={() => setAddOpen(false)} width="max-w-lg">
        <div className="space-y-3 text-gray-800">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm">{t('Email', lang) || 'Email'}</label>
              <input type="email" value={formAdd.email}
                     onChange={e => setFormAdd(v => ({ ...v, email: e.target.value }))}
                     className="w-full border rounded-lg px-2 py-1 h-9" />
            </div>
            <div>
              <label className="text-sm">{t('Phone', lang) || 'Phone'}</label>
              <input type="text" value={formAdd.phone}
                     onChange={e => setFormAdd(v => ({ ...v, phone: e.target.value }))}
                     className="w-full border rounded-lg px-2 py-1 h-9" />
            </div>
            <div>
              <label className="text-sm">{t('Name', lang) || 'Name'}</label>
              <input type="text" value={formAdd.name}
                     onChange={e => setFormAdd(v => ({ ...v, name: e.target.value }))}
                     className="w-full border rounded-lg px-2 py-1 h-9" />
            </div>
            <div>
              <label className="text-sm">{t('Position', lang) || 'Position'}</label>
              <input type="text" value={formAdd.position}
                     onChange={e => setFormAdd(v => ({ ...v, position: e.target.value }))}
                     className="w-full border rounded-lg px-2 py-1 h-9" />
            </div>
            <div>
              <label className="text-sm">{t('Role', lang) || 'Role'}</label>
              <select
                value={formAdd.role}
                onChange={e => setFormAdd(v => ({ ...v, role: e.target.value as AccountRole }))}
                className="w-full border rounded-lg px-2 py-1 h-10 bg-white">
                <option value="staff">staff</option>
                <option value="admin" disabled={myRole === 'admin'}>admin</option>
                <option value="owner" disabled={myRole !== 'owner'}>owner</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formAdd.is_active}
                       onChange={e => setFormAdd(v => ({ ...v, is_active: e.target.checked }))} />
                {t('Active', lang) || 'Active'}
              </label>
            </div>
          </div>

          {accMsg && (
            <div className={`text-sm ${accMsgKind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{accMsg}</div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="px-3 h-9 rounded-lg border hover:bg-gray-50">
              {t('Cancel', lang) || 'Cancel'}
            </button>
            <button
              type="button"
              onClick={async () => {
                setCreating(true)
                const created = await addAccount()
                setCreating(false)
                if (created) {
                  setPostInviteEmail(created.email)
                  setPostInviteOpen(true)
                  setAddOpen(false)
                }
              }}
              className={`px-3 h-9 rounded-lg bg-blue-600 text-white ${creating ? 'opacity-60' : 'hover:opacity-90'}`}
              disabled={creating}
            >
              {creating ? (t('Loading', lang) || 'Loading…') : (t('Save', lang) || 'Save')}
            </button>
          </div>
        </div>
      </Modal>

            {/* Accounts: Manage */}
      <Modal open={manageOpen} title={t('ManageAccounts', lang) || 'Manage accounts'} onClose={() => setManageOpen(false)} width="max-w-3xl">
        <div className="space-y-3 text-gray-800">
          {accMsg && (
            <div className={`text-sm ${accMsgKind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{accMsg}</div>
          )}
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
  <thead className="bg-gray-50 text-gray-700">
    <tr>
      <th className="text-left p-2">Email</th>
      <th className="text-left p-2">{t('Name', lang) || 'Name'}</th>
      <th className="text-left p-2">{t('Role', lang) || 'Role'}</th>
      <th className="text-center p-2">{t('Active', lang) || 'Active'}</th>
      <th className="text-center p-2">{t('Auth', lang) || 'Auth'}</th>
      <th className="text-right p-2">{t('Actions', lang) || 'Actions'}</th>
    </tr>
  </thead>
  <tbody>
    {accLoading ? (
      <tr><td className="p-3" colSpan={6}>{t('Loading', lang) || 'Loading…'}</td></tr>
    ) : acc.length === 0 ? (
      <tr><td className="p-3" colSpan={6}>{t('NoData', lang) || 'No data'}</td></tr>
    ) : acc.map(u => (
      <tr key={u.id} className="border-t align-middle">
        <td className="p-2">{u.email}</td>
        <td className="p-2">{u.name || '-'}</td>
        <td className="p-2">{u.role}</td>
        <td className="p-2 text-center">
          {u.is_active ? (
            <span className="text-green-600 font-bold">✓</span>
          ) : (
            <span className="text-red-600 font-bold">✗</span>
          )}
        </td>
        <td className="p-2 text-center">
          {u.first_login_at ? (
            <span className="text-green-600 font-bold">✓</span>
          ) : (
            <span className="text-red-600 font-bold">✗</span>
          )}
        </td>
        <td className="p-2 text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => sendAuthLinkForRow(u)}
              className="px-3 h-8 rounded-lg border hover:bg-gray-50 leading-none whitespace-nowrap"
              disabled={!!sendingRow[u.id]}
              title={t('SendAccessLink', lang) || 'Send access link'}
            >
              {sendingRow[u.id]
                ? (t('Loading', lang) || 'Loading…')
                : (t('SendLink', lang) || 'Send link')}
            </button>
            <button
              onClick={() => openEdit(u)}
              className="px-3 h-8 rounded-lg border hover:bg-gray-50 leading-none whitespace-nowrap"
            >
              {t('Edit', lang) || 'Edit'}
            </button>
            <button
              onClick={() => deleteAccount(u.id)}
              className="px-3 h-8 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 leading-none whitespace-nowrap"
            >
              {t('Delete', lang) || 'Delete'}
            </button>
          </div>
        </td>
      </tr>
    ))}
  </tbody>
</table>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button type="button" onClick={() => setManageOpen(false)} className="px-4 h-9 rounded-lg bg-blue-600 text-white hover:opacity-90">
              {t('Close', lang) || 'Close'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Accounts: Edit */}
      <Modal open={editOpen && !!formEdit} title={t('EditAccount', lang) || 'Edit account'} onClose={() => { setEditOpen(false); setSelected(null); setFormEdit(null) }} width="max-w-lg">
        {formEdit ? (
          <div className="space-y-3 text-gray-800">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm">{t('Email', lang) || 'Email'}</label>
                <input type="email" value={formEdit.email}
                       onChange={e => setFormEdit(v => v ? ({ ...v, email: e.target.value }) : v)}
                       className="w-full border rounded-lg px-2 py-1 h-9" />
              </div>
              <div>
                <label className="text-sm">{t('Phone', lang) || 'Phone'}</label>
                <input type="text" value={formEdit.phone}
                       onChange={e => setFormEdit(v => (v ? ({ ...v, phone: e.target.value }) : v))}
                       className="w-full border rounded-lg px-2 py-1 h-9" />
              </div>
              <div>
                <label className="text-sm">{t('Name', lang) || 'Name'}</label>
                <input type="text" value={formEdit.name}
                       onChange={e => setFormEdit(v => (v ? ({ ...v, name: e.target.value }) : v))}
                       className="w-full border rounded-lg px-2 py-1 h-9" />
              </div>
              <div>
                <label className="text-sm">{t('Position', lang) || 'Position'}</label>
                <input type="text" value={formEdit.position}
                       onChange={e => setFormEdit(v => (v ? ({ ...v, position: e.target.value }) : v))}
                       className="w-full border rounded-lg px-2 py-1 h-9" />
              </div>
              <div>
                <label className="text-sm">{t('Role', lang) || 'Role'}</label>
                <select
                  value={formEdit.role}
                  onChange={e => setFormEdit(v => (v ? ({ ...v, role: e.target.value as AccountRole }) : v))}
                  className="w-full border rounded-lg px-2 py-1 h-10 bg-white">
                  <option value="staff">staff</option>
                  <option value="admin" disabled={myRole === 'admin'}>admin</option>
                  <option value="owner" disabled={myRole !== 'owner'}>owner</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formEdit.is_active}
                         onChange={e => setFormEdit(v => (v ? ({ ...v, is_active: e.target.checked }) : v))} />
                  {t('Active', lang) || 'Active'}
                </label>
              </div>
            </div>

            {accMsg && (
              <div className={`text-sm ${accMsgKind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{accMsg}</div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setEditOpen(false); setSelected(null); setFormEdit(null) }} className="px-3 h-9 rounded-lg border hover:bg-gray-50">
                {t('Cancel', lang) || 'Cancel'}
              </button>
              <button type="button" onClick={saveEdit} className="px-3 h-9 rounded-lg bg-blue-600 text-white hover:opacity-90">
                {t('Save', lang) || 'Save'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Accounts: Post invite confirm */}
<Modal
  open={postInviteOpen}
  title={t('SendAccessLinkTitle', lang) || 'Send access link?'}
  onClose={() => {
    if (sendingLink) return; // evita chiusura mentre invia (opzionale)
    setPostInviteOpen(false);
    setPostInviteEmail(null);
  }}
  width="max-w-md"
>
  <div className="space-y-3 text-gray-800">
    <p className="text-sm">
      {postInviteEmail
        ? (t('SendAccessLinkBodyKnown', lang) || 'Send a sign-in link to {{email}}?').replace('{{email}}', postInviteEmail!)
        : (t('SendAccessLinkBodyGeneric', lang) || 'Do you want to send a sign-in link now?')}
    </p>
    <div className="pt-2 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={skipInviteForNow}
        disabled={sendingLink}
        className={`px-3 h-9 rounded-lg border ${sendingLink ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
      >
        {t('NotNow', lang) || 'Not now'}
      </button>
      <button
        type="button"
        onClick={confirmSendInviteNow}
        disabled={sendingLink}
        aria-busy={sendingLink}
        className={`px-3 h-9 rounded-lg bg-blue-600 text-white ${sendingLink ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'}`}
      >
        {sendingLink ? (t('Loading', lang) || 'Sending…') : (t('SendLink', lang) || 'Send link')}
      </button>
    </div>
  </div>
</Modal>


        
      <TagManagerModal
    open={tagModalOpen}
    onClose={() => setTagModalOpen(false)}
  />
    </div>
  )
}