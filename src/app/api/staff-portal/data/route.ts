// /src/app/api/staff-portal/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const { staffId } = await req.json()

    if (!staffId || typeof staffId !== 'string') {
      return NextResponse.json({ error: 'Staff ID required' }, { status: 400 })
    }

    // 1. Fetch Staff Member Details
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('hr_staff')
      .select('*')
      .eq('id', staffId)
      .maybeSingle()

    if (staffErr || !staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
    }

    // 2. Fetch Branch Assignments
    const { data: branchAssignments } = await supabaseAdmin
      .from('hr_staff_branches')
      .select('branch_id, provider_branches(id, name, city)')
      .eq('staff_id', staffId)

    const branches = (branchAssignments || [])
      .map((b: any) => b.provider_branches)
      .filter(Boolean)
    const branchIds = branches.map((b: any) => b.id)

    // 3. Fetch Contracts
    const { data: contracts } = await supabaseAdmin
      .from('hr_staff_contracts')
      .select('*')
      .eq('staff_id', staffId)
      .order('signing_date', { ascending: false })

    // 4. Fetch Documents and generate Signed URLs
    const { data: documents } = await supabaseAdmin
      .from('hr_staff_documents')
      .select('*')
      .eq('staff_id', staffId)
      .order('uploaded_at', { ascending: false })

    const docsWithUrls = []
    if (documents) {
      for (const doc of documents) {
        let downloadUrl = doc.file_url || ''
        if (doc.file_path) {
          try {
            const { data: signedData } = await supabaseAdmin.storage
              .from('hr-documents')
              .createSignedUrl(doc.file_path, 3600) // 1 hour validity
            downloadUrl = signedData?.signedUrl || downloadUrl
          } catch (e) {
            console.error('Error generating signed URL for document:', doc.id, e)
          }
        }
        docsWithUrls.push({
          ...doc,
          download_url: downloadUrl
        })
      }
    }

    // 5. Fetch Assets and History
    const { data: assets } = await supabaseAdmin
      .from('hr_staff_assets')
      .select('*, hr_staff_asset_history(*)')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })

    // 6. Fetch Career Journey (Role History & Salary History)
    const { data: roleHistory } = await supabaseAdmin
      .from('hr_staff_role_history')
      .select(`
        *,
        old_position:hr_positions!old_position_id(name),
        new_position:hr_positions!new_position_id(name)
      `)
      .eq('staff_id', staffId)
      .order('effective_date', { ascending: false })

    const { data: salaryHistory } = await supabaseAdmin
      .from('hr_staff_salary_history')
      .select(`
        *,
        previous_position:hr_positions!hr_staff_salary_history_previous_position_id_fkey(name),
        new_position:hr_positions!hr_staff_salary_history_new_position_id_fkey(name)
      `)
      .eq('staff_id', staffId)
      .order('effective_date', { ascending: false })

    // 7. Fetch Performance Reviews
    const { data: performance } = await supabaseAdmin
      .from('hr_staff_performance')
      .select('*')
      .eq('staff_id', staffId)
      .order('review_date', { ascending: false })

    // 8. Fetch Disciplinary (Fines)
    const { data: fines } = await supabaseAdmin
      .from('hr_staff_fines')
      .select(`
        *,
        infraction:hr_disciplinary_catalog(infraction_name)
      `)
      .eq('staff_id', staffId)
      .neq('deduction_source', 'cash')
      .order('date', { ascending: false })

    // Fetch Warnings & Flags
    const { data: warnings } = await supabaseAdmin
      .from('hr_staff_warnings')
      .select('*')
      .eq('staff_id', staffId)
      .order('date', { ascending: false })

    // Fetch Awards
    const { data: awards } = await supabaseAdmin
      .from('hr_staff_awards')
      .select('*')
      .eq('staff_id', staffId)
      .neq('deduction_source', 'cash')
      .order('date', { ascending: false })

    // 9. Fetch Service Charges and aggregate pools
    const { data: scStaffRecords } = await supabaseAdmin
      .from('hr_service_charge_staff')
      .select('*')
      .eq('staff_id', staffId)
      .order('month_id', { ascending: false })

    const serviceCharges = []
    if (scStaffRecords) {
      for (const record of scStaffRecords) {
        // Get total pool for month/city
        const { data: pool } = await supabaseAdmin
          .from('hr_service_charges')
          .select('total_amount')
          .eq('month_id', record.month_id)
          .eq('city', record.city)
          .maybeSingle()

        // Get total hours of all staff in that pool
        const { data: allStaffRecords } = await supabaseAdmin
          .from('hr_service_charge_staff')
          .select('hours_worked')
          .eq('month_id', record.month_id)
          .eq('city', record.city)

        const totalHours = (allStaffRecords || []).reduce((sum, r) => sum + Number(r.hours_worked || 0), 0)
        const totalAmount = Number(pool?.total_amount || 0)
        const hourlyRate = totalHours > 0 ? (totalAmount / totalHours) : 0
        const amountReceived = hourlyRate * Number(record.hours_worked || 0)
        const percentage = totalHours > 0 ? (Number(record.hours_worked || 0) / totalHours) * 100 : 0

        serviceCharges.push({
          month_id: record.month_id,
          city: record.city,
          hours_worked: record.hours_worked,
          total_pool: totalAmount,
          total_hours: totalHours,
          amount_received: amountReceived,
          percentage: percentage
        })
      }
    }

    // 10. Fetch Published Rosters for staff member's branches
    // We fetch the published rosters for the last 4 weeks and 4 weeks ahead
    const publishedRosters = []
    if (branchIds.length > 0) {
      const { data: rosters } = await supabaseAdmin
        .from('hr_published_rosters')
        .select('*')
        .in('branch_id', branchIds)
        .order('week_start', { ascending: false })

      if (rosters) {
        publishedRosters.push(...rosters)
      }
    }

    // 11. Fetch staff list for the same branches to resolve names in the shared roster view
    const colleagues: Record<string, { id: string; name: string; position: string }> = {}
    if (branchIds.length > 0) {
      const { data: assignedColleagues } = await supabaseAdmin
        .from('hr_staff_branches')
        .select(`
          staff_id,
          hr_staff!inner(id, full_name, position, status)
        `)
        .in('branch_id', branchIds)
      
      if (assignedColleagues) {
        assignedColleagues.forEach((c: any) => {
          if (c.hr_staff && c.hr_staff.status === 'active') {
            colleagues[c.hr_staff.id] = {
              id: c.hr_staff.id,
              name: c.hr_staff.full_name,
              position: c.hr_staff.position || ''
            }
          }
        })
      }
    }

    // 12. Fetch Notifications
    const { data: notifications } = await supabaseAdmin
      .from('hr_staff_notifications')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({
      staff,
      branches,
      contracts: contracts || [],
      documents: docsWithUrls,
      assets: assets || [],
      career: {
        roles: roleHistory || [],
        salaries: salaryHistory || []
      },
      performance: performance || [],
      disciplinary: fines || [],
      warnings: warnings || [],
      awards: awards || [],
      serviceCharges,
      publishedRosters,
      colleagues,
      notifications: notifications || []
    })

  } catch (err) {
    console.error('Staff portal data exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
