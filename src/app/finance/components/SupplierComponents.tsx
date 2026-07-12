import React, { useState, useEffect, Fragment } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Combobox, Transition } from '@headlessui/react'
import { supabase } from '@/lib/supabase_shim'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

export function SupplierCombobox({
    suppliers,
    selectedId,
    onChange,
    onAddNew,
    placeholder
}: {
    suppliers: { id: string; name: string }[]
    selectedId: string | null
    onChange: (id: string | null) => void
    onAddNew: (query: string) => void
    placeholder?: string
}) {
    const { language } = useSettings()
    const [query, setQuery] = useState('')
    const selectedSupplier = suppliers.find(s => s.id === selectedId) || null
    const filteredSuppliers = query === '' ? suppliers : suppliers.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))

    const defaultPlaceholder = language === 'vi' ? '— Chọn nhà cung cấp —' : '— Select Supplier —'
    const finalPlaceholder = placeholder || defaultPlaceholder

    return (
        <Combobox value={selectedSupplier} onChange={(s: any) => onChange(s ? s.id : null)} onClose={() => setQuery('')}>
            <div className="relative flex-1">
                <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 sm:text-sm">
                    <Combobox.Input
                        className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-slate-700 focus:ring-0 outline-none bg-transparent"
                        displayValue={(supplier: any) => supplier?.name || ''}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={finalPlaceholder}
                        autoComplete="off"
                        name="supplier_prevent_autofill"
                        data-lpignore="true"
                    />
                    <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </Combobox.Button>
                </div>
                <Combobox.Options
                    anchor={{ to: 'bottom start', gap: 4 }}
                    transition
                    className="z-[100] mt-1 max-h-60 w-[var(--input-width)] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
                >
                    {filteredSuppliers.length === 0 && query !== '' ? (
                        <div className="relative cursor-default select-none px-4 py-2 text-slate-700 flex flex-col gap-2">
                            <span>{language === 'vi' ? 'Không tìm thấy nhà cung cấp.' : 'No supplier found.'}</span>
                            <button type="button" onClick={() => onAddNew(query)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-semibold hover:bg-blue-100 transition text-left">
                                {language === 'vi' ? `+ Thêm "${query}" làm nhà cung cấp mới` : `+ Add "${query}" as new supplier`}
                            </button>
                        </div>
                    ) : (
                        filteredSuppliers.map((supplier) => (
                            <Combobox.Option key={supplier.id} className={({ active }) => `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-blue-600 text-white' : 'text-slate-900'}`} value={supplier}>
                                {({ selected, active }) => (
                                    <>
                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>{supplier.name}</span>
                                        {selected ? <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-blue-600'}`}><Check className="h-4 w-4" aria-hidden="true" /></span> : null}
                                    </>
                                )}
                            </Combobox.Option>
                        ))
                    )}
                    {filteredSuppliers.length > 0 && (
                        <div className="border-t border-slate-100 mt-1 pt-1">
                            <button type="button" onClick={() => onAddNew(query)} className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium">
                                {language === 'vi' ? '+ Thêm nhà cung cấp mới' : '+ Add New Supplier'}
                            </button>
                        </div>
                    )}
                </Combobox.Options>
            </div>
        </Combobox>
    )
}

export function AddSupplierModal({ isOpen, onClose, onSaved, initialName = '' }: { isOpen: boolean, onClose: () => void, onSaved: (s: any) => void, initialName?: string }) {
    const { language } = useSettings()
    const [name, setName] = useState(initialName)
    const [poc, setPoc] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [orderMethod, setOrderMethod] = useState('')
    const [paymentTerm, setPaymentTerm] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setName(initialName)
            setPoc(''); setPhone(''); setEmail(''); setOrderMethod(''); setPaymentTerm(''); setPaymentMethod(''); setNotes('')
        }
    }, [isOpen, initialName])

    const save = async () => {
        if (!name.trim()) return
        setLoading(true)
        const payload = { name: name.trim(), poc: poc || null, phone: phone || null, email: email || null, order_method: orderMethod || null, payment_term: paymentTerm || null, payment_method: paymentMethod || null, notes: notes || null }
        const { data, error } = await supabase.from('suppliers').insert(payload).select('id, name').single()
        setLoading(false)
        if (error) { 
            alert((language === 'vi' ? 'Lưu nhà cung cấp thất bại: ' : 'Failed to save supplier: ') + error.message)
            return 
        }
        onSaved(data)
    }

    if (!isOpen) return null
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-800">
                        {language === 'vi' ? 'Thêm nhà cung cấp mới' : 'Add New Supplier'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-sm font-semibold text-slate-700">{language === 'vi' ? 'Tên *' : 'Name *'}</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" autoFocus />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">{language === 'vi' ? 'Người liên hệ' : 'Point of Contact'}</label>
                        <input value={poc} onChange={e => setPoc(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">{language === 'vi' ? 'Số điện thoại' : 'Phone'}</label>
                        <input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-sm font-semibold text-slate-700">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">{language === 'vi' ? 'Phương thức đặt hàng' : 'Order Method'}</label>
                        <input value={orderMethod} onChange={e => setOrderMethod(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">{language === 'vi' ? 'Điều khoản thanh toán' : 'Payment Term'}</label>
                        <input value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-sm font-semibold text-slate-700">{language === 'vi' ? 'Phương thức thanh toán' : 'Payment Method'}</label>
                        <input value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-sm font-semibold text-slate-700">{language === 'vi' ? 'Ghi chú' : 'Notes'}</label>
                        <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 bg-white" />
                    </div>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-sm transition bg-white">
                        {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                    <button onClick={save} disabled={loading || !name.trim()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition disabled:opacity-50">
                        {loading ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (language === 'vi' ? 'Lưu nhà cung cấp' : 'Save Supplier')}
                    </button>
                </div>
            </div>
        </div>
    )
}
