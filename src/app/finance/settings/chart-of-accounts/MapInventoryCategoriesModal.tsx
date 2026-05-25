'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase_shim'
import type { FinChartOfAccount } from '@/types/finance'
import CircularLoader from '@/components/CircularLoader'
import { COACombobox } from '@/app/finance/components/COACombobox'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'

type MappingModalProps = {
  accounts: FinChartOfAccount[]
  onClose: () => void
}

type CategoryData = {
  id: number
  name: string
}

type MappingRecord = {
  id?: string
  category_id?: number | null
  recipe_type?: string | null
  account_id: string | null
}

export default function MapInventoryCategoriesModal({ accounts, onClose }: MappingModalProps) {
  const { language } = useSettings()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [recipeTypes, setRecipeTypes] = useState<string[]>([])
  const [mappings, setMappings] = useState<MappingRecord[]>([])
  const [activeTab, setActiveTab] = useState<'materials' | 'recipes'>('materials')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch categories
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .order('name')
        
      if (catError) throw catError
      setCategories(catData || [])

      // Fetch unique recipe types
      const { data: prepData } = await supabase.from('prep_recipes').select('type')
      const { data: finalData } = await supabase.from('final_recipes').select('type')
      
      const rTypes = new Set<string>()
      prepData?.forEach(r => r.type && rTypes.add(r.type))
      finalData?.forEach(r => r.type && rTypes.add(r.type))
      setRecipeTypes(Array.from(rTypes).sort())

      // Fetch existing mappings
      const { data: mappingData, error: mappingError } = await supabase
        .from('fin_inventory_category_mapping')
        .select('*')
        
      if (mappingError) throw mappingError
      
      setMappings(mappingData || [])
    } catch (err: any) {
      alert((language === 'vi' ? 'Lỗi khi tải dữ liệu: ' : 'Error fetching data: ') + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryMappingChange = (categoryId: number, accountId: string | null) => {
    setMappings(prev => {
      const existingIdx = prev.findIndex(m => m.category_id === categoryId)
      if (existingIdx >= 0) {
        const next = [...prev]
        next[existingIdx] = { ...next[existingIdx], account_id: accountId }
        return next
      } else {
        return [...prev, { category_id: categoryId, recipe_type: null, account_id: accountId }]
      }
    })
  }

  const handleRecipeMappingChange = (recipeType: string, accountId: string | null) => {
    setMappings(prev => {
      const existingIdx = prev.findIndex(m => m.recipe_type === recipeType)
      if (existingIdx >= 0) {
        const next = [...prev]
        next[existingIdx] = { ...next[existingIdx], account_id: accountId }
        return next
      } else {
        return [...prev, { category_id: null, recipe_type: recipeType, account_id: accountId }]
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Prepare payload - only save records that have an account selected
      const payload = mappings.filter(m => m.account_id).map(m => ({
        id: m.id,
        category_id: m.category_id || null,
        recipe_type: m.recipe_type || null,
        account_id: m.account_id
      }))

      // To simplify, we delete all existing mappings and insert the new ones
      const { error: delError } = await supabase.from('fin_inventory_category_mapping').delete().neq('account_id', '00000000-0000-0000-0000-000000000000') // delete all hack
      if (delError) throw delError

      if (payload.length > 0) {
        // Strip out existing ids so they get regenerated
        const newPayload = payload.map(p => ({
          category_id: p.category_id,
          recipe_type: p.recipe_type,
          account_id: p.account_id
        }))
        const { error: insError } = await supabase.from('fin_inventory_category_mapping').insert(newPayload)
        if (insError) throw insError
      }

      onClose()
    } catch (err: any) {
      alert((language === 'vi' ? 'Lỗi khi lưu ánh xạ: ' : 'Error saving mappings: ') + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Filter accounts for the dropdown to only COGS or relevant expense accounts (but let user choose from any)
  const cogsAccounts = useMemo(() => {
    return accounts.filter(a => a.account_type === 'Cost of Goods Sold' && a.is_active && !a.is_group)
  }, [accounts])

  const allActiveAccounts = useMemo(() => {
    return accounts.filter(a => a.is_active && !a.is_group)
  }, [accounts])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t(language, 'MapInventoryCategories')}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'vi' 
                ? 'Liên kết các mặt hàng kho và công thức nấu ăn của bạn với các tài khoản Giá vốn hàng bán P&L tương ứng.' 
                : 'Link your stock items and recipes to the correct P&L Cost of Goods accounts.'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center"><CircularLoader /></div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex border-b border-slate-200 px-6 shrink-0">
              <button
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'materials' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setActiveTab('materials')}
              >
                {t(language, 'Materials')}
              </button>
              <button
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'recipes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setActiveTab('recipes')}
              >
                {t(language, 'Recipes')}
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {activeTab === 'materials' && (
                <div className="space-y-4">
                  {categories.map(cat => {
                    const currentMapping = mappings.find(m => m.category_id === cat.id)
                    return (
                      <div key={cat.id} className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="w-1/3">
                          <span className="font-semibold text-slate-700 text-sm">{cat.name}</span>
                        </div>
                        <div className="flex-1">
                          <COACombobox
                            coas={allActiveAccounts}
                            value={currentMapping?.account_id || ''}
                            onChange={(val) => handleCategoryMappingChange(cat.id, val || null)}
                            placeholder={language === 'vi' ? 'Chọn tài khoản kế toán...' : 'Select Chart of Account...'}
                          />
                        </div>
                        <div className="w-8 flex justify-center">
                          {currentMapping?.account_id && <CheckIcon className="w-5 h-5 text-emerald-500" />}
                        </div>
                      </div>
                    )
                  })}
                  {categories.length === 0 && (
                    <div className="text-center p-8 text-slate-500 text-sm">
                      {language === 'vi' ? 'Không tìm thấy danh mục nguyên vật liệu nào.' : 'No material categories found.'}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'recipes' && (
                <div className="space-y-4">
                  {recipeTypes.map(type => {
                    const currentMapping = mappings.find(m => m.recipe_type === type)
                    return (
                      <div key={type} className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="w-1/3">
                          <span className="font-semibold text-slate-700 text-sm capitalize">{type}</span>
                        </div>
                        <div className="flex-1">
                          <COACombobox
                            coas={allActiveAccounts}
                            value={currentMapping?.account_id || ''}
                            onChange={(val) => handleRecipeMappingChange(type, val || null)}
                            placeholder={language === 'vi' ? 'Chọn tài khoản kế toán...' : 'Select Chart of Account...'}
                          />
                        </div>
                        <div className="w-8 flex justify-center">
                          {currentMapping?.account_id && <CheckIcon className="w-5 h-5 text-emerald-500" />}
                        </div>
                      </div>
                    )
                  })}
                  {recipeTypes.length === 0 && (
                    <div className="text-center p-8 text-slate-500 text-sm">
                      {language === 'vi' ? 'Không tìm thấy loại công thức nào.' : 'No recipe types found.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition"
          >
            {t(language, 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (language === 'vi' ? 'Lưu ánh xạ' : 'Save Mappings')}
          </button>
        </div>
      </div>
    </div>
  )
}
