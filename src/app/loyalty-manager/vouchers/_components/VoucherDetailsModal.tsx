import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2, X, Trash, History, CreditCard, Ban, CheckCircle, Power, Download } from 'lucide-react'
import Barcode from 'react-barcode'
import { format, isPast } from 'date-fns'

type Voucher = {
    id: string
    code: string
    value: number
    status: 'active' | 'redeemed' | 'expired' | 'blocked'
    issued_on: string
    expires_on: string | null
    donor_type: string
    donor_name: string | null
    notes: string | null
}

type Transaction = {
    id: string
    amount: number
    type: 'issue' | 'redeem' | 'adjustment'
    description: string
    created_at: string
}

export default function VoucherDetailsModal({ voucher, onClose, onUpdate }: { voucher: Voucher, onClose: () => void, onUpdate: () => void }) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'details' | 'history'>('details')
    const barcodeRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchTransactions()
    }, [voucher.id])

    const fetchTransactions = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('voucher_transactions')
            .select('*')
            .eq('voucher_id', voucher.id)
            .order('created_at', { ascending: false })

        if (data) {
            setTransactions(data)
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this voucher? This action cannot be undone.')) return

        const { error } = await supabase
            .from('gift_vouchers')
            .delete()
            .eq('id', voucher.id)

        if (error) {
            alert('Error deleting voucher: ' + error.message)
        } else {
            onUpdate()
        }
    }

    const getDisplayStatus = () => {
        if (voucher.status === 'active' && voucher.expires_on && isPast(new Date(voucher.expires_on))) {
            return 'expired'
        }
        return voucher.status
    }

    const displayStatus = getDisplayStatus()
    const isRedeemable = displayStatus === 'active'

    const handleRedeem = async () => {
        if (!confirm('Are you sure you want to redeem this voucher?')) return

        const { error } = await supabase
            .from('gift_vouchers')
            .update({ status: 'redeemed' })
            .eq('id', voucher.id)

        if (error) {
            alert('Error redeeming voucher: ' + error.message)
        } else {
            // Create redemption transaction
            await supabase.from('voucher_transactions').insert({
                voucher_id: voucher.id,
                amount: voucher.value,
                type: 'redeem',
                description: 'Redeemed manually'
            })
            onUpdate()
        }
    }

    const handleBlockToggle = async () => {
        const newStatus = voucher.status === 'blocked' ? 'active' : 'blocked'
        const action = voucher.status === 'blocked' ? 'unblock' : 'block'

        if (!confirm(`Are you sure you want to ${action} this voucher?`)) return

        const { error } = await supabase
            .from('gift_vouchers')
            .update({ status: newStatus })
            .eq('id', voucher.id)

        if (error) {
            alert(`Error ${action}ing voucher: ` + error.message)
        } else {
            onUpdate()
        }
    }

    const handleDownloadBarcode = () => {
        if (!barcodeRef.current) return

        const svg = barcodeRef.current.querySelector('svg')
        if (!svg) return

        const svgData = new XMLSerializer().serializeToString(svg)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()

        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            if (ctx) {
                ctx.drawImage(img, 0, 0)
                const pngFile = canvas.toDataURL('image/png')
                const downloadLink = document.createElement('a')
                downloadLink.download = `voucher-${voucher.code}.png`
                downloadLink.href = pngFile
                downloadLink.click()
            }
        }

        img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 font-mono">{voucher.code}</h3>
                            <p className="text-xs text-slate-500">Gift Voucher</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'details' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('details')}
                    >
                        Details
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'history' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        Transaction History
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === 'details' ? (
                        <div className="space-y-6">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-500 mb-1">Voucher Value</p>
                                    <p className="text-2xl font-bold text-slate-800">
                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(voucher.value)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-slate-500 mb-1">Donor</p>
                                    <p className="font-medium text-slate-800 capitalize">{voucher.donor_type}</p>
                                    {voucher.donor_name && <p className="text-sm text-slate-600">{voucher.donor_name}</p>}
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-4 py-4 bg-white rounded-xl border border-slate-200">
                                <div ref={barcodeRef}>
                                    <Barcode value={voucher.code} width={2} height={60} fontSize={16} background="transparent" />
                                </div>
                                <button
                                    onClick={handleDownloadBarcode}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                    title="Download Barcode"
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                                    <div className={`px-3 py-2 border rounded-lg font-medium capitalize flex items-center gap-2 ${displayStatus === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                                        displayStatus === 'redeemed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            displayStatus === 'blocked' ? 'bg-red-50 text-red-700 border-red-200' :
                                                'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}>
                                        <div className={`w-2 h-2 rounded-full ${displayStatus === 'active' ? 'bg-green-500' :
                                            displayStatus === 'redeemed' ? 'bg-blue-500' :
                                                displayStatus === 'blocked' ? 'bg-red-500' :
                                                    'bg-slate-500'
                                            }`} />
                                        {displayStatus}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Expires On</label>
                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                                        {voucher.expires_on ? format(new Date(voucher.expires_on), 'dd/MM/yyyy') : 'Never'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Issued On</label>
                                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                                    {format(new Date(voucher.issued_on), 'dd/MM/yyyy HH:mm')}
                                </div>
                            </div>

                            {voucher.notes && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 whitespace-pre-wrap">
                                        {voucher.notes}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition flex items-center gap-2"
                                >
                                    <Trash className="w-4 h-4" /> Delete
                                </button>

                                <div className="flex gap-2">
                                    <button
                                        onClick={handleBlockToggle}
                                        className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${voucher.status === 'blocked'
                                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                            : 'text-slate-600 hover:bg-slate-100'
                                            }`}
                                        title={voucher.status === 'blocked' ? 'Unblock Voucher' : 'Block Voucher'}
                                    >
                                        <Power className={`w-4 h-4 ${voucher.status === 'blocked' ? 'text-red-600' : 'text-slate-400'}`} />
                                        {voucher.status === 'blocked' ? 'Blocked' : 'Block'}
                                    </button>

                                    {isRedeemable && (
                                        <button
                                            onClick={handleRedeem}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                                        >
                                            <CheckCircle className="w-4 h-4" /> Redeem
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    No transactions found.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {transactions.map(tx => (
                                        <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === 'issue' ? 'bg-green-100 text-green-600' :
                                                    tx.type === 'redeem' ? 'bg-orange-100 text-orange-600' :
                                                        'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    <History className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-800 capitalize">{tx.type.replace('_', ' ')}</p>
                                                    <p className="text-xs text-slate-500">{format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-medium ${tx.type === 'redeem' ? 'text-red-600' : 'text-green-600'
                                                    }`}>
                                                    {tx.type === 'redeem' ? '-' : '+'}{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                                                </p>
                                                {tx.description && <p className="text-xs text-slate-400">{tx.description}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
