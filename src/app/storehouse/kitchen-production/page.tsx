'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { supabase } from '@/lib/supabase_shim'
import { PlusIcon, EyeIcon, ChevronRightIcon, ArrowLeftIcon, BuildingOffice2Icon, MapPinIcon, XMarkIcon, CalculatorIcon, BookOpenIcon, Square3Stack3DIcon, InboxIcon, SparklesIcon, ChatBubbleOvalLeftEllipsisIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import CircularLoader from '@/components/CircularLoader'
import { t } from '@/lib/i18n'
import { useSettings } from '@/contexts/SettingsContext'
import ColumnHeader from '@/components/storehouse/ColumnHeader'
import Button from '@/components/Button'
import { useSearchParams } from 'next/navigation'

interface Production {
  id: string
  location_name: string
  prep_name: string
  qty_produced: number
  uom: string
  created_at: string
  created_by_name: string | null
  consumptions?: ConsumptionDetail[]
  expected_input?: number
  actual_input?: number
  expected_output?: number
  actual_output?: number
  standard_wastage?: number
  actual_wastage?: number
  wastage_variance?: number
  expected_yield_pct?: number
  actual_yield_pct?: number
  standard_wastage_pct?: number
  actual_wastage_pct?: number
  yield_variance?: number
  notes?: string
}

interface ConsumptionDetail {
  item_name: string
  item_type: 'material' | 'prep'
  qty_consumed: number
  uom: string
}

interface Location {
  id: string
  name: string
  type?: string
  branch_id?: string
  provider_branches?: {
    address?: string
    city?: string
  } | {
    address?: string
    city?: string
  }[] | null
}

interface PrepRecipe {
  id: string
  name: string
  yield_qty: number
  waste_pct: number | null
  uom_id: string
  uom_name: string
  cost_per_unit_vnd: number
  category_name: string
}

const formatLiveNumber = (val: string): string => {
  let clean = val.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('')
  }
  if (clean.includes('.')) {
    const [integerPart, decimalPart] = clean.split('.')
    const integerNum = parseInt(integerPart, 10)
    const formattedInteger = isNaN(integerNum) ? '' : integerNum.toLocaleString('en-US')
    return formattedInteger + '.' + decimalPart
  } else {
    const num = parseInt(clean, 10)
    return isNaN(num) ? '' : num.toLocaleString('en-US')
  }
}

const cleanFormattedNumber = (val: string): number => {
  if (!val) return 0
  const clean = val.replace(/,/g, '')
  return Number(clean) || 0
}

function KitchenProductionContent() {
  const { language } = useSettings()
  const searchParams = useSearchParams()
  const branchId = searchParams.get('branchId') || 'all'
  const [locations, setLocations] = useState<Location[]>([])
  const [prepRecipes, setPrepRecipes] = useState<PrepRecipe[]>([])
  const [recipeItems, setRecipeItems] = useState<any[]>([])
  const [productions, setProductions] = useState<Production[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<'location' | 'form'>('location')
  const [cityFilter, setCityFilter] = useState('')
  const [selectedLocId, setSelectedLocId] = useState('')
  const [selectedPrepId, setSelectedPrepId] = useState('')
  const [batchesCount, setBatchesCount] = useState('1')
  const [actualInput, setActualInput] = useState('')
  const [actualOutput, setActualOutput] = useState('')
  const [prodNotes, setProdNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Helper per ricavare l'Expected Input complessivo sommando gli ingredienti
  const getExpectedInputForRecipe = (prepId: string, batches: number, recipeUom: string) => {
    const ingredients = recipeItems.filter(x => x.prep_id === prepId)
    let totalInput = 0
    const recUomLower = recipeUom.toLowerCase().trim()
    ingredients.forEach(ing => {
      const qty = Number(ing.qty || 0)
      const ingUomLower = (ing.uom || 'gr').toLowerCase().trim()
      
      if ((recUomLower === 'kg' || recUomLower === 'l' || recUomLower === 'litre') && 
          (ingUomLower === 'gr' || ingUomLower === 'g' || ingUomLower === 'ml')) {
        totalInput += qty / 1000
      } else if ((recUomLower === 'gr' || recUomLower === 'g' || recUomLower === 'ml') && 
                 (ingUomLower === 'kg' || ingUomLower === 'l' || ingUomLower === 'litre')) {
        totalInput += qty * 1000
      } else {
        totalInput += qty
      }
    })
    return totalInput * batches
  }

  const selectedPrepRecipe = useMemo(() => {
    return prepRecipes.find(x => x.id === selectedPrepId)
  }, [selectedPrepId, prepRecipes])

  // Calcoli wastage e yield in tempo reale
  const batches = Number(batchesCount) || 1
  const expInput = selectedPrepRecipe ? getExpectedInputForRecipe(selectedPrepId, batches, selectedPrepRecipe.uom_name) : 0
  const expOutput = selectedPrepRecipe ? selectedPrepRecipe.yield_qty * batches : 0

  const stdWastagePct = selectedPrepRecipe 
    ? (selectedPrepRecipe.waste_pct !== null ? selectedPrepRecipe.waste_pct : (expInput > 0 ? ((expInput - expOutput) / expInput * 100) : 0))
    : 0
  const stdWastageVal = expInput * stdWastagePct / 100
  const expYieldPct = selectedPrepRecipe && selectedPrepRecipe.waste_pct !== null
    ? (100 - selectedPrepRecipe.waste_pct)
    : (expInput > 0 ? (expOutput / expInput * 100) : 100)

  const actInput = actualInput !== '' ? cleanFormattedNumber(actualInput) : expInput
  const actOutput = actualOutput !== '' ? cleanFormattedNumber(actualOutput) : 0
  
  const actWastageVal = actInput - actOutput
  const actWastagePct = actInput > 0 ? (actWastageVal / actInput * 100) : 0
  const actYieldPct = actInput > 0 ? (actOutput / actInput * 100) : 0

  const wastageVariance = actWastagePct - stdWastagePct
  const yieldVariance = actYieldPct - expYieldPct

  const handleBatchesChange = (val: string) => {
    setBatchesCount(val)
    const b = Number(val) || 0
    if (b > 0 && selectedPrepRecipe) {
      const expIn = getExpectedInputForRecipe(selectedPrepId, b, selectedPrepRecipe.uom_name)
      setActualInput(formatLiveNumber(String(Math.round(expIn))))
    }
  }

  // Effetto per allineare l'input reale solo al cambio di ricetta
  useEffect(() => {
    if (selectedPrepRecipe) {
      const expIn = getExpectedInputForRecipe(selectedPrepId, 1, selectedPrepRecipe.uom_name)
      setActualInput(formatLiveNumber(String(Math.round(expIn))))
      setActualOutput('')
      setBatchesCount('1')
    } else {
      setActualInput('')
      setActualOutput('')
      setBatchesCount('1')
    }
  }, [selectedPrepId])

  // View Details Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [viewingProd, setViewingProd] = useState<Production | null>(null)

  // Table Sort and Filter
  const [sortCol, setSortCol] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [openHeaderKey, setOpenHeaderKey] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({})

  // Permessi
  const isChefOrManager = useMemo(() => {
    return role && ['owner', 'admin', 'manager', 'accountant', 'chef'].includes(role)
  }, [role])

  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true)
        const { data: userRes } = await supabase.auth.getUser()
        if (userRes?.user) {
          setUserId(userRes.user.id)
          const { data: acc } = await supabase
            .from('app_accounts')
            .select('role')
            .eq('user_id', userRes.user.id)
            .single()
          setRole(acc?.role || 'staff')
        }

        // Carica locations
        let locQuery = supabase
          .from('storehouse_locations')
          .select('id, name, type, branch_id, provider_branches(address, city)')
          .eq('is_active', true)
          .order('name')
        if (branchId && branchId !== 'all') {
          locQuery = locQuery.eq('branch_id', branchId)
        }
        const { data: locs } = await locQuery
        setLocations(locs || [])
        if (locs && locs.length > 0) {
          setSelectedLocId(locs[0].id)
        }

        // Carica ricette dal costing e i loro ingredienti diretti
        const [prepsRes, itemsRes] = await Promise.all([
          supabase
            .from('prep_recipes')
            .select('id, name, yield_qty, waste_pct, cost_per_unit_vnd, uom(name), recipe_categories(name)')
            .is('deleted_at', null)
            .order('name'),
          supabase
            .from('prep_recipe_items')
            .select('id, prep_id, ref_type, ref_id, name, qty, uom')
        ])

        const preps = prepsRes.data || []
        const items = itemsRes.data || []

        setPrepRecipes(
          preps.map((p: any) => ({
            id: p.id,
            name: p.name,
            yield_qty: Number(p.yield_qty || 1),
            waste_pct: p.waste_pct !== null && p.waste_pct !== undefined ? Number(p.waste_pct) : null,
            uom_id: p.uom_id || '',
            uom_name: p.uom?.name || 'gr',
            cost_per_unit_vnd: Number(p.cost_per_unit_vnd || 0),
            category_name: p.recipe_categories?.name || '-',
          }))
        )
        setRecipeItems(items)

        await loadProductions(locs || [])
      } catch (err) {
        console.error('Error loading production initial data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitial()
  }, [])

  const loadProductions = async (currentLocs?: Location[]) => {
    try {
      const { data, error } = await supabase
        .from('storehouse_kitchen_productions')
        .select(`
          *,
          storehouse_locations(name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      let rows = data || []
      const locList = currentLocs || locations
      if (branchId && branchId !== 'all') {
        const allowedLocIds = locList.map(l => l.id)
        rows = rows.filter(r => allowedLocIds.includes(r.location_id))
      }

      const { data: accounts } = await supabase.from('app_accounts').select('user_id, name')
      const userMap: Record<string, string> = {}
      ;(accounts || []).forEach(a => {
        if (a.user_id) userMap[a.user_id] = a.name || ''
      })

      // Fetch all consumption records in parallel
      const { data: consData } = await supabase
        .from('storehouse_movements')
        .select('notes, item_id, item_type, qty_base, uom_base')
        .eq('movement_type', 'production_consumption')

      const consMap: Record<string, ConsumptionDetail[]> = {}
      ;(consData || []).forEach((c: any) => {
        // Troviamo il production_id dalle note del movimento (che abbiamo salvato in fase di salvataggio)
        if (c.notes && c.notes.startsWith('PROD-')) {
          const prodId = c.notes.replace('PROD-', '')
          if (!consMap[prodId]) consMap[prodId] = []
          consMap[prodId].push({
            item_name: '', // Verrà mappato sotto
            item_type: c.item_type,
            qty_consumed: Math.abs(Number(c.qty_base)),
            uom: c.uom_base
          })
        }
      })

      // Carichiamo le anagrafiche del Costing per i nomi dei consumi
      const [matsRes, prepsRes] = await Promise.all([
        supabase.from('materials').select('id, name, brand'),
        supabase.from('prep_recipes').select('id, name')
      ])
      const matsList = matsRes.data || []
      const prepsList = prepsRes.data || []

      const formatted: Production[] = (rows || []).map((p: any) => {
        const prep = prepRecipes.find(x => x.id === p.prep_id)
        
        // Mappa i consumi
        const details = consMap[p.id] || []
        const mappedDetails = details.map(d => {
          let name = ''
          if (d.item_type === 'material') {
            const m = matsList.find((x: any) => x.id === p.prep_id) // oppure l'id specifico
            // Cerchiamo l'id effettivo nel d
            const actualM = matsList.find((x: any) => x.id === x.id) // mappiamo usando d.item_name
          }
          // Per semplicità popoliamo il nome logico al volo
          const costingMatch = [...matsList, ...prepsList].find((x: any) => x.name === x.name) // fallback
          return d
        })

        return {
          id: p.id,
          location_name: p.storehouse_locations?.name || '-',
          prep_name: prep ? prep.name : `ID: ${p.prep_id.slice(0, 8)}`,
          qty_produced: Number(p.qty_produced),
          uom: prep ? prep.uom_name : 'gr',
          created_at: p.created_at,
          created_by_name: userMap[p.created_by] || p.created_by || '-',
          consumptions: p.consumptions_metadata ? (p.consumptions_metadata as ConsumptionDetail[]) : [],
          expected_input: p.expected_input ? Number(p.expected_input) : undefined,
          actual_input: p.actual_input ? Number(p.actual_input) : undefined,
          expected_output: p.expected_output ? Number(p.expected_output) : undefined,
          actual_output: p.actual_output ? Number(p.actual_output) : undefined,
          standard_wastage: p.standard_wastage ? Number(p.standard_wastage) : undefined,
          actual_wastage: p.actual_wastage ? Number(p.actual_wastage) : undefined,
          wastage_variance: p.wastage_variance ? Number(p.wastage_variance) : undefined,
          expected_yield_pct: p.expected_yield_pct ? Number(p.expected_yield_pct) : undefined,
          actual_yield_pct: p.actual_yield_pct ? Number(p.actual_yield_pct) : undefined,
          standard_wastage_pct: p.standard_wastage_pct ? Number(p.standard_wastage_pct) : undefined,
          actual_wastage_pct: p.actual_wastage_pct ? Number(p.actual_wastage_pct) : undefined,
          yield_variance: p.yield_variance ? Number(p.yield_variance) : undefined,
          notes: p.notes || ''
        }
      })

      setProductions(formatted)
    } catch (err) {
      console.error('Error loading production list:', err)
    }
  }

  // ALGORITMO DI ESPLOSIONE RICORSIVA (EXPLODE RECIPES)
  // Per ricavare tutti i consumi reali e prelevare materiali base
  const calculateConsumptionRecursive = async (
    prepId: string,
    targetQty: number,
    inventorySetup: any[],
    matsList: any[],
    prepsList: any[]
  ): Promise<Array<{ id: string; type: 'material' | 'prep'; qty: number; uom: string; name: string }>> => {
    const results: Array<{ id: string; type: 'material' | 'prep'; qty: number; uom: string; name: string }> = []
    
    const explode = async (currentPrepId: string, currentQty: number) => {
      // 1. Recupera gli ingredienti della ricetta corrente
      const { data: ingredients } = await supabase
        .from('prep_recipe_ingredients')
        .select('ingredient_id, ingredient_type, qty, unit_cost')
        .eq('prep_recipe_id', currentPrepId)

      if (!ingredients) return

      const prepInfo = prepsList.find(x => x.id === currentPrepId)
      const yieldQty = prepInfo ? Number(prepInfo.yield_qty || 1) : 1
      const multiplier = currentQty / yieldQty

      for (const ing of ingredients) {
        const neededQty = Number(ing.qty) * multiplier

        if (ing.ingredient_type === 'material') {
          const matInfo = matsList.find(x => x.id === ing.ingredient_id)
          results.push({
            id: ing.ingredient_id,
            type: 'material',
            qty: neededQty,
            uom: matInfo ? matInfo.uom?.name : 'unit',
            name: matInfo ? matInfo.name : 'Material'
          })
        } else if (ing.ingredient_type === 'prep') {
          // Controlla se la Prep intermedia ha il tracciamento attivo in questa location
          const setup = inventorySetup.find(
            s => s.location_id === selectedLocId && s.item_type === 'prep' && s.item_id === ing.ingredient_id
          )
          
          if (setup && setup.track_inventory) {
            // Se è tracciata in questa location, consumiamo direttamente la Prep finita
            const subPrep = prepsList.find(x => x.id === ing.ingredient_id)
            results.push({
              id: ing.ingredient_id,
              type: 'prep',
              qty: neededQty,
              uom: subPrep ? subPrep.uom?.name : 'gr',
              name: subPrep ? subPrep.name : 'Sub Prep'
            })
          } else {
            // Se non è tracciata, scendiamo ricorsivamente ad esploderla
            await explode(ing.ingredient_id, neededQty)
          }
        }
      }
    }

    await explode(prepId, targetQty)
    return results
  }

  const handleCreateProduction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !selectedLocId || !selectedPrepId || !selectedPrepRecipe) return
    setErrorMsg('')

    if (batches <= 0) {
      setErrorMsg(language === 'vi' ? 'Vui lòng nhập số mẻ sản xuất hợp lệ' : 'Please enter a valid batches count')
      return
    }

    try {
      setLoading(true)

      // Carichiamo anagrafica e setup per l'algoritmo di esplosione
      const [setupRes, matsRes, prepsRes] = await Promise.all([
        supabase.from('storehouse_inventory_setup').select('*'),
        supabase.from('materials').select('id, name, uom(name)'),
        supabase.from('prep_recipes').select('id, name, yield_qty, uom(name)')
      ])

      // Calcoliamo la BOM teorica basandoci sui batches inseriti (Expected Output)
      const consumptions = await calculateConsumptionRecursive(
        selectedPrepId,
        expOutput,
        setupRes.data || [],
        matsRes.data || [],
        prepsRes.data || []
      )

      // Fattore di scala del consumo reale rispetto al teorico
      const scaleFactor = expInput > 0 ? (actInput / expInput) : 1

      // Costruiamo i metadati dei consumi da salvare per lo storico
      const consumptionsMetadata: any[] = consumptions.map(c => ({
        item_name: c.name,
        item_type: c.type,
        qty_consumed: c.qty * scaleFactor, // Consumo reale
        qty_theory: c.qty, // Consumo teorico
        uom: c.uom
      }))

      // 1. Inserisci la produzione in storehouse_kitchen_productions
      const { data: prodData, error: prodErr } = await supabase
        .from('storehouse_kitchen_productions')
        .insert([{
          location_id: selectedLocId,
          prep_id: selectedPrepId,
          qty_planned: expOutput, // atteso
          qty_produced: actOutput, // reale
          batches_count: batches,
          expected_input: expInput,
          actual_input: actInput,
          expected_output: expOutput,
          actual_output: actOutput,
          standard_wastage: stdWastageVal,
          actual_wastage: actWastageVal,
          wastage_variance: wastageVariance,
          expected_yield_pct: expYieldPct,
          actual_yield_pct: actYieldPct,
          standard_wastage_pct: stdWastagePct,
          actual_wastage_pct: actWastagePct,
          yield_variance: yieldVariance,
          notes: prodNotes,
          consumptions_metadata: consumptionsMetadata,
          created_by: userId,
          created_at: new Date().toISOString()
        }])
        .select()

      if (prodErr) throw prodErr
      const newProd = prodData?.[0]
      if (!newProd) throw new Error('Failed to create production record')

      // Registrazione transazionale con ROLLBACK in caso di fallimento dei movimenti secondari
      const insertedMovements: string[] = []
      
      try {
        // 2. Inserisci movimento di OUTPUT positivo per la Prep creata (Actual Output)
        const { data: outMov, error: outErr } = await supabase
          .from('storehouse_movements')
          .insert([{
            location_id: selectedLocId,
            item_type: 'prep',
            item_id: selectedPrepId,
            movement_type: 'production_output',
            qty_entered: actOutput,
            unit_entered: selectedPrepRecipe.uom_name,
            qty_base: actOutput,
            uom_base: selectedPrepRecipe.uom_name,
            unit_cost: selectedPrepRecipe.cost_per_unit_vnd,
            total_value: actOutput * selectedPrepRecipe.cost_per_unit_vnd,
            reason: `Kitchen Production: ${selectedPrepRecipe.name}`,
            notes: `PROD-${newProd.id}`,
            created_by: userId,
            created_at: new Date().toISOString()
          }])
          .select()

        if (outErr) throw outErr
        if (outMov?.[0]) insertedMovements.push(outMov[0].id)

        // 3. Inserisci i movimenti di CONSUMO (negativi) reali per tutti gli ingredienti
        for (const c of consumptions) {
          const realQty = c.qty * scaleFactor
          const { data: consMov, error: consErr } = await supabase
            .from('storehouse_movements')
            .insert([{
              location_id: selectedLocId,
              item_type: c.type,
              item_id: c.id,
              movement_type: 'production_consumption',
              qty_entered: realQty,
              unit_entered: c.uom,
              qty_base: -realQty, // Quantità negativa per scaricare lo stock reale
              uom_base: c.uom,
              unit_cost: 0,
              total_value: 0,
              reason: `Consumed in production: ${selectedPrepRecipe.name}`,
              notes: `PROD-${newProd.id}`,
              created_by: userId,
              created_at: new Date().toISOString()
            }])
            .select()

          if (consErr) throw consErr
          if (consMov?.[0]) insertedMovements.push(consMov[0].id)
        }

      } catch (movErr) {
        // ROLLBACK CLIENT-SIDE (Regola 3): Rimuovi i movimenti e la produzione inserita
        console.warn('Production sub-query failed, starting rollback...', movErr)
        
        if (insertedMovements.length > 0) {
          await supabase.from('storehouse_movements').delete().in('id', insertedMovements)
        }
        await supabase.from('storehouse_kitchen_productions').delete().eq('id', newProd.id)
        throw movErr
      }

      setIsModalOpen(false)
      setBatchesCount('1')
      setActualInput('')
      setActualOutput('')
      setProdNotes('')
      await loadProductions()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving kitchen production')
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (col: string, asc: boolean) => {
    setSortCol(col)
    setSortAsc(asc)
  }

  const handleFilterChange = (col: string, selected: Set<string> | null) => {
    setFilters(prev => ({ ...prev, [col]: selected }))
  }

  // Filtraggio e Ordinamento della tabella
  const filteredProductions = useMemo(() => {
    let result = [...productions]

    // Applica filtri
    Object.entries(filters).forEach(([col, set]) => {
      if (!set) return
      result = result.filter(item => {
        let val = ''
        if (col === 'location') val = item.location_name
        else if (col === 'prep_name') val = item.prep_name
        return set.has(val)
      })
    })

    // Ordina
    result.sort((a, b) => {
      let valA: any = a[sortCol as keyof Production] ?? ''
      let valB: any = b[sortCol as keyof Production] ?? ''

      if (sortCol === 'qty_produced') {
        valA = a.qty_produced
        valB = b.qty_produced
      } else if (sortCol === 'created_at') {
        valA = new Date(a.created_at).getTime()
        valB = new Date(b.created_at).getTime()
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1)
    })

    return result
  }, [productions, filters, sortCol, sortAsc])

  // Valori unici per i filtri delle colonne
  const locationValues = useMemo(() => Array.from(new Set(productions.map(p => p.location_name))), [productions])
  const prepValues = useMemo(() => Array.from(new Set(productions.map(p => p.prep_name))), [productions])

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(
      d.getHours()
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const dict = {
    sortAsc: language === 'vi' ? 'Sắp xếp tăng dần' : 'Sort Ascending',
    sortDesc: language === 'vi' ? 'Sắp xếp giảm dần' : 'Sort Descending',
    selectAll: language === 'vi' ? 'Chọn tất cả' : 'Select All',
    deselectAll: language === 'vi' ? 'Bỏ chọn tất cả' : 'Clear Selection',
    filterPlaceholder: language === 'vi' ? 'Tìm kiếm...' : 'Search...',
    clearFilters: language === 'vi' ? 'Xóa bộ lọc' : 'Clear Filters',
  }

  if (loading && productions.length === 0) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <CircularLoader />
      </div>
    )
  }

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header e Bottone Aggiungi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t(language, 'KitchenProduction')}</h1>
          <p className="text-sm text-slate-400">
            {language === 'vi'
              ? 'Nhật ký chế biến và sản xuất bán thành phẩm / Prep recipes'
              : 'Production log of semi-finished prep recipes'}
          </p>
        </div>
        {isChefOrManager && (
          <Button
            variant="primary"
            size="lg"
            icon={PlusIcon}
            onClick={() => {
              setModalStep('location')
              setIsModalOpen(true)
            }}
          >
            {language === 'vi' ? 'Báo cáo Chế biến' : 'Log Production'}
          </Button>
        )}
      </div>

      {/* Tabella Produzioni: Sfondo Bianco e Testo Chiaro/Scuro coerente */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-3 overflow-hidden text-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-slate-550 font-semibold">
                <ColumnHeader
                  colKey="location"
                  label={language === 'vi' ? 'Nhà bếp/Cửa hàng' : 'Kitchen/Branch'}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  values={locationValues}
                  activeFilter={filters['location'] || null}
                  onFilter={vals => handleFilterChange('location', vals)}
                  onClear={() => handleFilterChange('location', null)}
                  open={openHeaderKey === 'location'}
                  onToggle={() => setOpenHeaderKey(openHeaderKey === 'location' ? null : 'location')}
                  onClose={() => setOpenHeaderKey(null)}
                  dict={dict}
                  className="hover:bg-gray-150 text-slate-550 font-bold"
                />
                <ColumnHeader
                  colKey="prep_name"
                  label={language === 'vi' ? 'Sản phẩm chế biến' : 'Produced Prep'}
                  sortCol={sortCol}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  values={prepValues}
                  activeFilter={filters['prep_name'] || null}
                  onFilter={vals => handleFilterChange('prep_name', vals)}
                  onClear={() => handleFilterChange('prep_name', null)}
                  open={openHeaderKey === 'prep_name'}
                  onToggle={() => setOpenHeaderKey(openHeaderKey === 'prep_name' ? null : 'prep_name')}
                  onClose={() => setOpenHeaderKey(null)}
                  dict={dict}
                  className="hover:bg-gray-150 text-slate-550 font-bold"
                />
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">
                  {language === 'vi' ? 'SL Chế biến' : 'Qty Produced'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  {language === 'vi' ? 'Nguyên liệu tiêu thụ' : 'Ingredients Consumed'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Thời gian' : 'Timestamp'}
                </th>
                <th className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'vi' ? 'Đầu bếp' : 'Logged By'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProductions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 text-xs italic font-semibold">
                    {language === 'vi' ? 'Chưa ghi nhận đợt sản xuất nào' : 'No productions logged'}
                  </td>
                </tr>
              ) : (
                filteredProductions.map((p, idx) => (
                  <tr key={p.id + idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-semibold text-gray-700">{p.location_name}</td>
                    <td className="p-3 font-semibold text-gray-900">{p.prep_name}</td>
                    <td className="p-3 font-bold text-right text-gray-800">
                      {p.qty_produced.toLocaleString()} <span className="text-xs font-normal text-slate-500">{p.uom}</span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setViewingProd(p)
                          setIsViewModalOpen(true)
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <EyeIcon className="w-4 h-4" />
                        {language === 'vi' ? 'Xem chi tiết' : 'View ingredients'} ({p.consumptions?.length || 0})
                      </button>
                    </td>
                    <td className="p-3 text-xs text-gray-600">{formatDateTime(p.created_at)}</td>
                    <td className="p-3 text-gray-650">{p.created_by_name || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Aggiungi Produzione */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-slate-50 rounded-3xl w-full max-w-3xl overflow-hidden border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            {modalStep === 'location' ? (
              <>
                <div className="p-6 border-b border-slate-200/60 flex items-center justify-between text-gray-900 bg-white shrink-0">
                  <div className="text-base font-extrabold text-slate-900 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                      <BuildingOffice2Icon className="h-5 w-5" />
                    </div>
                    <span>
                      {language === 'vi' ? 'Chọn Địa Điểm Chế Biến' : 'Select Production Location'}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-655 hover:bg-slate-200/65 transition cursor-pointer focus:outline-none flex items-center justify-center"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="p-6 space-y-4 text-gray-900 overflow-y-auto flex-1">
                  {(() => {
                    const getBranchDetails = (l: Location) => {
                      if (!l.provider_branches) return null
                      if (Array.isArray(l.provider_branches)) {
                        return l.provider_branches[0] || null
                      }
                      return l.provider_branches
                    }
                    const uniqueCities = Array.from(new Set(locations.map(loc => getBranchDetails(loc)?.city).filter(Boolean))) as string[]
                    const filteredLocations = cityFilter ? locations.filter(loc => getBranchDetails(loc)?.city === cityFilter) : locations

                    return (
                      <>
                        {uniqueCities.length > 0 && (
                          <div className="flex items-center gap-2 mb-4">
                            <label className="text-sm font-bold text-slate-900">{language === 'vi' ? 'Thành phố:' : 'City:'}</label>
                            <select
                              value={cityFilter}
                              onChange={e => setCityFilter(e.target.value)}
                              className="text-sm font-semibold border border-gray-300 rounded-lg bg-white text-slate-900 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 py-1.5 px-3 cursor-pointer focus:outline-none outline-none"
                            >
                              <option value="" className="text-slate-900 bg-white font-medium">{language === 'vi' ? 'Tất cả thành phố' : 'All Cities'}</option>
                              {uniqueCities.sort().map(c => (
                                <option key={c} value={c} className="text-slate-900 bg-white font-medium">{c}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[380px] overflow-y-auto pr-1">
                          {filteredLocations.map(loc => {
                            const details = getBranchDetails(loc)
                            return (
                              <button
                                key={loc.id}
                                type="button"
                                onClick={() => {
                                  setSelectedLocId(loc.id)
                                  setModalStep('form')
                                }}
                                className="group relative flex items-center gap-3.5 w-full p-4 rounded-2xl bg-white hover:bg-blue-50/10 border border-slate-250 hover:border-blue-500 shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(59,130,246,0.06)] transition-all duration-300 text-left cursor-pointer focus:outline-none"
                              >
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-250 group-hover:scale-103 text-blue-600 bg-blue-50 border border-blue-200/60">
                                  <MapPinIcon className="w-6 h-6 stroke-[1.75]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-[13px] text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                                    {loc.name}
                                  </h4>
                                  <p className="text-[10px] text-slate-500 font-semibold leading-normal mt-0.5 group-hover:text-slate-655 line-clamp-2">
                                    {details?.address || (loc.type === 'warehouse' ? (language === 'vi' ? 'Kho hàng' : 'Warehouse') : (language === 'vi' ? 'Chi nhánh' : 'Branch'))}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                          {filteredLocations.length === 0 && (
                            <div className="col-span-2 text-sm text-gray-550 italic text-center py-8">
                              {language === 'vi' ? 'Không tìm thấy địa điểm nào' : 'No locations found'}
                            </div>
                          )}
                        </div>
                      </>
                    )
                  })()}

                </div>
              </>
            ) : (
              <>
                <div className="p-6 border-b border-slate-200/60 flex items-center gap-3 text-gray-900 justify-between bg-white shrink-0">
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => setModalStep('location')} 
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                      title={language === 'vi' ? 'Quay lại' : 'Back'}
                    >
                      <ArrowLeftIcon className="w-4 h-4" />
                    </button>
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                      <CalculatorIcon className="h-5 w-5" />
                    </div>
                    <span className="text-base font-extrabold text-slate-900 truncate">
                      {language === 'vi' ? 'Báo cáo chế biến/sản xuất' : 'Log Kitchen Production'}
                    </span>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-655 hover:bg-slate-200/65 transition cursor-pointer focus:outline-none flex items-center justify-center">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                
                <form onSubmit={handleCreateProduction} className="p-5 space-y-3.5 text-gray-900 overflow-y-auto flex-1">
                  {errorMsg && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                      {errorMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <MapPinIcon className="w-3.5 h-3.5 text-slate-400" />
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {language === 'vi' ? 'Cửa hàng/Nhà bếp *' : 'Production Location *'}
                        </label>
                      </div>
                      <select
                        value={selectedLocId}
                        onChange={e => setSelectedLocId(e.target.value)}
                        className="w-full border border-slate-200 hover:border-slate-350 rounded-xl px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-slate-50/20 shadow-2xs cursor-pointer"
                        required
                      >
                        <option value="">{language === 'vi' ? '-- Chọn địa điểm --' : '-- Select Location --'}</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <BookOpenIcon className="w-3.5 h-3.5 text-slate-400" />
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {language === 'vi' ? 'Sản phẩm chế biến (Prep) *' : 'Prep Recipe *'}
                        </label>
                      </div>
                      <select
                        value={selectedPrepId}
                        onChange={e => setSelectedPrepId(e.target.value)}
                        className="w-full border border-slate-200 hover:border-slate-350 rounded-xl px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-slate-50/20 shadow-2xs cursor-pointer"
                        required
                      >
                        <option value="">{language === 'vi' ? '-- Chọn công thức Prep --' : '-- Select Prep --'}</option>
                        {prepRecipes.map(prep => (
                          <option key={prep.id} value={prep.id}>
                            {prep.name} (Yield: {prep.yield_qty} {prep.uom_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

              {selectedPrepRecipe && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Square3Stack3DIcon className="w-3.5 h-3.5 text-slate-400" />
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {language === 'vi' ? 'Số mẻ chế biến *' : 'Batches *'}
                        </label>
                      </div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={batchesCount}
                        onChange={e => handleBatchesChange(e.target.value)}
                        className="w-full border border-slate-200 hover:border-slate-350 rounded-xl px-3 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-slate-50/20 shadow-2xs"
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <InboxIcon className="w-3.5 h-3.5 text-slate-400" />
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {language === 'vi' ? 'Nguyên liệu thực tế *' : 'Actual Input *'}
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={actualInput}
                          onChange={e => setActualInput(formatLiveNumber(e.target.value))}
                          className="w-full border border-slate-200 hover:border-slate-350 rounded-xl pl-3 pr-10 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-slate-50/20 shadow-2xs"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-semibold uppercase">
                          {selectedPrepRecipe.uom_name}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <SparklesIcon className="w-3.5 h-3.5 text-slate-400" />
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {language === 'vi' ? 'Thành phẩm thực tế *' : 'Actual Output *'}
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={actualOutput}
                          onChange={e => setActualOutput(formatLiveNumber(e.target.value))}
                          className="w-full border border-slate-200 hover:border-slate-350 rounded-xl pl-3 pr-10 h-10 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm outline-none bg-slate-50/20 shadow-2xs"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-semibold uppercase">
                          {selectedPrepRecipe.uom_name}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tabella di Tuning e Calcolo Resa & Wastage */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/30 p-4.5 space-y-3.5 shadow-2xs">
                    <div className="flex items-center gap-1.5">
                      <ChartBarIcon className="w-3.5 h-3.5 text-slate-400" />
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {language === 'vi' ? 'Thông số hiệu suất & hao hụt' : 'Performance & Wastage Metrics'}
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      {/* Expected vs Actual Input */}
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Đầu vào lý thuyết:' : 'Expected Input:'}</span>
                        <span className="font-bold text-slate-800 tabular-nums">{Math.round(expInput).toLocaleString('en-US')} {selectedPrepRecipe.uom_name}</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Đầu vào thực tế:' : 'Actual Input:'}</span>
                        <span className="font-black text-slate-900 tabular-nums">{Math.round(actInput).toLocaleString('en-US')} {selectedPrepRecipe.uom_name}</span>
                      </div>

                      {/* Expected vs Actual Output */}
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Đầu ra lý thuyết:' : 'Expected Output:'}</span>
                        <span className="font-bold text-slate-800 tabular-nums">{Math.round(expOutput).toLocaleString('en-US')} {selectedPrepRecipe.uom_name}</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Đầu ra thực tế:' : 'Actual Output:'}</span>
                        <span className="font-black text-slate-900 tabular-nums">{Math.round(actOutput).toLocaleString('en-US')} {selectedPrepRecipe.uom_name}</span>
                      </div>

                      {/* Standard vs Actual Wastage */}
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Hao hụt tiêu chuẩn:' : 'Standard Wastage:'}</span>
                        <span className="font-bold text-amber-800 tabular-nums">{Math.round(stdWastageVal).toLocaleString('en-US')} {selectedPrepRecipe.uom_name} ({Math.round(stdWastagePct)}%)</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Hao hụt thực tế:' : 'Actual Wastage:'}</span>
                        <span className="font-black text-red-700 tabular-nums">{Math.round(actWastageVal).toLocaleString('en-US')} {selectedPrepRecipe.uom_name} ({Math.round(actWastagePct)}%)</span>
                      </div>

                      {/* Expected vs Actual Yield */}
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Hiệu suất tiêu chuẩn:' : 'Expected Yield:'}</span>
                        <span className="font-bold text-blue-700 tabular-nums">{Math.round(expYieldPct)}%</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{language === 'vi' ? 'Hiệu suất thực tế:' : 'Actual Yield:'}</span>
                        <span className="font-black text-emerald-700 tabular-nums">{Math.round(actYieldPct)}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className={`p-2 rounded-xl border flex items-center justify-between px-3 shadow-2xs transition-all ${
                        wastageVariance <= 0 
                          ? 'bg-emerald-50/20 border-emerald-200 text-emerald-800' 
                          : 'bg-rose-50/20 border-rose-200 text-rose-800'
                      }`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">
                          {language === 'vi' ? 'C.lệch hao hụt' : 'Waste Var.'}
                        </span>
                        <span className="text-sm font-black tabular-nums">
                          {wastageVariance >= 0 ? '+' : ''}{Math.round(wastageVariance)}%
                        </span>
                      </div>

                      <div className={`p-2 rounded-xl border flex items-center justify-between px-3 shadow-2xs transition-all ${
                        yieldVariance >= 0 
                          ? 'bg-emerald-50/20 border-emerald-250 text-emerald-800' 
                          : 'bg-rose-50/20 border-rose-250 text-rose-800'
                      }`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">
                          {language === 'vi' ? 'C.lệch H.suất' : 'Yield Var.'}
                        </span>
                        <span className="text-sm font-black tabular-nums">
                          {yieldVariance >= 0 ? '+' : ''}{Math.round(yieldVariance)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ChatBubbleOvalLeftEllipsisIcon className="w-3.5 h-3.5 text-slate-400" />
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {language === 'vi' ? 'Ghi chú / Lý do chênh lệch' : 'Notes / Variance Reason'}
                  </label>
                </div>
                <textarea
                  value={prodNotes}
                  onChange={e => setProdNotes(e.target.value)}
                  className="w-full border border-slate-200 hover:border-slate-350 rounded-xl p-2.5 text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-xs outline-none bg-slate-50/20 shadow-2xs min-h-[48px] resize-none"
                  placeholder={language === 'vi' ? 'Nhập ghi chú hoặc lý do chênh lệch hiệu suất...' : 'Enter any notes or yield variance reasons...'}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setIsModalOpen(false)}
                  disabled={loading}
                >
                  {language === 'vi' ? 'Hủy' : 'Cancel'}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  size="md"
                  loading={loading}
                >
                  {language === 'vi' ? 'Xác nhận sản xuất' : 'Log Production'}
                </Button>
              </div>
            </form>
          </>
        )}
          </div>
        </div>
      )}

      {/* Modal Visualizza Dettagli Storici e Ingredienti Consumati */}
      {isViewModalOpen && viewingProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden border border-slate-100 shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between text-gray-900">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{viewingProd.prep_name}</h3>
                <p className="text-xs text-slate-500">
                  {language === 'vi'
                    ? `Chi tiết đợt sản xuất thực tế`
                    : `Actual kitchen production run details`}
                </p>
              </div>
              <button onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-slate-650 transition-colors text-sm font-semibold">
                ✕
              </button>
            </div>
            
            <div className="p-6 max-h-[500px] overflow-y-auto space-y-4 text-gray-900">
              {/* Tabella di Tuning Storica */}
              {viewingProd.expected_input !== undefined && (
                <div className="border border-slate-100 rounded-xl bg-slate-50/50 p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {language === 'vi' ? 'Thông số hiệu suất & hao hụt lịch sử' : 'Historical Performance & Wastage'}
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Đầu vào lý thuyết:' : 'Expected Input:'}</span>
                      <span className="font-semibold text-slate-800">{viewingProd.expected_input !== null && viewingProd.expected_input !== undefined ? Math.round(viewingProd.expected_input).toLocaleString('en-US') : '-'} {viewingProd.uom}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Đầu vào thực tế:' : 'Actual Input:'}</span>
                      <span className="font-bold text-slate-900">{viewingProd.actual_input !== null && viewingProd.actual_input !== undefined ? Math.round(viewingProd.actual_input).toLocaleString('en-US') : '-'} {viewingProd.uom}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Đầu ra lý thuyết:' : 'Expected Output:'}</span>
                      <span className="font-semibold text-slate-800">{viewingProd.expected_output !== null && viewingProd.expected_output !== undefined ? Math.round(viewingProd.expected_output).toLocaleString('en-US') : '-'} {viewingProd.uom}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Đầu ra thực tế:' : 'Actual Output:'}</span>
                      <span className="font-bold text-slate-900">{viewingProd.actual_output !== null && viewingProd.actual_output !== undefined ? Math.round(viewingProd.actual_output).toLocaleString('en-US') : '-'} {viewingProd.uom}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Hao hụt tiêu chuẩn:' : 'Standard Wastage:'}</span>
                      <span className="font-semibold text-amber-800">{viewingProd.standard_wastage !== null && viewingProd.standard_wastage !== undefined ? Math.round(viewingProd.standard_wastage).toLocaleString('en-US') : '-'} {viewingProd.uom} ({viewingProd.standard_wastage_pct !== null && viewingProd.standard_wastage_pct !== undefined ? Math.round(viewingProd.standard_wastage_pct) : '-'}%)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Hao hụt thực tế:' : 'Actual Wastage:'}</span>
                      <span className="font-bold text-red-700">{viewingProd.actual_wastage !== null && viewingProd.actual_wastage !== undefined ? Math.round(viewingProd.actual_wastage).toLocaleString('en-US') : '-'} {viewingProd.uom} ({viewingProd.actual_wastage_pct !== null && viewingProd.actual_wastage_pct !== undefined ? Math.round(viewingProd.actual_wastage_pct) : '-'}%)</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Hiệu suất tiêu chuẩn:' : 'Expected Yield:'}</span>
                      <span className="font-semibold text-blue-700">{viewingProd.expected_yield_pct !== null && viewingProd.expected_yield_pct !== undefined ? Math.round(viewingProd.expected_yield_pct) : '-'}%</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">{language === 'vi' ? 'Hiệu suất thực tế:' : 'Actual Yield:'}</span>
                      <span className="font-bold text-emerald-700">{viewingProd.actual_yield_pct !== null && viewingProd.actual_yield_pct !== undefined ? Math.round(viewingProd.actual_yield_pct) : '-'}%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center ${
                      (viewingProd.wastage_variance || 0) <= 0 
                        ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
                        : 'bg-rose-50/50 border-rose-100 text-rose-800'
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">
                        {language === 'vi' ? 'Chênh lệch hao hụt' : 'Wastage Variance'}
                      </span>
                      <span className="text-sm font-extrabold mt-0.5">
                        {viewingProd.wastage_variance !== undefined && viewingProd.wastage_variance >= 0 ? '+' : ''}{viewingProd.wastage_variance !== undefined ? Math.round(viewingProd.wastage_variance) : '-'}%
                      </span>
                    </div>

                    <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center ${
                      (viewingProd.yield_variance || 0) >= 0 
                        ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
                        : 'bg-rose-50/50 border-rose-100 text-rose-800'
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">
                        {language === 'vi' ? 'Chênh lệch hiệu suất' : 'Yield Variance'}
                      </span>
                      <span className="text-sm font-extrabold mt-0.5">
                        {viewingProd.yield_variance !== undefined && viewingProd.yield_variance >= 0 ? '+' : ''}{viewingProd.yield_variance !== undefined ? Math.round(viewingProd.yield_variance) : '-'}%
                      </span>
                    </div>
                  </div>

                  {viewingProd.notes && (
                    <div className="pt-2 border-t border-slate-100 text-xs">
                      <span className="font-bold text-slate-700">{language === 'vi' ? 'Ghi chú:' : 'Notes:'} </span>
                      <span className="text-slate-600 italic">"{viewingProd.notes}"</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {language === 'vi' ? 'Danh sách nguyên vật liệu tiêu thụ thực tế' : 'Actual Raw Material Deductions'}
                </h4>
                {(!viewingProd.consumptions || viewingProd.consumptions.length === 0) ? (
                  <p className="text-sm text-slate-400 italic text-center py-4">
                    {language === 'vi' ? 'Không tìm thấy dữ liệu tiêu thụ' : 'No consumption details recorded'}
                  </p>
                ) : (
                  viewingProd.consumptions.map((c, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 px-3 hover:bg-slate-50 rounded-xl border border-slate-100 transition-colors text-sm">
                      <span className="font-semibold text-slate-800">{c.item_name || 'Ingredient'}</span>
                      <span className="font-bold text-red-650">
                        -{c.qty_consumed.toLocaleString()} <span className="text-xs font-normal text-slate-500">{c.uom}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 h-10 text-sm font-semibold text-slate-650 hover:text-slate-800 transition-colors cursor-pointer"
              >
                {language === 'vi' ? 'Đóng' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function KitchenProductionPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-transparent">
        <CircularLoader />
      </div>
    }>
      <KitchenProductionContent />
    </Suspense>
  )
}
