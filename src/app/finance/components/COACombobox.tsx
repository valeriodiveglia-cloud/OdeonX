import React, { useState, Fragment } from 'react'
import { Combobox, Transition } from '@headlessui/react'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { FinChartOfAccount } from '@/types/finance'
import { useSettings } from '@/contexts/SettingsContext'
import { t } from '@/lib/i18n'
interface COAComboboxProps {
    coas: FinChartOfAccount[]
    value: string | null
    onChange: (id: string) => void
    placeholder?: string
    disabled?: boolean
}

export function COACombobox({ coas, value, onChange, placeholder, disabled }: COAComboboxProps) {
    const { language } = useSettings()
    const [query, setQuery] = useState('')

    const filteredCoas = query === ''
        ? coas
        : coas.filter((coa) => {
            const searchStr = `${coa.code} ${coa.name}`.toLowerCase()
            return searchStr.includes(query.toLowerCase())
        })

    const selectedCoa = coas.find(c => c.id === value) || null

    const defaultPlaceholder = language === 'vi' ? 'Chọn danh mục...' : 'Select category...'
    const finalPlaceholder = placeholder || defaultPlaceholder

    return (
        <Combobox value={selectedCoa} onChange={(c: FinChartOfAccount | null) => { if (c) onChange(c.id) }} disabled={disabled} onClose={() => setQuery('')}>
            <div className="relative w-full">
                <div className={`relative w-full cursor-default overflow-hidden rounded-xl text-left shadow-sm border ${
                    disabled 
                        ? 'bg-slate-100 border-slate-200 opacity-75 cursor-not-allowed' 
                        : 'bg-white border-slate-200 focus-within:ring-2 focus-within:ring-blue-500'
                }`}>
                    <Combobox.Input
                        className="w-full border-none py-2.5 pl-3 pr-10 text-sm leading-5 text-slate-900 focus:outline-none focus:ring-0 bg-transparent"
                        displayValue={(c: FinChartOfAccount | null) => c ? `${c.code} - ${language === 'vi' && c.simplified_name ? c.simplified_name.trim() : c.name}` : ''}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={finalPlaceholder}
                        disabled={disabled}
                        autoComplete="off"
                        name="coa_prevent_autofill"
                        data-lpignore="true"
                    />
                    <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2" disabled={disabled}>
                        <ChevronsUpDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </Combobox.Button>
                </div>
                <Combobox.Options
                    anchor="bottom start"
                    transition
                    className="mt-1 max-h-60 w-[var(--input-width)] overflow-auto rounded-xl bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-[100] transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
                >
                    {filteredCoas.length === 0 && query !== '' ? (
                        <div className="relative cursor-default select-none px-4 py-2 text-gray-700">
                            {language === 'vi' ? 'Không tìm thấy kết quả.' : 'Nothing found.'}
                        </div>
                    ) : (
                        filteredCoas.map((coa) => (
                            <Combobox.Option
                                key={coa.id}
                                className={({ active }) =>
                                    `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-blue-600 text-white' : 'text-gray-900'}`
                                }
                                value={coa}
                            >
                                {({ selected, active }) => (
                                    <>
                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                            {coa.code} - {language === 'vi' && coa.simplified_name ? coa.simplified_name.trim() : coa.name}
                                        </span>
                                        {selected ? (
                                            <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-blue-600'}`}>
                                                <Check className="h-4 w-4" aria-hidden="true" />
                                            </span>
                                        ) : null}
                                    </>
                                )}
                            </Combobox.Option>
                        ))
                    )}
                </Combobox.Options>
            </div>
        </Combobox>
    )
}
