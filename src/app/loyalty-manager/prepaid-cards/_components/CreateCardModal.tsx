'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { Loader2, X } from 'lucide-react'

type Props = {
    // bonusPercentage prop is preserved for compatibility but not used in 0-balance creation
    bonusPercentage?: number
    onClose: () => void
    onSuccess: () => void
}

export default function CreateCardModal({ onClose, onSuccess }: Props) {
    const [mode, setMode] = useState<'single' | 'bulk'>('single')
    const [loading, setLoading] = useState(false)
    const [currentUser, setCurrentUser] = useState<string>('')

    // Single Mode State
    const [manualId, setManualId] = useState(false)
    const [customId, setCustomId] = useState('')
    const [autoId, setAutoId] = useState('')
    const [expiresOn, setExpiresOn] = useState('')

    // Bulk Mode State
    const [bulkQty, setBulkQty] = useState(10)
    const [bulkExpires, setBulkExpires] = useState('')

    useEffect(() => {
        // Get current user
        const fetchUser = async () => {
            try {
                const localName = localStorage.getItem('user.displayName') || localStorage.getItem('user.name')
                if (localName) {
                    setCurrentUser(localName)
                    return
                }

                const { data: { user } } = await supabase.auth.getUser()
                if (user?.email) {
                    setCurrentUser(user.email.split('@')[0])
                }
            } catch (e) {
                console.error('Error fetching user:', e)
            }
        }
        fetchUser()

        if (!manualId && mode === 'single') {
            generateRandomId().then(id => setAutoId(id))
        }
    }, [manualId, mode])

    const generateRandomId = async (): Promise<string> => {
        // Generate random 12 digit ID starting with 88
        // Metric: 88 + 10 random digits
        const randomPart = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0')
        return `88${randomPart}`
    }

    const handleSingleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const cardId = manualId ? customId : autoId
        if (!cardId) {
            alert('Card ID is required')
            setLoading(false)
            return
        }

        // Insert card
        const { error: cardError } = await supabase
            .from('prepaid_cards')
            .insert({
                card_number: cardId,
                status: 'active',
                issued_on: new Date().toISOString(),
                expires_on: expiresOn ? new Date(expiresOn).toISOString() : null,
                total_purchased: 0,
                bonus_amount: 0,
                balance: 0,
                created_by: currentUser || 'Unknown'
            })

        if (cardError) {
            alert('Error creating card: ' + cardError.message)
            setLoading(false)
            return
        }

        setLoading(false)
        onSuccess()
    }

    const handleBulkSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const rows = []
            // Generate distinct IDs
            // Note: Simplistic approach. Collision probability is low for 10^10 space.
            // For production with millions of cards, we'd need collision checks.
            const generatedIds = new Set<string>()

            while (generatedIds.size < bulkQty) {
                const id = await generateRandomId()
                generatedIds.add(id)
            }

            for (const id of generatedIds) {
                rows.push({
                    card_number: id,
                    status: 'active', // Bulk cards are active immediately, ready to be issued
                    issued_on: new Date().toISOString(),
                    expires_on: bulkExpires ? new Date(bulkExpires).toISOString() : null,
                    total_purchased: 0,
                    bonus_amount: 0,
                    balance: 0,
                    created_by: currentUser || 'Unknown'
                })
            }

            const { error } = await supabase.from('prepaid_cards').insert(rows)

            if (error) {
                throw error
            }

            onSuccess()
        } catch (error: any) {
            alert('Error creating bulk cards: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-slate-800">Create Prepaid Cards</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 shrink-0">
                    <button
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'single' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700 bg-slate-50/50'}`}
                        onClick={() => setMode('single')}
                    >
                        Single Card
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'bulk' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700 bg-slate-50/50'}`}
                        onClick={() => setMode('bulk')}
                    >
                        Bulk Creation
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {mode === 'single' ? (
                        <form onSubmit={handleSingleSubmit} className="space-y-4">
                            {/* Card ID */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-slate-700">Card ID</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">Manual ID</span>
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
                                        onChange={e => setCustomId(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                        placeholder="Enter custom ID"
                                        required
                                    />
                                ) : (
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={autoId}
                                            disabled
                                            className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-mono tracking-wider"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => generateRandomId().then(setId => setAutoId(setId))}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:underline"
                                        >
                                            Regenerate
                                        </button>
                                    </div>
                                )}
                                <p className="text-xs text-slate-500 mt-1">
                                    {manualId ? 'Enter a unique card identifier.' : 'Random 12-digit code (Prefix 88).'}
                                </p>
                            </div>

                            {/* Expiry */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Expires On (Optional)</label>
                                <input
                                    type="date"
                                    value={expiresOn}
                                    onChange={e => setExpiresOn(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            {/* Info */}
                            <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
                                <p>Card balance will be 0 ₫.</p>
                                <p className="mt-1">Customer details can be registered during the first Top Up.</p>
                            </div>

                            {/* Created By */}
                            <div className="text-sm text-slate-500">
                                Created by: <span className="font-medium text-slate-700">{currentUser || 'Unknown'}</span>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Create Card
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleBulkSubmit} className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 mb-4">
                                Use this to generate a batch of physical cards. They will be created as <strong>Active</strong> with 0 balance and no customer assigned.
                            </div>

                            {/* Quantity */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={bulkQty}
                                    onChange={e => setBulkQty(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                                <p className="text-xs text-slate-500 mt-1">Generate between 1 and 1000 cards.</p>
                            </div>

                            {/* Expiry */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Expires On (Optional)</label>
                                <input
                                    type="date"
                                    value={bulkExpires}
                                    onChange={e => setBulkExpires(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                                <p className="text-xs text-slate-500 mt-1">If set, strict date for all cards in this batch.</p>
                            </div>

                            {/* Created By */}
                            <div className="text-sm text-slate-500">
                                Created by: <span className="font-medium text-slate-700">{currentUser || 'Unknown'}</span>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || bulkQty < 1}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Generate {bulkQty} Cards
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
