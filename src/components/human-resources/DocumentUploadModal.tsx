import React, { useState } from 'react'
import { X, UploadCloud, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DocumentCategory } from '@/types/human-resources'

export interface DocumentUploadModalProps {
    open: boolean
    onClose: () => void
    staffId: string
    onSuccess: () => void
}

export default function DocumentUploadModal({ open, onClose, staffId, onSuccess }: DocumentUploadModalProps) {
    const [saving, setSaving] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [documentName, setDocumentName] = useState('')
    const [category, setCategory] = useState<DocumentCategory | ''>('')

    const CATEGORIES: DocumentCategory[] = ['CV', 'ID Card', 'Contract', 'Medical', 'Certification', 'Other']

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0])
            if (!documentName) {
                // Remove extension and set as default name
                setDocumentName(e.target.files[0].name.replace(/\.[^/.]+$/, ""))
            }
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file || !documentName || !category) return

        setSaving(true)
        try {
            // Upload file to storage
            const ext = file.name.split('.').pop()
            const fileName = `${staffId}/${category.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.${ext}`

            const { error: uploadError } = await supabase.storage
                .from('hr_documents')
                .upload(fileName, file)

            if (uploadError) throw uploadError

            const { data: urlData } = supabase.storage
                .from('hr_documents')
                .getPublicUrl(fileName)

            // Insert DB record
            const { error: insertError } = await supabase.from('hr_staff_documents').insert({
                staff_id: staffId,
                document_name: documentName,
                document_category: category,
                file_url: urlData.publicUrl
            })

            if (insertError) throw insertError

            onSuccess()
            onClose()
            
            // Reset state
            setFile(null)
            setDocumentName('')
            setCategory('')
        } catch (err) {
            console.error('Error uploading document:', err)
            alert('Failed to upload document.')
        } finally {
            setSaving(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Upload New Document
                    </h2>
                    <button onClick={onClose} type="button" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Document Category *</label>
                        <select required value={category} onChange={e => setCategory(e.target.value as DocumentCategory)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                            <option value="" disabled>Select category...</option>
                            {CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Document Name *</label>
                        <input type="text" required value={documentName} onChange={e => setDocumentName(e.target.value)}
                            placeholder="e.g. Medical Checkup 2026"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:bg-gray-50 transition cursor-pointer relative">
                            <input type="file" required onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            <div className="space-y-1 text-center">
                                <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                                <div className="flex text-sm text-gray-600 justify-center">
                                    <span className="relative rounded-md font-medium text-blue-600 hover:text-blue-500">
                                        {file ? file.name : "Click to upload or drag and drop"}
                                    </span>
                                </div>
                                {!file && <p className="text-xs text-gray-500">PDF, PNG, JPG, DOCX up to 10MB</p>}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving || !file || !documentName || !category}
                            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow hover:shadow-lg">
                            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            Upload
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
