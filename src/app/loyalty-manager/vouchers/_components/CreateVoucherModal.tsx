import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2 } from 'lucide-react'

export default function CreateVoucherModal({ onClose, onSuccess, t }: { onClose: () => void, onSuccess: () => void, t: any }) {
    const [mode, setMode] = useState<'single' | 'bulk'>('single')
    const [loading, setLoading] = useState(false)

    // Single Mode State
    const [manualId, setManualId] = useState(false)
    const [customId, setCustomId] = useState('')
    const [autoId, setAutoId] = useState('')
    const [formData, setFormData] = useState({
        value: 0,
        expires_on: '',
        donor_type: 'restaurant',
        donor_name: '',
        notes: ''
    })

    // Bulk Mode State
    const [bulkQty, setBulkQty] = useState(1)
    const [bulkValue, setBulkValue] = useState(0)
    const [bulkExpires, setBulkExpires] = useState('')
    const [bulkDonorType, setBulkDonorType] = useState('restaurant')
    const [bulkDonorName, setBulkDonorName] = useState('')
    const [bulkNotes, setBulkNotes] = useState('')

    useEffect(() => {
        if (!manualId && mode === 'single') {
            generateNextId().then(id => setAutoId(id))
        }
    }, [manualId, mode])

    const generateNextId = async () => {
        // Generate a random 8-character alphanumeric code
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        let result = ''
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length))
        }

        // Check uniqueness (simple check, could be improved)
        const { data } = await supabase
            .from('gift_vouchers')
            .select('code')
            .eq('code', result)
            .single()

        if (data) {
            return generateNextId() // Retry if exists
        }

        return result
    }

    const handleSingleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const code = manualId ? customId : autoId
        if (!code) {
            alert(t.vouchers.modals.error_required_code)
            setLoading(false)
            return
        }

        const { error } = await supabase.from('gift_vouchers').insert({
            code: code,
            value: formData.value,
            expires_on: formData.expires_on ? new Date(formData.expires_on).toISOString() : null,
            issued_on: new Date().toISOString(),
            status: 'active',
            donor_type: formData.donor_type,
            donor_name: formData.donor_name || null,
            notes: formData.notes || null
        })

        if (error) {
            alert('Error: ' + error.message)
        } else {
            // Create initial transaction
            const { data: voucher } = await supabase.from('gift_vouchers').select('id').eq('code', code).single()
            if (voucher) {
                await supabase.from('voucher_transactions').insert({
                    voucher_id: voucher.id,
                    amount: formData.value,
                    type: 'issue',
                    description: `Issued by ${formData.donor_type}${formData.donor_name ? ` (${formData.donor_name})` : ''}`
                })
            }
            onSuccess()
        }
        setLoading(false)
    }

    const handleBulkSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const rows = []
            for (let i = 0; i < bulkQty; i++) {
                const code = await generateNextId() // Note: calling async in loop is slow but fine for small bulk
                rows.push({
                    code: code,
                    value: bulkValue,
                    expires_on: bulkExpires ? new Date(bulkExpires).toISOString() : null,
                    issued_on: new Date().toISOString(),
                    status: 'active',

                    donor_type: bulkDonorType,
                    donor_name: bulkDonorName || null,
                    notes: bulkNotes || null
                })
            }

            const { data, error } = await supabase.from('gift_vouchers').insert(rows).select()
            if (error) throw error

            // Create transactions
            if (data) {
                const transactions = data.map(v => ({
                    voucher_id: v.id,
                    amount: v.value,
                    type: 'issue',
                    description: `Issued by ${bulkDonorType}${bulkDonorName ? ` (${bulkDonorName})` : ''}`
                }))
                await supabase.from('voucher_transactions').insert(transactions)
            }

            onSuccess()
        } catch (err: any) {
            alert(t.vouchers.modals.error_bulk + ': ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-slate-800">{t.vouchers.modals.create_title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${mode === 'single' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setMode('single')}
                    >
                        {t.vouchers.modals.single_voucher}
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${mode === 'bulk' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setMode('bulk')}
                    >
                        {t.vouchers.modals.bulk_creation}
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {mode === 'single' ? (
                        <form onSubmit={handleSingleSubmit} className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-slate-700">{t.vouchers.modals.voucher_code}</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">{t.vouchers.modals.manual_code}</span>
                                    <button
                                        type="button"
                                        onClick={() => setManualId(!manualId)}
                                        className={`w-8 h-4 rounded-full transition-colors relative ${manualId ? 'bg-blue-600' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${manualId ? 'translate-x-4' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {manualId ? (
                                <input
                                    type="text"
                                    value={customId}
                                    onChange={e => setCustomId(e.target.value.toUpperCase())}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900 placeholder-slate-600"
                                    placeholder={t.vouchers.modals.enter_code_placeholder}
                                    required
                                    maxLength={8}
                                />
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={autoId}
                                        disabled
                                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-900 font-mono"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => generateNextId().then(id => setAutoId(id))}
                                        className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                                    >
                                        {t.vouchers.modals.regenerate}
                                    </button>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.value}</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    value={formData.value}
                                    onChange={e => setFormData({ ...formData, value: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.donor_type}</label>
                                    <select
                                        value={formData.donor_type}
                                        onChange={e => setFormData({ ...formData, donor_type: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                    >
                                        <option value="restaurant">Restaurant</option>
                                        <option value="partner">Partner</option>
                                        <option value="customer">Customer</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.donor_name}</label>
                                    <input
                                        type="text"
                                        value={formData.donor_name}
                                        onChange={e => setFormData({ ...formData, donor_name: e.target.value })}
                                        placeholder={formData.donor_type === 'restaurant' ? t.vouchers.modals.optional_placeholder : t.vouchers.modals.required_placeholder}
                                        required={formData.donor_type !== 'restaurant'}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.expires_on}</label>
                                <input
                                    type="date"
                                    value={formData.expires_on}
                                    onChange={e => setFormData({ ...formData, expires_on: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.notes}</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-600"
                                    rows={2}
                                    placeholder={t.vouchers.modals.notes_placeholder}
                                />
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">{t.vouchers.modals.cancel}</button>
                                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t.vouchers.modals.create}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleBulkSubmit} className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 mb-4">
                                {t.vouchers.modals.bulk_note}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.quantity}</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={bulkQty}
                                    onChange={e => setBulkQty(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.value}</label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    value={bulkValue}
                                    onChange={e => setBulkValue(parseFloat(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.donor_type}</label>
                                    <select
                                        value={bulkDonorType}
                                        onChange={e => setBulkDonorType(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                    >
                                        <option value="restaurant">Restaurant</option>
                                        <option value="partner">Partner</option>
                                        <option value="customer">Customer</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.donor_name}</label>
                                    <input
                                        type="text"
                                        value={bulkDonorName}
                                        onChange={e => setBulkDonorName(e.target.value)}
                                        placeholder={bulkDonorType === 'restaurant' ? t.vouchers.modals.optional_placeholder : t.vouchers.modals.required_placeholder}
                                        required={bulkDonorType !== 'restaurant'}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.expires_on}</label>
                                <input
                                    type="date"
                                    value={bulkExpires}
                                    onChange={e => setBulkExpires(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.vouchers.modals.notes}</label>
                                <textarea
                                    value={bulkNotes}
                                    onChange={e => setBulkNotes(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder-slate-600"
                                    rows={2}
                                    placeholder={t.vouchers.modals.notes_placeholder}
                                />
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">{t.vouchers.modals.cancel}</button>
                                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t.vouchers.modals.generate_vouchers.replace('{count}', bulkQty)}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
