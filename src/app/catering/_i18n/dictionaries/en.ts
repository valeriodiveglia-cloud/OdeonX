const en = {
  /* ===== Navigation / Sections ===== */
  EventInfo: 'Event Info',
  Bundles: 'Bundles',
  Transportation: 'Transportation',
  ExtraFee: 'Extra Fee',
  Staff: 'Staff',
  Summary: 'Summary',

  /* ===== Catering List Page ===== */
  'catering.title': 'Catering',
  'catering.selected': 'selected',
  'catering.new_event': 'New event',
  'catering.empty': 'No events. Create with "New event".',

  /* Bulk / Selection */
  'bulk.menu_title': 'Bulk actions',
  'bulk.delete': 'Delete',
  'bulk.delete_confirm': 'Delete {n} event(s) and all related rows? This cannot be undone.',
  'bulk.deleted_ok': 'Deleted successfully.',
  'bulk.deleted_fail': 'Delete failed: {msg}',

  'select.enter': 'Enter selecting',
  'select.exit': 'Exit selecting',
  'select.active': 'Selecting',
  'select.button': 'Select',
  'select.all': 'Select all',

  /* Refresh */
  'refresh.aria': 'Refresh list',
  'refresh.title': 'Refresh',
  'refresh.btn': 'Refresh',

  /* Table */
  'table.col.date': 'Date',
  'table.col.event': 'Event',
  'table.col.host': 'Host',
  'table.col.payment': 'Payment',
  'table.col.status': 'Status',
  'table.col.total_vnd': 'Total (VND)',

  'table.sort.date': 'Sort by date',
  'table.sort.event': 'Sort by event title',
  'table.sort.host': 'Sort by host',
  'table.sort.payment': 'Sort by payment',
  'table.sort.total': 'Sort by total',
  'table.group.status': 'Group by status',

  /* Common */
  'common.error': 'Error',
  'common.cancel': 'Cancel',
  'common.save': 'Save',

  /* Row actions */
  'row.actions': 'Actions',

  /* Status */
  'status.title': 'Status',
  'status.select': 'Select status',
  'status.empty': ' - empty - ',
  'status.inquiry': 'Inquiry',
  'status.pending': 'Pending',
  'status.confirmed': 'Confirmed',
  'status.done': 'Done',
  'status.save_failed': 'Saving status failed: {msg}',

  /* Payment (column + modal) */
  'payment.deposit': 'Deposit',
  'payment.balance': 'Balance',
  'payment.paid': 'Paid',
  'payment.due_date': 'Due date',
  'payment.amount_vnd': 'Amount (VND)',
  'payment.paid_at': 'Paid at',
  'payment.overdue': 'Overdue',

  /* Manage Payment (flows) */
  'pay.title': 'Manage payment',
  'pay.manage': 'Manage payment',
  'pay.checking': 'Checking…',
  'pay.missing': 'Missing data',
  'pay.hint_missing_total': 'Missing or zero Total',
  'pay.hint_missing_data': 'Missing payment data',
  'pay.hint_missing_bal_due': 'Missing balance due date',
  'pay.hint_missing_dates': 'Missing deposit/balance due date',
  'pay.hint_missing_pct': 'Missing deposit% or balance%',
  'pay.save_failed': 'Saving payment failed: {msg}',

  /* ===== Assets Card ===== */
  'assets.title': 'Company assets',
  'assets.add_row_title': 'Add asset row',
  'assets.need_event_id': 'Provide eventId to add DB rows',
  'assets.add': 'Add asset',
  'assets.empty': 'No assets yet. Click "Add asset" to insert your first row.',
  'assets.name': 'Name',
  'assets.name_ph': 'Asset name',
  'assets.name_aria': 'Asset name',
  'assets.qty': 'Qty',
  'assets.qty_aria': 'Quantity',
  'assets.include_price': 'Include price',
  'assets.unit_price': 'Unit price',
  'assets.unit_price_aria': 'Unit price (VND)',
  'assets.unit_price_title': 'Unit price in VND',
  'assets.enable_toggle': 'Enable the toggle to edit',
  'assets.total_price': 'Total price',
  'assets.row_total_aria': 'Row total price',
  'assets.row_total_title': 'Quantity x Unit price when included',
  'assets.remove_title': 'Remove asset row',
  'assets.remove_aria': 'Remove row',
  'assets.totals': 'Totals',
  'assets.price_label': 'Price',

  /* ===== Discounts Card ===== */
  'discounts.title': 'Discounts',
  'discounts.missing_event': 'Missing eventId. Open or create an event to add Discounts.',
  'discounts.add_row_title': 'Add discount row',
  'discounts.need_event_id': 'Provide eventId to add DB rows',
  'discounts.add': 'Add discount',
  'discounts.load_error': 'Load error',
  'discounts.empty': 'No discounts yet. Click "Add discount" to insert your first row.',
  'discounts.label': 'Label',
  'discounts.label_ph': 'Description',
  'discounts.label_aria': 'Discount label',
  'discounts.percentage': 'Percentage',
  'discounts.toggle_pct_aria': 'Toggle percentage mode',
  'discounts.configure_pct_aria': 'Configure percentage',
  'discounts.configure_pct_title': 'Configure percentage',
  'discounts.scope_chip_title': 'Click to configure',
  'discounts.total_row': 'Total discount',
  'discounts.amount_aria': 'Discount amount (VND)',
  'discounts.remove_aria': 'Remove discount',
  'discounts.remove_title': 'Remove discount',
  'discounts.totals': 'Totals',
  'discounts.total_label': 'Discounts',

  /* Discounts Modal */
  'discounts.modal.title': 'Percentage settings',
  'discounts.modal.close': 'Close',
  'discounts.modal.mode': 'Percentage mode',
  'discounts.modal.percent': 'Percentage (%)',
  'discounts.modal.base': 'Base',
  'discounts.modal.bundle_specific': 'Specific bundle',
  'discounts.modal.bundles_all': '- All bundles -',
  'discounts.modal.bundle_prefix': 'Bundle:',
  'discounts.modal.note': 'No DB/LS write until you press global Save. UI shows local live values.',

  /* Discounts Base options */
  'discounts.base.bundles': 'Bundles',
  'discounts.base.equipment': 'Equipment',
  'discounts.base.staff': 'Staff',
  'discounts.base.transport': 'Transport',
  'discounts.base.assets': 'Company assets',
  'discounts.base.total_excl_extrafee': 'Totals (exclude extra fees)',
  'discounts.base.total_incl_extrafee': 'Totals (include extra fees)',

  /* Discounts Scope labels (chips) */
  'discounts.scope.bundle': 'BUNDLE',
  'discounts.scope.bundle_selected': 'BUNDLE (selected)',
  'discounts.scope.bundles_all': 'BUNDLES (all)',
  'discounts.scope.equipment': 'EQUIPMENT',
  'discounts.scope.staff': 'STAFF',
  'discounts.scope.transport': 'TRANSPORT',
  'discounts.scope.assets': 'COMPANY ASSETS',
  'discounts.scope.total_excl_extrafee': 'TOTALS (exclude extra fees)',
  'discounts.scope.total_incl_extrafee': 'TOTALS (include extra fees)',

  /* ===== Equipment Card ===== */
  'equipment.title': 'Equipment',
  'equipment.any': 'Any',
  'equipment.badge_no_event': 'No eventId: save/open an event first',
  'equipment.need_event_id': 'An eventId is required to save',
  'equipment.add_row_title': 'Add equipment row',
  'equipment.loading': 'Loading…',
  'equipment.add': 'Add equipment',
  'equipment.col.item': 'Item',
  'equipment.col.category': 'Category',
  'equipment.col.qty': 'Qty',
  'equipment.col.unit_price': 'Unit price',
  'equipment.col.total': 'Total',
  'equipment.col.notes': 'Notes',
  'equipment.qty_aria': 'Quantity',
  'equipment.notes_db_prefix': 'DB note: {note}',
  'equipment.notes_optional': 'Optional notes',
  'equipment.remove_title': 'Remove',
  'equipment.remove_aria': 'Remove',
  'equipment.totals': 'Totals',

  /* ===== Extra Fee Card ===== */
  'extrafee.title': 'Extra Fee',
  'extrafee.add_row_title': 'Add fee row',
  'extrafee.add': 'Add fee',
  'extrafee.missing_event': 'Missing eventId. Open or create an event to add Extra Fees.',
  'extrafee.load_error': 'Load error',
  'extrafee.loading': 'Loading…',
  'extrafee.empty': 'No fees yet. Click “Add fee” to insert your first row.',
  'extrafee.label': 'Label',
  'extrafee.label_ph': 'Description',
  'extrafee.label_aria': 'Fee label',
  'extrafee.qty': 'Qty',
  'extrafee.qty_aria': 'Quantity',
  'extrafee.adv_label': 'Advanced',
  'extrafee.toggle_adv_aria': 'Toggle advanced mode',
  'extrafee.configure_adv_aria': 'Configure advanced settings',
  'extrafee.unit_price': 'Unit price',
  'extrafee.unit_price_aria': 'Unit price (VND)',
  'extrafee.total_price': 'Total price',
  'extrafee.remove_aria': 'Remove fee',
  'extrafee.totals': 'Totals',
  'extrafee.price_label': 'Price',

  /* Extra Fee Modal */
  'extrafee.modal.title': 'Advanced settings',
  'extrafee.modal.close': 'Close',
  'extrafee.modal.mode': 'Mode',
  'extrafee.modal.mode_cost': 'Cost & Markup',
  'extrafee.modal.mode_pct': 'Percentage',
  'extrafee.modal.cost': 'Cost',
  'extrafee.modal.markup_x': 'Markup X',
  'extrafee.modal.help_cost': 'Unit price = Cost × Markup X. Total = Qty × Unit price.',
  'extrafee.modal.percent': 'Percentage (%)',
  'extrafee.modal.base': 'Base',
  'extrafee.modal.help_pct': 'Percentage applies to prices, not costs. Quantity is ignored. Total = Base × %.',
  'extrafee.modal.cancel': 'Cancel',
  'extrafee.modal.save': 'Save',

  /* Extra Fee Base options */
  'extrafee.base.bundles': 'Bundles',
  'extrafee.base.equipment': 'Equipment',
  'extrafee.base.staff': 'Staff',
  'extrafee.base.transport': 'Transport',
  'extrafee.base.assets': 'Company assets',
  'extrafee.base.total_excl_extrafee': 'Totals (exclude extra fees)',
  'extrafee.base.total_incl_extrafee': 'Totals (include extra fees)',

  /* Extra Fee Scope chip labels */
  'extrafee.scope.bundles': 'BUNDLES',
  'extrafee.scope.equipment': 'EQUIPMENT',
  'extrafee.scope.staff': 'STAFF',
  'extrafee.scope.transport': 'TRANSPORT',
  'extrafee.scope.assets': 'COMPANY ASSETS',
  'extrafee.scope.total_excl_extrafee': 'TOTALS (excl. fees)',
  'extrafee.scope.total_incl_extrafee': 'TOTALS (incl. fees)',

  /* ===== Event Info Card ===== */
  'eventinfo.loading': 'Loading…',
  'eventinfo.title': 'Event info',
  'eventinfo.event': 'Event',
  'eventinfo.date': 'Date',
  'eventinfo.start_time': 'Start time',
  'eventinfo.end_time': 'End time',
  'eventinfo.total_hours': 'Total hours',
  'eventinfo.location': 'Location',

  'eventinfo.host_poc': 'Host/POC',
  'eventinfo.phone': 'Phone',
  'eventinfo.email': 'Email',
  'eventinfo.preferred_contact': 'Preferred contact',
  'eventinfo.contact.zalo': 'Zalo',
  'eventinfo.contact.phone': 'Phone',
  'eventinfo.contact.email': 'Email',
  'eventinfo.contact.whatsapp': 'WhatsApp',
  'eventinfo.contact.other': 'Other',

  'eventinfo.customer_type': 'Customer type',
  'eventinfo.customer.private': 'Private',
  'eventinfo.customer.company': 'Company',

  'eventinfo.company.name': 'Company name',
  'eventinfo.company.director': 'Director name',
  'eventinfo.company.tax_code': 'Tax code',
  'eventinfo.company.address': 'Address',
  'eventinfo.company.city': 'City',
  'eventinfo.company.billing_email': 'Billing email',

  'eventinfo.people': 'People',
  'eventinfo.budget_per_person': 'Budget per person',
  'eventinfo.per_person_suffix': '/ person',
  'eventinfo.budget_total': 'Budget total',
  'eventinfo.notes': 'Notes',

  'eventinfo.payment': 'Payment',
  'eventinfo.payment.full': 'Full',
  'eventinfo.payment.installments': 'Installments',
  'eventinfo.deposit': 'Deposit',
  'eventinfo.deposit_pct': 'Deposit %',
  'eventinfo.due_date': 'Due date',
  'eventinfo.balance': 'Balance',
  'eventinfo.balance_pct': 'Balance %',

  'eventinfo.provider_branch': 'Provider branch',
  'eventinfo.select_branch': '— Select branch —',

  /* ===== Event Staff Card ===== */
  'eventstaff.title': 'Staff',
  'eventstaff.markup': 'Markup',
  'eventstaff.adopt_global': 'Adopt global settings',
  'eventstaff.add': 'Add staff',
  'eventstaff.add_row_title': 'Add staff row',

  'eventstaff.col.name': 'Name',
  'eventstaff.col.role': 'Role',
  'eventstaff.col.cost_per_hour': 'Cost/h',
  'eventstaff.col.hours': 'Hours',
  'eventstaff.col.cost': 'Cost',
  'eventstaff.col.price': 'Price',

  'eventstaff.ph.name': 'Full name',
  'eventstaff.ph.role': 'Position/role',

  'eventstaff.aria.cost_per_hour': 'Cost per hour',
  'eventstaff.aria.hours': 'Hours',

  'eventstaff.hint.step_thousand': 'Use arrows to change by 1000',
  'eventstaff.hint.step_half': 'Use arrows to change by 0.5',

  'eventstaff.remove_title': 'Remove',
  'eventstaff.totals': 'Totals',

  /* ===== Totals Card ===== */
  'totals.title': 'Totals',
  'totals.loading': 'Loading…',

  'totals.col.section': 'Section',
  'totals.col.cost': 'Cost',
  'totals.col.price': 'Price',

  'totals.row.bundles': 'Bundles',
  'totals.row.equipment': 'Equipment',
  'totals.row.staff': 'Staff',
  'totals.row.transport': 'Transport',
  'totals.row.assets': 'Company assets',
  'totals.row.extrafee': 'Extra fee',

  'totals.label.totals': 'Totals',
  'totals.label.after_discounts': 'Total after discounts',

  'totals.payment_split.title': 'Payment split',
  'totals.payment_split.note': 'Editing these amounts updates the percentages. Click Save to persist the payment plan.',

  'totals.kpi.margin_pct': 'Margin %',
  'totals.kpi.margin': 'Margin',
  'totals.kpi.cost_pct': 'Cost %',
  'totals.kpi.people': 'People',
  'totals.kpi.service_hours': 'Service hours',
  'totals.kpi.budget_total': 'Budget (total)',
  'totals.kpi.per_person_suffix': '/person',
  'totals.kpi.delta_vs_budget': 'Δ vs budget',

  /* ===== Event Transport Card ===== */
  'eventtransport.add': 'Add trip',
  'eventtransport.add_row_title': 'Add trip row',
  'eventtransport.empty': 'No trips yet. Click “Add trip” to insert your first route.',
  'eventtransport.trip': 'Trip',
  'eventtransport.aria.trip_type': 'Trip type',
  'eventtransport.trip.oneway': 'One-way',
  'eventtransport.trip.roundtrip': 'Round-trip',
  'eventtransport.col.from': 'From',
  'eventtransport.col.to': 'To',
  'eventtransport.col.vehicle': 'Vehicle',
  'eventtransport.col.distance_eta': 'Distance / ETA',
  'eventtransport.col.notes': 'Notes',
  'eventtransport.select_vehicle': 'Select vehicle',
  'eventtransport.no_vehicles_yet': 'No vehicles yet',
  'eventtransport.per_km_suffix': '/km',
  'eventtransport.km_unit': 'km',
  'eventtransport.min_unit': 'min',
  'eventtransport.searching': 'Searching…',
  'eventtransport.no_suggestions': 'No suggestions',
  'eventtransport.ph.from': 'e.g. 2 Hai Trieu, District 1, HCMC',
  'eventtransport.ph.to': 'e.g. 1 Vo Van Kiet, District 1, HCMC',
  'eventtransport.ph.notes': 'Add details, plate number, parking, etc.',
  'eventtransport.remove_title': 'Remove trip',

  /* >>> Added missing transport keys (non-breaking) <<< */
  'eventtransport.title': 'Transportation',
  'eventtransport.loading': 'Loading…',
  'eventtransport.load_error': 'Load error',
  'eventtransport.missing_event': 'Missing eventId. Open or create an event to add Transport.',
  'eventtransport.need_event_id': 'Provide eventId to add DB rows',
  'eventtransport.totals': 'Totals',
  'eventtransport.col.cost': 'Cost',
  'eventtransport.col.price': 'Price',
  'eventtransport.col.total': 'Total',
  'eventtransport.remove_aria': 'Remove trip',
  'eventtransport.price_label': 'Price',

  /* ===== Event Calculator Page (toolbar + savebar) ===== */
  'eventcalc.toolbar.back': 'Back',
  'eventcalc.savebar.saved_at': 'Saved at {time}',
  'eventcalc.savebar.never_saved': 'Never saved',
  'common.back': 'Back',

  /* ===== Event Summary (new) ===== */
  'Event Summary': 'Event Summary',
  'Event Info': 'Event Info',
  'Bundles & Menu': 'Bundles & Menu',

  /* Action bar / modal */
  Back: 'Back',
  'Export PDF': 'Export PDF',
  Edit: 'Edit',
  Export: 'Export',
  'Export → Quotation': 'Export → Quotation',
  Report: 'Report',
  Quotation: 'Quotation',
  Menu: 'Menu',
  Contract: 'Contract',
  'Note of payment': 'Note of payment',
  Liquidation: 'Liquidation',
  'Quotation (Detailed)': 'Quotation (Detailed)',
  'Quotation (Summary)': 'Quotation (Summary)',
  Close: 'Close',
  Hide: 'Hide',
  Show: 'Show',
  'Loading…': 'Loading…',

  /* Bundles block */
  'Dish / Item': 'Dish / Item',
  Modifiers: 'Modifiers',
  Qty: 'Qty',
  'Unit cost': 'Unit cost',
  'Unit price': 'Unit price',
  'Subtotal cost': 'Subtotal cost',
  'Subtotal price': 'Subtotal price',
  Subtotal: 'Subtotal',
  'No bundles.': 'No bundles.',

  /* Equipment block */
  Name: 'Name',
  Category: 'Category',
  'No equipment.': 'No equipment.',

  /* Staff block */
  Role: 'Role',
  'Cost / hour': 'Cost / hour',
  Hours: 'Hours',
  Notes: 'Notes',
  'No staff.': 'No staff.',

  /* Transport block */
  'From → To': 'From → To',
  Vehicle: 'Vehicle',
  'Distance (km)': 'Distance (km)',
  Trips: 'Trips',
  'Cost / km': 'Cost / km',
  'ETA (min)': 'ETA (min)',
  'No transport routes.': 'No transport routes.',

  /* Assets block */
  Asset: 'Asset',
  'No company assets.': 'No company assets.',

  /* Extra fee block */
  Label: 'Label',
  Details: 'Details',
  Cost: 'Cost',
  'Markup ×': 'Markup ×',
  'No extra fee rows.': 'No extra fee rows.',
  'calc (cost × markup)': 'calc (cost × markup)',
  unit: 'unit',

  /* Discounts block */
  Amount: 'Amount',
  'Total discounts': 'Total discounts',
  'No discounts.': 'No discounts.',
  'BUNDLES (all)': 'BUNDLES (all)',
  BUNDLE: 'BUNDLE',

  /* Totals table */
  Section: 'Section',
  Price: 'Price',
  Totals: 'Totals',
  Discounts: 'Discounts',
  'Total after discounts': 'Total after discounts',

  /* Payment row */
  'Payment due': 'Payment due',
  Deposit: 'Deposit',
  Balance: 'Balance',

  /* Event info doc (labels sintetici) */
  Title: 'Title',
  Date: 'Date',
  Time: 'Time',
  Location: 'Location',
  'Host / POC': 'Host / POC',
  'Customer type': 'Customer type',
  Phone: 'Phone',
  Email: 'Email',
  'Preferred contact': 'Preferred contact',
  Company: 'Company',
  'Company director': 'Company director',
  'Company tax code': 'Company tax code',
  'Company address': 'Company address',
  'Company city': 'Company city',
  'Billing email': 'Billing email',
  People: 'People',
  'Budget / person': 'Budget / person',
  'Budget (total)': 'Budget (total)',
  'Payment term': 'Payment term',
  'Due by (deposit/balance)': 'Due by (deposit/balance)',
  'Branch provider': 'Branch provider',
  person: 'person',

  /* ===== Parity additions with vi.ts (added only; nothing removed) ===== */
  // EventCalc toolbar + savebar
  'eventcalc.toolbar.new_event': 'New event',
  'eventcalc.toolbar.summary': 'Summary',
  'eventcalc.savebar.saving': 'Saving…',
  'eventcalc.savebar.unsaved': 'Unsaved changes',
  'eventcalc.savebar.save': 'Save',

  // EventCalc actions & table
  'eventcalc.add_bundle': 'Add bundle',
  'eventcalc.add_bundle_title': 'Add new bundle',
  'eventcalc.add_bundle_disabled': 'No bundle types yet. Open Event Settings to create at least one type.',
  'eventcalc.no_bundle_types': 'No bundle types yet. Open Event Settings and create at least one.',
  'eventcalc.no_bundles_yet': 'No bundles yet. Click “Add bundle” to get started.',

  'eventcalc.table.dish': 'Dish',
  'eventcalc.table.modifier_n': 'Modifier {n}',
  'eventcalc.table.qty': 'Qty',
  'eventcalc.table.cost': 'Cost',
  'eventcalc.table.price': 'Price',
  'eventcalc.table.totals': 'Totals',
  'eventcalc.table.required': 'Required',
  'eventcalc.table.item_out_of_scope': 'Item not in this bundle category',
  'eventcalc.table.add_modifier_to_row': 'Add modifier to this row',
  'eventcalc.table.add_row': 'Add row',
  'eventcalc.table.remove_row': 'Remove row',
  'eventcalc.loading_items': 'Loading items…',
  'eventcalc.select_item': 'Select item',
  'eventcalc.add_row_title': 'Add new row',

  // Bundle totals
  'eventcalc.bundle_totals.title': 'Bundle totals',
  'eventcalc.bundle_totals.qty': 'Qty:',
  'eventcalc.bundle_totals.cost': 'Cost:',
  'eventcalc.bundle_totals.price': 'Price:',

  // Wizard
  'eventcalc.wizard.choose_type': 'Choose bundle type',
  'eventcalc.wizard.configure': 'Configure {label}',
  'eventcalc.wizard.select_to_add': 'Select to add rows with base dish and required modifiers.',
  'eventcalc.wizard.no_types': 'No bundle types yet. Open Event Settings and create at least one.',
  'eventcalc.wizard.add_row': 'Add row',
  'eventcalc.wizard.add_bundle': 'Add bundle',

  // Summary – extra plain labels
  'New event': 'New event',
  'Margin %': 'Margin %',
  'Margin': 'Margin',
  'Cost %': 'Cost %',
  'Service hours': 'Service hours',
  'Δ vs budget': 'Δ vs budget',
  Equipment: 'Equipment',
  Transport: 'Transport',
  'Company assets': 'Company assets',
  'Extra fee': 'Extra fee',

  // Time suffix
  hours: 'hours',
  /* ===== Contract Template ===== */
'contractTpl.importDocx': 'Import DOCX…',

/* ===== Common (aggiunte per Contract Template) ===== */
'common.saving': 'Saving…',
'common.profile': 'Profile',
'common.event': 'Event',
'common.insert': 'Insert',
/* ===== LeftNav ===== */
EventCalculator: 'Event Calculator',
EventSettings: 'Event Settings',
} as const

export default en
export type ECKeys = keyof typeof en