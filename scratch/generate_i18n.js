const fs = require('fs');
const path = require('path');

const i18nPath = 'src/lib/i18n.ts';
const missingKeysFile = 'scratch/missing_keys_output.txt';

if (!fs.existsSync(missingKeysFile)) {
  console.error('missing_keys_output.txt not found.');
  process.exit(1);
}

// 1. Read missing keys
const missingKeysContent = fs.readFileSync(missingKeysFile, 'utf8');
const missingKeys = [];
const lines = missingKeysContent.split('\n');
let parsingKeys = false;
for (const line of lines) {
  if (line.includes('Candidates for missing keys in i18n.ts:')) {
    parsingKeys = true;
    continue;
  }
  if (parsingKeys && line.startsWith('- ')) {
    const parts = line.split(':');
    const key = parts[0].substring(2).trim();
    if (key && key !== '0' && key !== 'a') {
      missingKeys.push(key);
    }
  }
}
console.log(`Found ${missingKeys.length} missing keys in checklist.`);

// 2. Load already reconstructed keys
let reconEn = {};
let reconVi = {};
try {
  reconEn = JSON.parse(fs.readFileSync('scratch/reconstructed_en.json', 'utf8'));
  reconVi = JSON.parse(fs.readFileSync('scratch/reconstructed_vi.json', 'utf8'));
} catch (e) {
  console.log('No reconstructed JSON files found, starting from scratch.');
}

// 3. Define specific manual overrides for complex keys
const manualEn = {
  ...reconEn,
  "AUD": "AUD",
  "EUR": "EUR",
  "GBP": "GBP",
  "SGD": "SGD",
  "THB": "THB",
  "USD": "USD",
  "VND": "VND",
  "T": "T",
  "All": "All",
  "Draft": "Draft",
  "Exclude": "Exclude",
  "Expenses": "Expenses",
  "Inflow": "Inflow",
  "Investing": "Investing",
  "Invoice": "Invoice",
  "Liability": "Liability",
  "Loss": "Loss",
  "Management": "Management",
  "NetProfit": "Net Profit",
  "Operating": "Operating",
  "Outflow": "Outflow",
  "Payment": "Payment",
  "Payroll": "Payroll",
  "Personal": "Personal",
  "Profitable": "Profitable",
  "Staff": "Staff",
  "Statutory": "Statutory",
  "Virtual": "Virtual",
  "Wallet": "Wallet",
  "Wastage": "Wastage",
  "account_id": "Account ID",
  "accountant": "Accountant",
  "add": "Add",
  "app_accounts": "Accounts",
  "app_settings": "App Settings",
  "archived_at": "Archived At",
  "branch_id": "Branch ID",
  "cashier_closings": "Cashier Closings",
  "cashout": "Cash Out",
  "cashout_uncategorized": "Uncategorized Cash Out",
  "category": "Category",
  "charge_target": "Charge Target",
  "code": "Code",
  "cogs_unassigned": "Unassigned COGS",
  "corporate_card_expense_id": "Corporate Card Expense ID",
  "cost_per_unit_vnd": "Unit Cost (VND)",
  "created_at": "Created At",
  "credit_payments": "Credit Payments",
  "deleted_at": "Deleted At",
  "deposit_payments": "Deposit Payments",
  "dish": "Dish",
  "email": "Email",
  "equal": "Equal",
  "exact": "Exact",
  "expense_date": "Expense Date",
  "extract": "Extract",
  "fin_bank_accounts": "Bank Accounts",
  "fin_bank_transactions": "Bank Transactions",
  "fin_cashout_category_mapping": "Cashout Mapping",
  "fin_chart_of_accounts": "Chart of Accounts",
  "fin_corporate_card_expenses": "Corporate Card Expenses",
  "fin_inventory_category_mapping": "Inventory Mapping",
  "fin_inventory_records": "Inventory Records",
  "fin_invoices": "Invoices",
  "fin_monthly_adjustments": "Monthly Adjustments",
  "fin_monthly_balances": "Monthly Balances",
  "fin_payment_order_items": "Payment Order Items",
  "fin_payment_orders": "Payment Orders",
  "fin_pnl_allocation_settings": "P&L Allocation Settings",
  "fin_revenue_channel_mapping": "Revenue Channel Mapping",
  "fin_tax_settings": "Tax Settings",
  "final_list_vw": "Final List",
  "final_recipe": "Final Recipe",
  "final_recipes": "Final Recipes",
  "interest": "Interest",
  "invoice_date": "Invoice Date",
  "invoice_id": "Invoice ID",
  "is": "Is",
  "is_active": "Active",
  "is_paid": "Paid",
  "item_type": "Item Type",
  "manual": "Manual",
  "material": "Material",
  "materials": "Materials",
  "month_key": "Month Key",
  "mpos": "mPOS",
  "name": "Name",
  "owner": "Owner",
  "payment_order": "Payment Order",
  "prep": "Prep",
  "prep_recipe": "Prep Recipe",
  "prep_recipes": "Prep Recipes",
  "provider_branches": "Provider Branches",
  "report_date": "Report Date",
  "requires_invoice": "Requires Invoice",
  "revenue": "Revenue",
  "role": "Role",
  "settings": "Settings",
  "sort_order": "Sort Order",
  "status": "Status",
  "subtract": "Subtract",
  "third_party": "Third Party",
  "transaction_date": "Transaction Date",
  "type": "Type",
  "unassigned_bank_fee": "Unassigned Bank Fee",
  "unassigned_invoice": "Unassigned Invoice",
  "unassigned_po": "Unassigned Payment Order",
  "unit": "Unit",
  "unit_cost": "Unit Cost",
  "uom": "UOM",
  "uom_id": "UOM ID",
  "wastage_entries": "Wastage Entries",
  
  // Sidebar/Dashboard
  "FinanceDashboardTitle": "Finance Dashboard",
  "FinanceInvoices": "VAT Invoices",
  "FinancePaymentOrders": "Payment Orders",
  "FinanceCorporateCard": "Corporate Card",
  "FinanceTreasury": "Treasury Accounts",
  "FinanceCalendar": "Payment Calendar",
  "FinanceClosingStock": "Closing Stock",
  "FinanceMonthlyAdjustments": "Monthly Adjustments",
  "FinancePnLReport": "P&L Report",
  "FinanceCashFlow": "Cash Flow",
  "FinanceSettings": "Finance Settings",
  "FinanceSubtitle": "Manage your financial accounts, transactions, and reports.",
  
  // Specific alerts & text
  "FinAccAlertBranchMissingDetails": "Branch {name} has missing bank details. Standard details synchronized automatically.",
  "FinAccAlertDeleteAccountConfirm": "Are you sure you want to delete this account? All associated transaction history will be permanently deleted.",
  "FinAccAlertFailed": "Action failed:",
  "FinAccAlertNameRequired": "Account name is required.",
  "FinCCAlertDeleteConfirm": "Are you sure you want to delete this card expense?",
  "FinCCAlertDeleteFailed": "Failed to delete card expense.",
  "FinCCAlertSaveFailed": "Failed to save card expense.",
  "FinCCAlertSkipFailed": "Failed to skip occurrence.",
  "FinCFNotEnoughData": "Not enough data to display cash flow chart.",
  "FinCSAccessDenied": "Access denied. Only owners and accountants can access closing stock.",
  "FinCSAlertMissingCost": "Some items are missing unit cost. Please update them before saving.",
  "FinCSSelectBranchWarning": "Please select a branch to view closing stock items.",
  "FinCalAlertDismissError": "Failed to dismiss reminder.",
  "FinCalAlertRequiredFields": "Please fill in all required fields.",
  "FinCalAlertSaveFailed": "Failed to save reminder.",
  "FinGLInitError": "Failed to initialize opening balances.",
  "FinInvDeleteConfirm": "Are you sure you want to delete this invoice?",
  "FinInvIncongruenceWarn": "Warning: Linked payments total does not match the invoice gross amount.",
  "FinInvLinkPriorPaymentsDesc": "Link existing payment orders or cash out records to this invoice.",
  "FinInvNoUnlinkedPayments": "No unlinked payments found for this supplier.",
  "FinInvPersonalExpenseDesc": "Paid with personal funds. Included in statutory P&L, excluded from operational cash flow.",
  "FinMAAccessDenied": "Access denied. Only owners and accountants can access monthly adjustments.",
  "FinMAAlertValidAccountAmount": "Please select a valid account and enter a valid amount.",
  "FinMAExtractNotice": "Adjustments marked as cash flow impact will update treasury balances.",
  "FinMAExtractToggle": "Affects Cash Flow / Treasury",
  "FinMAOnlyOwnersAccountants": "Only owners and accountants can perform monthly adjustments.",
  "FinMASaveError": "Failed to save monthly adjustments.",
  "FinMASavedSuccess": "Monthly adjustments saved successfully.",
  "FinRCSaveError": "Failed to save revenue channel mapping.",
  "FinRCRoutingHowDepDesc": "How deposits from this revenue channel are routed to treasury wallets.",
  "FinRCRoutingHowDestDesc": "The destination treasury account where settled funds are deposited.",
  "FinRCRoutingHowSettleDesc": "The settlement delay and weekend rules applied by the payment gateway.",
  "FinSetPnLErrorLoading": "Failed to load P&L settings.",
  "FinSetPnLSaveError": "Failed to save P&L settings.",
  "FinSetPnLSaveSuccess": "P&L settings saved successfully.",
  "FinTaxAlertRequired": "Please select a valid account and enter a valid percentage.",
  "FinTaxConfirmDelete": "Are you sure you want to delete this tax rule?",
  "FinTaxHowFormulaRev": "Revenue deductions are calculated as a percentage of gross sales.",
  "FinTaxHowFormulaTax": "Tax expenses are calculated based on net taxable income.",
  "FinGLStartDateLabel": "Start Date",
  "FinGLExampleDate": "Example: 01/06/2026",
  "FinGLConfirmInitialize": "Settings saved!\\n\\nDo you want to automatically calculate and initialize the Opening Balances for all accounts?",
  "FinGLSavedNoInit": "Settings saved without initializing balances.",
  "FinGLSavedSuccess": "Settings saved successfully!",
  "FinGLSaveFailed": "Failed to save settings: ",
  "FinGLNoCashAccounts": "No cash accounts found.",
  "FinGLInitSuccess": "Successfully initialized opening balances for {count} accounts.",
  "FinCFTableCategory": "Category",
  "FinCFTableInflows": "Inflows",
  "FinCFTableOutflows": "Outflows",
  "FinCFTableNet": "Net Cash Flow",
  "FinCFCategoriesCount": "{n} Categories",
  "FinCFNoTransactions": "No transactions for this activity.",
  "FinCFNetChangeInCash": "Net Change in Cash",
  "FinCFReconciledClosing": "Reconciled Closing Balance",
  "FinCFUnreconciledDifference": "Unreconciled Difference",
  "FinCFReconciliationSuccess": "Reconciliation successful! Cash ledger matches treasury perfectly.",
  "FinCFReconciliationFail": "Reconciliation warning! Cash ledger differs by {diff}.",
  "FinCFStat1": "1. Cash from customers",
  "FinCFStat2": "2. Cash paid to suppliers",
  "FinCFStat3": "3. Cash paid to employees",
  "FinCFStat4": "4. Interest paid",
  "FinCFStat5": "5. Corporate income tax paid",
  "FinCFStat6": "6. Other operating inflows",
  "FinCFStat7": "7. Other operating outflows",
  "FinCFDefaultCustomerDeposits": "Customer Deposits",
  "FinCFDefaultStaffRepayments": "Staff Repayments",
  "FinCFDefaultDailyPayouts": "Daily Payouts",
  "FinCFDefaultCashSales": "Cash Sales",
  "FinCFDefaultDigitalPayments": "Digital Payments",
  "FinCFDefaultCollections": "Collections",
  "FinCFDefaultCustomerDepositsInflow": "Customer Deposits",
  "FinAccModalDefaultCorpCard": "Set as Default Card",
  "FinAccModalDefaultCorpCardDesc": "Automatically select this account when creating new card expenses.",
  "FinAccModalSectionFinancials": "Balances & Fees",
  "FinAccModalCurrency": "Currency",
  "FinAccModalOpeningBalance": "Opening Balance",
  "FinAccModalOnlinePaymentFee": "Online Payment Fee",
  "FinAccModalBankTransferFee": "Bank Transfer Fee",
  "FinAccModalFeeCoaCategory": "Fee COA Category",
  "FinAccModalSelectCoaFeesPlaceholder": "— Select COA category for fees —",
  "FinAccModalCreateButton": "Create Account",
  "FinAccModalTxTitle": "Record Transaction",
  "FinAccModalTxInflow": "↓ Inflow",
  "FinAccModalTxOutflow": "↑ Outflow",
  "FinAccModalTxAmount": "Amount *",
  "FinAccModalTxDate": "Transaction Date",
  "FinAccModalTxCategory": "COA Category",
  "FinAccModalTxSelectCategoryPlaceholder": "— Select COA category —",
  "FinAccModalTxDescription": "Description",
  "FinAccModalTxRecordButton": "Record",
  "PendingVatInvoices": "Pending VAT Invoices",
  "NoPendingVatInvoices": "No pending VAT invoices",
  "FinInvNetAmountStar": "Net Amount *",
  "FinInvGrossTotal": "Gross Total",
  "FinInvDescription": "Description",
  "FinInvDone": "Done",
  "FinInvNotes": "Notes",
  "FinInvClear": "Clear",
  "FinInvSelectAll": "Select All",
  "FinInvSelectCategory": "Select Category",
  "FinInvSelectSupplierFirst": "Select Supplier First",
  "FinInvSelectedSuffix": "Selected",
  "FinInvShowAllPendingVat": "Show All Pending VAT",
  "FinInvStatusCancelled": "Cancelled",
  "FinInvStatusInPayment": "In Payment",
  "FinInvStatusOverdue": "Overdue",
  "FinInvStatusPaid": "Paid",
  "FinInvStatusPending": "Pending",
  "FinInvTransfer": "Transfer",
  "FinInvVatAmount": "VAT Amount",
  "FinInvVatRatePct": "VAT Rate (%)",
};

const manualVi = {
  ...reconVi,
  "AUD": "AUD",
  "EUR": "EUR",
  "GBP": "GBP",
  "SGD": "SGD",
  "THB": "THB",
  "USD": "USD",
  "VND": "VND",
  "T": "T",
  "All": "Tất cả",
  "Draft": "Bản nháp",
  "Exclude": "Loại trừ",
  "Expenses": "Chi phí",
  "Inflow": "Dòng tiền vào",
  "Investing": "Đầu tư",
  "Invoice": "Hóa đơn",
  "Liability": "Nợ phải trả",
  "Loss": "Lỗ",
  "Management": "Quản trị",
  "NetProfit": "Lợi nhuận ròng",
  "Operating": "Vận hành",
  "Outflow": "Dòng tiền ra",
  "Payment": "Thanh toán",
  "Payroll": "Lương",
  "Personal": "Cá nhân",
  "Profitable": "Có lãi",
  "Staff": "Nhân viên",
  "Statutory": "Pháp lý",
  "Virtual": "Ảo",
  "Wallet": "Ví",
  "Wastage": "Hao hụt",
  "account_id": "Mã tài khoản",
  "accountant": "Kế toán",
  "add": "Thêm",
  "app_accounts": "Tài khoản",
  "app_settings": "Cài đặt ứng dụng",
  "archived_at": "Lưu trữ lúc",
  "branch_id": "Mã chi nhánh",
  "cashier_closings": "Chốt ca thu ngân",
  "cashout": "Rút tiền",
  "cashout_uncategorized": "Rút tiền chưa phân loại",
  "category": "Danh mục",
  "charge_target": "Mục tiêu tính phí",
  "code": "Mã",
  "cogs_unassigned": "COGS chưa phân bổ",
  "corporate_card_expense_id": "Mã chi phí thẻ doanh nghiệp",
  "cost_per_unit_vnd": "Đơn giá (VND)",
  "created_at": "Tạo lúc",
  "credit_payments": "Thanh toán tín dụng",
  "deleted_at": "Xóa lúc",
  "deposit_payments": "Thanh toán đặt cọc",
  "dish": "Món",
  "email": "Email",
  "equal": "Bằng nhau",
  "exact": "Chính xác",
  "expense_date": "Ngày chi phí",
  "extract": "Chiết xuất",
  "fin_bank_accounts": "Tài khoản ngân hàng",
  "fin_bank_transactions": "Giao dịch ngân hàng",
  "fin_cashout_category_mapping": "Ánh xạ rút tiền",
  "fin_chart_of_accounts": "Hệ thống tài khoản",
  "fin_corporate_card_expenses": "Chi phí thẻ doanh nghiệp",
  "fin_inventory_category_mapping": "Ánh xạ kho",
  "fin_inventory_records": "Ghi chép kho",
  "fin_invoices": "Hóa đơn",
  "fin_monthly_adjustments": "Điều chỉnh hàng tháng",
  "fin_monthly_balances": "Số dư hàng tháng",
  "fin_payment_order_items": "Hạng mục lệnh chi",
  "fin_payment_orders": "Lệnh chi",
  "fin_pnl_allocation_settings": "Cài đặt phân bổ P&L",
  "fin_revenue_channel_mapping": "Ánh xạ kênh doanh thu",
  "fin_tax_settings": "Cài đặt thuế",
  "final_list_vw": "Danh sách cuối",
  "final_recipe": "Công thức cuối",
  "final_recipes": "Công thức cuối",
  "interest": "Lãi suất",
  "invoice_date": "Ngày hóa đơn",
  "invoice_id": "Mã hóa đơn",
  "is": "Là",
  "is_active": "Hoạt động",
  "is_paid": "Đã thanh toán",
  "item_type": "Loại hạng mục",
  "manual": "Thủ công",
  "material": "Nguyên liệu",
  "materials": "Nguyên liệu",
  "month_key": "Mã tháng",
  "mpos": "mPOS",
  "name": "Tên",
  "owner": "Chủ sở hữu",
  "payment_order": "Lệnh chi",
  "prep": "Sơ chế",
  "prep_recipe": "Công thức sơ chế",
  "prep_recipes": "Công thức sơ chế",
  "provider_branches": "Chi nhánh nhà cung cấp",
  "report_date": "Ngày báo cáo",
  "requires_invoice": "Cần hóa đơn",
  "revenue": "Doanh thu",
  "role": "Vai trò",
  "settings": "Cài đặt",
  "sort_order": "Thứ tự sắp xếp",
  "status": "Trạng thái",
  "subtract": "Trừ",
  "third_party": "Bên thứ ba",
  "transaction_date": "Ngày giao dịch",
  "type": "Loại",
  "unassigned_bank_fee": "Phí ngân hàng chưa phân bổ",
  "unassigned_invoice": "Hóa đơn chưa phân bổ",
  "unassigned_po": "Lệnh chi chưa phân bổ",
  "unit": "Đơn vị",
  "unit_cost": "Đơn giá",
  "uom": "Đơn vị tính",
  "uom_id": "Mã đơn vị tính",
  "wastage_entries": "Ghi nhận hao hụt",
  
  // Sidebar/Dashboard
  "FinanceDashboardTitle": "Bảng điều khiển Tài chính",
  "FinanceInvoices": "Hóa đơn VAT",
  "FinancePaymentOrders": "Lệnh chi",
  "FinanceCorporateCard": "Thẻ doanh nghiệp",
  "FinanceTreasury": "Tài khoản kho bạc",
  "FinanceCalendar": "Lịch thanh toán",
  "FinanceClosingStock": "Chốt kho",
  "FinanceMonthlyAdjustments": "Điều chỉnh hàng tháng",
  "FinancePnLReport": "Báo cáo P&L",
  "FinanceCashFlow": "Dòng tiền",
  "FinanceSettings": "Cài đặt Tài chính",
  "FinanceSubtitle": "Quản lý tài khoản tài chính, giao dịch và báo cáo.",
  
  // Specific alerts & text
  "FinAccAlertBranchMissingDetails": "Chi nhánh {name} thiếu chi tiết ngân hàng. Chi tiết tiêu chuẩn đã được đồng bộ tự động.",
  "FinAccAlertDeleteAccountConfirm": "Bạn có chắc chắn muốn xóa tài khoản này? Toàn bộ lịch sử giao dịch liên quan sẽ bị xóa vĩnh viễn.",
  "FinAccAlertFailed": "Thao tác thất bại:",
  "FinAccAlertNameRequired": "Vui lòng nhập tên tài khoản.",
  "FinCCAlertDeleteConfirm": "Bạn có chắc chắn muốn xóa chi phí thẻ này không?",
  "FinCCAlertDeleteFailed": "Xóa chi phí thẻ thất bại.",
  "FinCCAlertSaveFailed": "Lưu chi phí thẻ thất bại.",
  "FinCCAlertSkipFailed": "Không thể bỏ qua lần phát sinh này.",
  "FinCFNotEnoughData": "Không đủ dữ liệu để hiển thị biểu đồ dòng tiền.",
  "FinCSAccessDenied": "Truy cập bị từ chối. Chỉ chủ sở hữu và kế toán mới có thể truy cập chốt kho.",
  "FinCSAlertMissingCost": "Một số mặt hàng thiếu đơn giá. Vui lòng cập nhật trước khi lưu.",
  "FinCSSelectBranchWarning": "Vui lòng chọn chi nhánh để xem các mặt hàng chốt kho.",
  "FinCalAlertDismissError": "Không thể bỏ qua nhắc nhở.",
  "FinCalAlertRequiredFields": "Vui lòng điền đầy đủ các trường bắt buộc.",
  "FinCalAlertSaveFailed": "Lưu nhắc nhở thất bại.",
  "FinGLInitError": "Không thể khởi tạo số dư đầu kỳ.",
  "FinInvDeleteConfirm": "Bạn có chắc chắn muốn xóa hóa đơn này không?",
  "FinInvIncongruenceWarn": "Cảnh báo: Tổng số tiền thanh toán liên kết không khớp với tổng số tiền hóa đơn.",
  "FinInvLinkPriorPaymentsDesc": "Liên kết lệnh chi hoặc phiếu chi hiện có với hóa đơn này.",
  "FinInvNoUnlinkedPayments": "Không tìm thấy thanh toán chưa liên kết nào cho nhà cung cấp này.",
  "FinInvPersonalExpenseDesc": "Thanh toán bằng tiền cá nhân. Được bao gồm trong P&L pháp lý, loại trừ khỏi dòng tiền vận hành.",
  "FinMAAccessDenied": "Truy cập bị từ chối. Chỉ chủ sở hữu và kế toán mới có thể truy cập điều chỉnh hàng tháng.",
  "FinMAAlertValidAccountAmount": "Vui lòng chọn tài khoản hợp lệ và nhập số tiền hợp lệ.",
  "FinMAExtractNotice": "Các điều chỉnh được đánh dấu ảnh hưởng dòng tiền sẽ cập nhật số dư kho bạc.",
  "FinMAExtractToggle": "Ảnh hưởng Dòng tiền / Kho bạc",
  "FinMAOnlyOwnersAccountants": "Chỉ chủ sở hữu và kế toán mới có thể thực hiện điều chỉnh hàng tháng.",
  "FinMASaveError": "Lưu điều chỉnh hàng tháng thất bại.",
  "FinMASavedSuccess": "Đã lưu điều chỉnh hàng tháng thành công.",
  "FinRCSaveError": "Lưu ánh xạ kênh doanh thu thất bại.",
  "FinRCRoutingHowDepDesc": "Cách tiền đặt cọc từ kênh doanh thu này được chuyển đến ví kho bạc.",
  "FinRCRoutingHowDestDesc": "Tài khoản kho bạc đích nơi tiền thanh toán được gửi vào.",
  "FinRCRoutingHowSettleDesc": "Quy tắc đối soát và trễ thanh toán được áp dụng bởi cổng thanh toán.",
  "FinSetPnLErrorLoading": "Tải cài đặt P&L thất bại.",
  "FinSetPnLSaveError": "Lưu cài đặt P&L thất bại.",
  "FinSetPnLSaveSuccess": "Lưu cài đặt P&L thành công.",
  "FinTaxAlertRequired": "Vui lòng chọn tài khoản hợp lệ và nhập tỷ lệ phần trăm hợp lệ.",
  "FinTaxConfirmDelete": "Bạn có chắc chắn muốn xóa quy tắc thuế này không?",
  "FinTaxHowFormulaRev": "Khấu trừ doanh thu được tính theo phần trăm doanh số gộp.",
  "FinTaxHowFormulaTax": "Chi phí thuế được tính dựa trên thu nhập chịu thuế ròng.",
  "FinGLStartDateLabel": "Ngày bắt đầu",
  "FinGLExampleDate": "Ví dụ: 01/06/2026",
  "FinGLConfirmInitialize": "Cài đặt đã lưu!\\n\\nBạn có muốn tự động tính toán và khởi tạo Số dư đầu kỳ cho tất cả các tài khoản?",
  "FinGLSavedNoInit": "Cài đặt đã lưu mà không khởi tạo số dư.",
  "FinGLSavedSuccess": "Cài đặt đã lưu thành công!",
  "FinGLSaveFailed": "Lưu cài đặt thất bại: ",
  "FinGLNoCashAccounts": "Không tìm thấy tài khoản tiền mặt.",
  "FinGLInitSuccess": "Đã khởi tạo thành công số dư đầu kỳ cho {count} tài khoản.",
  "FinCFTableCategory": "Danh mục",
  "FinCFTableInflows": "Dòng tiền vào",
  "FinCFTableOutflows": "Dòng tiền ra",
  "FinCFTableNet": "Dòng tiền thuần",
  "FinCFCategoriesCount": "{n} Danh mục",
  "FinCFNoTransactions": "Không có giao dịch nào cho hoạt động này.",
  "FinCFNetChangeInCash": "Thay đổi tiền thuần",
  "FinCFReconciledClosing": "Số dư cuối kỳ đã đối chiếu",
  "FinCFUnreconciledDifference": "Chênh lệch chưa đối chiếu",
  "FinCFReconciliationSuccess": "Đối chiếu thành công! Sổ quỹ khớp hoàn hảo.",
  "FinCFReconciliationFail": "Cảnh báo đối chiếu! Sổ quỹ lệch {diff}.",
  "FinCFStat1": "1. Tiền thu từ khách hàng",
  "FinCFStat2": "2. Tiền chi cho nhà cung cấp",
  "FinCFStat3": "3. Tiền chi cho nhân viên",
  "FinCFStat4": "4. Tiền lãi đã trả",
  "FinCFStat5": "5. Thuế TNDN đã nộp",
  "FinCFStat6": "6. Dòng tiền vào hoạt động khác",
  "FinCFStat7": "7. Dòng tiền ra hoạt động khác",
  "FinCFDefaultCustomerDeposits": "Tiền đặt cọc khách hàng",
  "FinCFDefaultStaffRepayments": "Nhân viên hoàn ứng",
  "FinCFDefaultDailyPayouts": "Chi trả hàng ngày",
  "FinCFDefaultCashSales": "Doanh thu tiền mặt",
  "FinCFDefaultDigitalPayments": "Thanh toán kỹ thuật số",
  "FinCFDefaultCollections": "Thu hồi công nợ",
  "FinCFDefaultCustomerDepositsInflow": "Nhận đặt cọc khách hàng",
  "FinAccModalDefaultCorpCard": "Đặt làm thẻ mặc định",
  "FinAccModalDefaultCorpCardDesc": "Tự động chọn tài khoản này khi tạo khoản chi tiêu thẻ mới.",
  "FinAccModalSectionFinancials": "Số dư & Biểu phí",
  "FinAccModalCurrency": "Đơn vị tiền tệ",
  "FinAccModalOpeningBalance": "Số dư đầu kỳ",
  "FinAccModalOnlinePaymentFee": "Phí thanh toán online",
  "FinAccModalBankTransferFee": "Phí chuyển khoản ngân hàng",
  "FinAccModalFeeCoaCategory": "Tài khoản phí COA",
  "FinAccModalSelectCoaFeesPlaceholder": "— Chọn danh mục COA cho phí —",
  "FinAccModalCreateButton": "Tạo tài khoản",
  "FinAccModalTxTitle": "Ghi nhận giao dịch",
  "FinAccModalTxInflow": "↓ Nhập quỹ",
  "FinAccModalTxOutflow": "↑ Xuất quỹ",
  "FinAccModalTxAmount": "Số tiền *",
  "FinAccModalTxDate": "Ngày giao dịch",
  "FinAccModalTxCategory": "Danh mục COA",
  "FinAccModalTxSelectCategoryPlaceholder": "— Chọn danh mục COA —",
  "FinAccModalTxDescription": "Mô tả",
  "FinAccModalTxRecordButton": "Ghi sổ",
  "PendingVatInvoices": "Hóa đơn VAT đang chờ",
  "NoPendingVatInvoices": "Không có hóa đơn VAT đang chờ",
  "FinInvNetAmountStar": "Số tiền Net *",
  "FinInvGrossTotal": "Tổng cộng gộp",
  "FinInvDescription": "Mô tả",
  "FinInvDone": "Đã xong",
  "FinInvNotes": "Ghi chú",
  "FinInvClear": "Xóa lọc",
  "FinInvSelectAll": "Chọn tất cả",
  "FinInvSelectCategory": "Chọn danh mục",
  "FinInvSelectSupplierFirst": "Chọn nhà cung cấp trước",
  "FinInvSelectedSuffix": "đã chọn",
  "FinInvShowAllPendingVat": "Hiện tất cả VAT đang chờ",
  "FinInvStatusCancelled": "Đã hủy",
  "FinInvStatusInPayment": "Đang thanh toán",
  "FinInvStatusOverdue": "Quá hạn",
  "FinInvStatusPaid": "Đã thanh toán",
  "FinInvStatusPending": "Đang chờ",
  "FinInvTransfer": "Chuyển khoản",
  "FinInvVatAmount": "Số tiền VAT",
  "FinInvVatRatePct": "Thuế suất VAT (%)",
};

// Vietnamese word mapping for simple labels
const viWordMap = {
  "account": "tài khoản",
  "accounts": "tài khoản",
  "active": "hoạt động",
  "add": "thêm",
  "new": "mới",
  "edit": "sửa",
  "delete": "xóa",
  "cancel": "hủy",
  "save": "lưu",
  "confirm": "xác nhận",
  "close": "đóng",
  "create": "tạo",
  "update": "cập nhật",
  "search": "tìm kiếm",
  "export": "xuất",
  "import": "nhập",
  "status": "trạng thái",
  "date": "ngày",
  "amount": "số tiền",
  "description": "mô tả",
  "category": "danh mục",
  "supplier": "nhà cung cấp",
  "branch": "chi nhánh",
  "branches": "chi nhánh",
  "invoices": "hóa đơn",
  "invoice": "hóa đơn",
  "payments": "thanh toán",
  "payment": "thanh toán",
  "orders": "lệnh chi",
  "order": "lệnh chi",
  "settings": "cài đặt",
  "calendar": "lịch",
  "stock": "chốt kho",
  "adjustments": "điều chỉnh",
  "adjustment": "điều chỉnh",
  "report": "báo cáo",
  "reports": "báo cáo",
  "cash": "tiền mặt",
  "flow": "dòng tiền",
  "card": "thẻ",
  "corporate": "doanh nghiệp",
  "bank": "ngân hàng",
  "fee": "phí",
  "fees": "phí",
  "inflow": "tiền vào",
  "outflow": "tiền ra",
  "opening": "đầu kỳ",
  "closing": "cuối kỳ",
  "balance": "số dư",
  "treasury": "kho bạc",
  "position": "vị thế",
  "total": "tổng",
  "channel": "kênh",
  "wallet": "ví",
  "checking": "vãng lai",
  "saving": "tiết kiệm",
  "capital": "vốn",
  "equity": "vốn chủ sở hữu",
  "liability": "nợ phải trả",
  "asset": "tài sản",
  "revenue": "doanh thu",
  "expenses": "chi phí",
  "expense": "chi phí",
  "profit": "lợi nhuận",
  "loss": "lỗ",
  "tax": "thuế",
  "taxes": "thuế",
  "vat": "VAT",
  "reminder": "nhắc nhở",
  "reminders": "nhắc nhở",
  "expected": "dự kiến",
  "pending": "đang chờ",
  "approved": "đã duyệt",
  "cancelled": "đã hủy",
  "paid": "đã thanh toán",
  "unpaid": "chưa thanh toán",
  "overdue": "quá hạn",
  "draft": "bản nháp",
  "golive": "kích hoạt",
  "live": "trực tiếp",
  "simulator": "mô phỏng",
  "simulators": "mô phỏng",
  "all": "tất cả",
  "action": "hành động",
  "actions": "thao tác",
  "center": "trung tâm",
  "attention": "chú ý",
  "caught": "hoàn thành",
  "up": "tất cả",
  "items": "hạng mục",
  "requiring": "cần",
  "button": "nút",
  "number": "số",
  "name": "tên",
  "placeholder": "nội dung...",
  "prompt": "yêu cầu",
  "tab": "thẻ",
  "count": "số lượng",
  "currency": "tiền tệ",
  "converted": "quy đổi",
  "ex": "tỷ giá",
  "rate": "tỷ giá",
  "unassigned": "chưa phân bổ",
  "variable": "biến động",
  "projection": "dự báo",
  "reconciled": "đối chiếu",
  "difference": "chênh lệch",
  "success": "thành công",
  "fail": "thất bại",
  "warning": "cảnh báo",
  "customer": "khách hàng",
  "deposits": "tiền đặt cọc",
  "repayments": "hoàn trả",
  "payouts": "chi trả",
  "sales": "doanh thu",
  "digital": "kỹ thuật số",
  "collections": "thu hồi",
  "unlinked": "chưa liên kết",
  "prior": "trước đó",
  "formula": "công thức",
  "strategy": "chiến lược",
  "exception": "ngoại lệ",
  "exceptions": "ngoại lệ",
  "duplicate": "trùng lặp",
  "equal": "bằng nhau",
  "parts": "phần",
  "override": "ghi đè",
  "percentage": "phần trăm",
  "remove": "xóa bỏ",
  "routing": "định tuyến",
  "delay": "độ trễ",
  "skip": "bỏ qua",
  "weekends": "cuối tuần",
  "how": "hướng dẫn",
  "destination": "đích",
  "settle": "đối soát",
  "gross": "gộp",
  "net": "ròng",
  "simulated": "mô phỏng",
  "comparing": "so sánh",
  "regime": "chế độ",
  "regimes": "chế độ",
  "estimated": "ước tính",
  "savings": "tiết kiệm",
  "verdict": "kết luận",
  "cheaper": "rẻ hơn",
  "activity": "hoạt động",
  "quarterly": "hàng quý",
  "annual": "hàng năm",
  "breakdown": "chi tiết",
  "deduction": "khấu trừ",
  "deductions": "khấu trừ",
  "aud": "AUD",
  "eur": "EUR",
  "gbp": "GBP",
  "sgd": "SGD",
  "thb": "THB",
  "usd": "USD",
  "vnd": "VND",
  "star": "*",
  "view": "xem",
  "caughtup": "hoàn thành tất cả",
  "clear": "xóa lọc",
  "done": "xong",
  "unreconciled": "chưa đối chiếu",
  "notes": "ghi chú",
  "feeslabel": "biểu phí",
  "unassignedselectlater": "chưa phân bổ (chọn sau)",
  "commission": "hoa hồng",
  "settlement": "đối soát",
  "target": "đích",
  "allocation": "phân bổ",
  "wastage": "hao hụt",
  "cogs": "COGS",
  "coas": "COA",
  "coa": "COA",
  "pos": "đơn hàng",
  "po": "lệnh chi",
  "pit": "thuế TNCN",
  "receivables": "khoản phải thu",
  "payables": "khoản phải trả",
  "debt": "công nợ"
};

// 4. Fallback translation functions using CamelCase splitting
function splitCamelCase(str) {
  // Remove prefixes
  let s = str;
  const prefixes = [
    'FinAccModalTxSelectCategory', 'FinAccModalTxSelect', 'FinAccModalTx', 'FinAccModal', 'FinAccTab', 'FinAccAlert', 'FinAcc',
    'FinCCModal', 'FinCCCol', 'FinCCAlert', 'FinCCDelModal', 'FinCC',
    'FinCFDefault', 'FinCFTable', 'FinCF',
    'FinCSCol', 'FinCSAlert', 'FinCS',
    'FinCalAlert', 'FinCalModal', 'FinCal',
    'FinGL',
    'FinInvStatus', 'FinInv',
    'FinMAAlert', 'FinMATable', 'FinMA',
    'FinPayStatus', 'FinPay',
    'FinPnLDrilldownTransactions', 'FinPnLDrilldown', 'FinPnLUnassigned', 'FinPnLUncategorized', 'FinPnL',
    'FinRCModal', 'FinRCRoutingHow', 'FinRCStatus', 'FinRC',
    'FinSetPnLTable', 'FinSetPnL',
    'FinTaxModal', 'FinTaxCol', 'FinTax',
    'FinanceSettings', 'Finance'
  ];
  for (const prefix of prefixes) {
    if (s.startsWith(prefix)) {
      s = s.substring(prefix.length);
      break;
    }
  }
  
  if (!s) return '';
  
  // Split camel case
  return s.replace(/([A-Z])/g, ' $1').trim();
}

function translateEn(key) {
  if (manualEn[key]) return manualEn[key];
  
  const words = splitCamelCase(key);
  if (!words) return key;
  
  // Handle some specific formatting
  return words;
}

function translateVi(key) {
  if (manualVi[key]) return manualVi[key];
  
  const words = splitCamelCase(key);
  if (!words) return key;
  
  const splitWords = words.toLowerCase().split(/\s+/);
  const viWords = splitWords.map(w => {
    return viWordMap[w] || w;
  });
  
  // Capitalize first letter
  const result = viWords.join(' ');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// 5. Generate final translation maps for all missing keys
const enGenerated = {};
const viGenerated = {};

missingKeys.forEach(key => {
  enGenerated[key] = translateEn(key);
  viGenerated[key] = translateVi(key);
});

// 6. Merge with existing src/lib/i18n.ts
let i18nContent = fs.readFileSync(i18nPath, 'utf8');

// We need to parse i18nContent and add our generated keys into the 'en:' and 'vi:' blocks.
// Let's locate the 'en' dictionary block and the 'vi' dictionary block.
// In the current file, 'en' starts at line 5 and ends at line 914.
// Let's split the file into 3 parts:
// Part 1: before 'en: {' block
// Part 2: inside 'en: {' block
// Part 3: after 'en: {' block but before 'vi: {' block
// Part 4: inside 'vi: {' block
// Part 5: after 'vi: {' block

// Let's search for the exact sections:
// en: {
//    ...
//    FinDsbPaymentOrder: 'Payment Order',
// },
// vi: {
//    ...
//    FinDsbPaymentOrder: 'Lệnh chi',
// },

// We can simply find where "FinDsbPaymentOrder: 'Payment Order'," is, and insert our keys after it!
// Similarly for "FinDsbPaymentOrder: 'Lệnh chi',".

const enMarker = "FinDsbPaymentOrder: 'Payment Order',";
const viMarker = "FinDsbPaymentOrder: 'Lệnh chi',";

if (!i18nContent.includes(enMarker) || !i18nContent.includes(viMarker)) {
  console.error("Could not find insertion markers in src/lib/i18n.ts. Let's inspect the markers.");
  // Let's do a search for the last keys of en/vi blocks.
  // In the file we read earlier:
  // en ends with:
  //     PaymentsAwaitingInvoice: 'Payments Awaiting Invoice',
  //     NoPaymentsAwaitingInvoice: 'No payments awaiting invoice',
  //     FinDsbPaymentOrder: 'Payment Order',
  //   },
  // vi ends with:
  //     PaymentsAwaitingInvoice: 'Thanh toán chờ hóa đơn',
  //     NoPaymentsAwaitingInvoice: 'Không có thanh toán nào chờ hóa đơn',
  //     FinDsbPaymentOrder: 'Lệnh chi',
  //   },
}

let enInsertions = '';
Object.entries(enGenerated).forEach(([k, v]) => {
  enInsertions += `    ${k}: ${JSON.stringify(v)},\n`;
});

let viInsertions = '';
Object.entries(viGenerated).forEach(([k, v]) => {
  viInsertions += `    ${k}: ${JSON.stringify(v)},\n`;
});

// Let's insert into the string!
let newContent = i18nContent;

newContent = newContent.replace(enMarker, `${enMarker}\n${enInsertions}`);
newContent = newContent.replace(viMarker, `${viMarker}\n${viInsertions}`);

fs.writeFileSync(i18nPath, newContent);
console.log('Reinserted missing keys into src/lib/i18n.ts');

// Run clean-up for duplicates
console.log('De-duplicating...');
const cleanupScript = `
const fs = require('fs');
let fileContent = fs.readFileSync('src/lib/i18n.ts', 'utf8');

// Find all key declarations in en block and vi block and deduplicate them
// en block starts at "en: {" and ends at the first "},"
// vi block starts at "vi: {" and ends at the next "},"

const enStartIndex = fileContent.indexOf('en: {');
const viStartIndex = fileContent.indexOf('vi: {', enStartIndex + 5);

const enEndIndex = fileContent.indexOf('},', enStartIndex);
const viEndIndex = fileContent.indexOf('},', viStartIndex);

const enBlock = fileContent.substring(enStartIndex + 5, enEndIndex);
const viBlock = fileContent.substring(viStartIndex + 5, viEndIndex);

function parseBlockToMap(block) {
  const map = {};
  const lines = block.split('\\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) return;
    const key = trimmed.substring(0, colonIndex).trim();
    const val = trimmed.substring(colonIndex + 1).trim();
    // Keep first definition
    if (!map[key]) {
      map[key] = val;
    }
  });
  return map;
}

const enMap = parseBlockToMap(enBlock);
const viMap = parseBlockToMap(viBlock);

let newEnBlock = '\\n';
Object.entries(enMap).forEach(([k, v]) => {
  newEnBlock += '    ' + k + ': ' + v + '\\n';
});

let newViBlock = '\\n';
Object.entries(viMap).forEach(([k, v]) => {
  newViBlock += '    ' + k + ': ' + v + '\\n';
});

let updatedContent = fileContent.substring(0, enStartIndex + 5) + newEnBlock + fileContent.substring(enEndIndex, viStartIndex + 5) + newViBlock + fileContent.substring(viEndIndex);
fs.writeFileSync('src/lib/i18n.ts', updatedContent);
console.log('Deduplication completed successfully!');
`;

fs.writeFileSync('scratch/cleanup_duplicates.js', cleanupScript);
console.log('Cleanup script generated.');
