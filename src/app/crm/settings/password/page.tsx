'use client'

import React, { useState, useEffect } from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import { Key, CheckCircleIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase_shim'
import { t } from '@/lib/i18n'

export default function PasswordChangePage() {
    const { language } = useSettings()

    const [currentUser, setCurrentUser] = useState<{ id: string, email: string } | null>(null)
    const [oldPw, setOldPw] = useState('')
    const [newPw1, setNewPw1] = useState('')
    const [newPw2, setNewPw2] = useState('')
    const [pwMsg, setPwMsg] = useState<string | null>(null)
    const [pwKind, setPwKind] = useState<'ok' | 'err'>('ok')
    const [pwBusy, setPwBusy] = useState(false)

    useEffect(() => {
        const fetchUser = async () => {
            const { data } = await supabase.auth.getUser()
            if (data?.user) {
                setCurrentUser({ id: data.user.id, email: data.user.email || '' })
            }
        }
        fetchUser()
    }, [])

    function validatePassword(p: string) { return typeof p === 'string' && p.trim().length >= 8 }
    function resetPwForm() { setOldPw(''); setNewPw1(''); setNewPw2(''); setPwMsg(null) }

    async function submitChangePassword(e: React.FormEvent) {
        e.preventDefault()
        const email = currentUser?.email?.trim().toLowerCase()
        if (!email) { setPwKind('err'); setPwMsg('Session not ready. Please re-login.'); return }
        if (!oldPw.trim()) { setPwKind('err'); setPwMsg(t(language, 'EnterCurrentPassword') || 'Enter your current password'); return }
        if (!validatePassword(newPw1.trim())) { setPwKind('err'); setPwMsg(t(language, 'PasswordTooShort') || 'Password too short (min 8 characters)'); return }
        if (newPw1.trim() !== newPw2.trim()) { setPwKind('err'); setPwMsg(t(language, 'PasswordsDontMatch') || 'Passwords do not match'); return }
        if (oldPw.trim() === newPw1.trim()) { setPwKind('err'); setPwMsg(t(language, 'NewEqualsOld') || 'New password must be different from the current one'); return }
        
        try {
            setPwBusy(true)
            const re = await supabase.auth.signInWithPassword({ email, password: oldPw.trim() })
            if (re.error) { setPwKind('err'); setPwMsg(t(language, 'CurrentPasswordWrong') || 'Current password is incorrect'); setPwBusy(false); return }
            const upd = await supabase.auth.updateUser({ password: newPw1.trim() })
            if (upd.error) { setPwKind('err'); setPwMsg(`${t(language, 'SavedErr') || 'Error'}: ${upd.error.message}`); setPwBusy(false); return }
            setPwKind('ok'); setPwMsg(t(language, 'PasswordUpdated') || 'Password updated')
            setTimeout(() => { resetPwForm() }, 2000)
        } catch (e: any) {
            setPwKind('err'); setPwMsg(`${t(language, 'SavedErr') || 'Error'}: ${e?.message || String(e)}`)
        } finally { 
            setPwBusy(false) 
        }
    }

    return (
        <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">
                        {t(language, 'Settings')}
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">{t(language, 'CRMSettingsDesc')}</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Key className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">{t(language, 'ChangePassword')}</h2>
                        <p className="text-sm text-slate-500">{t(language, 'ChangePasswordDesc')}</p>
                    </div>
                </div>

                <form onSubmit={submitChangePassword} className="space-y-5 max-w-md">
                    {pwMsg && (
                        <div className={`p-4 rounded-xl text-sm font-medium ${pwKind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {pwMsg}
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'EnterCurrentPassword') || 'Current Password'}</label>
                        <input 
                            type="password"
                            required
                            value={oldPw}
                            onChange={e => setOldPw(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 bg-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'NewPassword') || 'New Password'}</label>
                        <input 
                            type="password"
                            required
                            value={newPw1}
                            onChange={e => setNewPw1(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 bg-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t(language, 'ConfirmNewPassword') || 'Confirm New Password'}</label>
                        <input 
                            type="password"
                            required
                            value={newPw2}
                            onChange={e => setNewPw2(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm text-slate-900 bg-white"
                        />
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={pwBusy}
                            className={`w-full py-2.5 text-sm font-bold text-white rounded-xl transition flex items-center justify-center gap-2 shadow-md ${pwBusy ? 'bg-blue-600/60 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'}`}
                        >
                            {pwBusy ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircleIcon className="w-4 h-4"/>}
                            {t(language, 'ChangePassword')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
