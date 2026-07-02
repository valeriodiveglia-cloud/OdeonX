const fs = require('fs');
const path = require('path');

const enFixes = {
  FinAccTitle: "Treasury Accounts",
  FinAccSubtitle: "Manage your bank accounts and cash on hand.",
  FinAccAddAccountButton: "Add Account",
  FinAccAddTransactionButton: "Record Transaction",
  FinAccModalTitleAdd: "Add Account",
  FinAccModalTitleEdit: "Edit Account",

  FinCFTitle: "Cash Flow",
  FinCFSubtitle: "Track cash inflows and outflows across all business operations.",
  
  FinInvTitle: "VAT Invoices",
  FinInvSubtitle: "Manage supplier VAT invoices and link them to payments.",

  FinMATitle: "Monthly Adjustments",
  FinMASubtitle: "Record manual adjustments for end of month reporting.",
  FinMASaveAdjustmentsButton: "Save Adjustments",

  FinPayTitle: "Payment Orders",
  FinPaySubtitle: "Track and manage non-invoice payments.",
  
  FinPnLTitle: "P&L Report",
  FinPnLSubtitle: "Profit and loss statements and financial performance.",
  
  FinCSTitle: "Closing Stock",
  FinCSSubtitle: "Record end of month inventory values for cost of goods sold.",
  
  FinRCRoutingHowTitle: "How it works",
  
  FinSetPnLTitle: "P&L Settings",
  FinSetPnLSubtitle: "Configure category mapping and calculation strategies.",
  FinSetPnLSaveButton: "Save",
  
  FinTaxTitle: "Taxes Configuration",
  FinTaxSubtitle: "Manage tax rates and rules.",
  FinTaxAddTaxButton: "Add Tax Rule",
  FinTaxModalTitleAdd: "Add Tax Rule",
  FinTaxModalTitleEdit: "Edit Tax Rule",
  FinTaxModalAddButton: "Add",

  FinCalTitle: "Payment Calendar",
  FinCalSubtitle: "Schedule and track recurring expenses and reminders.",
  FinCalNewReminderButton: "New Reminder",
  FinCalModalTitle: "Reminder Details",
  FinCalModalSaveButton: "Save",

  FinCCDelModalTitle: "Delete Expense",
  FinCCAddExpenseButton: "Add Expense",

  FinRCModalTitle: "Configure Channel",
  
  FinAccModalSectionGeneral: "General Information",
  FinAccModalSectionFinancials: "Financials",
  FinAccModalSectionBank: "Bank Details",
  FinAccModalSectionCorpCard: "Corporate Card Settings",
  
  FinCalCorporateCardSection: "Corporate Cards",
  FinCalInvoicesSection: "Invoices",
  FinCalRemindersSection: "Reminders",
  
  FinAccModalSubtitle: "Enter the details for this treasury account.",
  FinCFDrilldownTitle: "Transactions Detail",
  FinCFTrendTitle: "Cash Flow Trend",
  FinCFWaterfallTitle: "Cash Flow Waterfall",
  FinGLSectionTitle: "General Ledger Settings",
  FinGLSubtitle: "Configure how your chart of accounts initializes.",
  FinGLTitle: "General Ledger",
  
  FinCCDelModalDesc: "Are you sure you want to delete this expense?",
  FinCCDelModalDelSeriesDesc: "Delete all future occurrences of this recurring expense.",
  FinCCDelModalSkipOccurDesc: "Skip the current occurrence only.",
  FinCCModalOnlinePaymentDesc: "Automatically pay through the payment gateway.",
  FinCCModalVariableAmountDesc: "Amount varies per period.",
  
  FinAccModalCanUseCorpCardDesc: "Allow this account to be used for corporate card expenses.",
  FinAccModalDefaultCorpCardDesc: "Set as the default account for corporate card expenses.",
  FinPnLStatutoryDesc: "Statutory profit and loss for tax purposes.",
  
  FinRCModalCashflowCoaDesc: "The COA category assigned when money hits the bank.",
  FinRCModalEnableRoutingDesc: "Enable automatic routing of deposits.",
  FinRCModalSettlementDelayDesc: "Number of days before funds settle.",
  
  FinSetPnLCategoryExceptionsDesc: "Override the default P&L strategy for specific categories.",
  FinSetPnLCategoryExceptionsTitle: "Category Exceptions",
  FinSetPnLEqualPartsDesc: "Split the cost equally over a period of months.",
  FinSetPnLGlobalStrategyTitle: "Global Strategy",
  FinSetPnLRevReconDesc: "Revenue reconciliation settings.",
  FinSetPnLRevReconTitle: "Revenue Reconciliation",
  FinSetPnLRevenuePercentageDesc: "Recognize a percentage of revenue immediately.",
  
  FinTaxHowFormulaRev: "Revenue deductions are calculated as a percentage of gross sales.",
  FinTaxHowFormulaTax: "Tax expenses are calculated based on net taxable income.",
  FinTaxHowTitle: "How Taxes Work",
  
  FinanceSettingsSubtitle: "Configure modules, tax rules, and general ledger accounts.",
  FinanceSettingsTitle: "Finance Settings",

  FinCalModalNotesPlaceholder: "Add some notes here...",
  FinCalModalTitleLabel: "Title",
  FinCalModalTitlePlaceholder: "E.g., Internet bill",
  
  FinCFDefaultCustomerDepositsInflow: "Customer Deposits",
  FinInvStatus: "Status",
  FinPayStatus: "Status",
  FinRCColStatus: "Status",
  FinTaxColStatus: "Status",
  
  FinInvInvoiceDateStar: "Invoice Date *",
  FinInvInvoiceNumberStar: "Invoice Number *",
  FinInvNetAmountStar: "Net Amount *",
  FinInvSupplierNameStar: "Supplier Name *",
  FinInvSupplierStar: "Supplier *",

  FinPnLDrilldownTransactions: "Transactions",
  FinPnLDrilldownTransactionsPlural: "Transactions",
};

const viFixes = {
  FinAccTitle: "Tài khoản quỹ",
  FinAccSubtitle: "Quản lý tài khoản ngân hàng và tiền mặt.",
  FinAccAddAccountButton: "Thêm tài khoản",
  FinAccAddTransactionButton: "Ghi nhận giao dịch",
  FinAccModalTitleAdd: "Thêm tài khoản",
  FinAccModalTitleEdit: "Sửa tài khoản",
  
  FinCFTitle: "Dòng tiền",
  FinCFSubtitle: "Theo dõi dòng tiền vào và ra trên tất cả hoạt động kinh doanh.",
  
  FinInvTitle: "Hóa đơn VAT",
  FinInvSubtitle: "Quản lý hóa đơn VAT nhà cung cấp và liên kết với khoản thanh toán.",

  FinMATitle: "Điều chỉnh hàng tháng",
  FinMASubtitle: "Ghi nhận các điều chỉnh thủ công cho báo cáo cuối tháng.",
  FinMASaveAdjustmentsButton: "Lưu điều chỉnh",

  FinPayTitle: "Đơn thanh toán",
  FinPaySubtitle: "Theo dõi và quản lý các khoản thanh toán không có hóa đơn.",
  
  FinPnLTitle: "Báo cáo P&L",
  FinPnLSubtitle: "Báo cáo lãi lỗ và hiệu quả tài chính.",
  
  FinCSTitle: "Tồn kho cuối kỳ",
  FinCSSubtitle: "Ghi nhận giá trị tồn kho cuối tháng cho giá vốn hàng bán.",
  
  FinRCRoutingHowTitle: "Cách hoạt động",
  
  FinSetPnLTitle: "Cài đặt P&L",
  FinSetPnLSubtitle: "Cấu hình ánh xạ danh mục và chiến lược tính toán.",
  FinSetPnLSaveButton: "Lưu",
  
  FinTaxTitle: "Cấu hình thuế",
  FinTaxSubtitle: "Quản lý các mức thuế và quy tắc.",
  FinTaxAddTaxButton: "Thêm quy tắc thuế",
  FinTaxModalTitleAdd: "Thêm quy tắc thuế",
  FinTaxModalTitleEdit: "Sửa quy tắc thuế",
  FinTaxModalAddButton: "Thêm",

  FinCalTitle: "Lịch thanh toán",
  FinCalSubtitle: "Lên lịch và theo dõi các chi phí định kỳ và nhắc nhở.",
  FinCalNewReminderButton: "Nhắc nhở mới",
  FinCalModalTitle: "Chi tiết nhắc nhở",
  FinCalModalSaveButton: "Lưu",

  FinCCDelModalTitle: "Xóa chi phí",
  FinCCAddExpenseButton: "Thêm chi phí",

  FinRCModalTitle: "Cấu hình kênh",
  
  FinAccModalSectionGeneral: "Thông tin chung",
  FinAccModalSectionFinancials: "Tài chính",
  FinAccModalSectionBank: "Chi tiết ngân hàng",
  FinAccModalSectionCorpCard: "Cài đặt thẻ doanh nghiệp",
  
  FinCalCorporateCardSection: "Thẻ doanh nghiệp",
  FinCalInvoicesSection: "Hóa đơn",
  FinCalRemindersSection: "Nhắc nhở",
  
  FinAccModalSubtitle: "Nhập chi tiết cho tài khoản quỹ này.",
  FinCFDrilldownTitle: "Chi tiết giao dịch",
  FinCFTrendTitle: "Xu hướng dòng tiền",
  FinCFWaterfallTitle: "Dòng tiền dạng thác nước",
  FinGLSectionTitle: "Cài đặt Sổ cái",
  FinGLSubtitle: "Cấu hình cách sổ cái tài khoản của bạn khởi tạo.",
  FinGLTitle: "Sổ cái chung",
  
  FinCCDelModalDesc: "Bạn có chắc chắn muốn xóa chi phí này không?",
  FinCCDelModalDelSeriesDesc: "Xóa tất cả các lần xuất hiện trong tương lai của chi phí định kỳ này.",
  FinCCDelModalSkipOccurDesc: "Chỉ bỏ qua lần xuất hiện hiện tại.",
  FinCCModalOnlinePaymentDesc: "Tự động thanh toán qua cổng thanh toán.",
  FinCCModalVariableAmountDesc: "Số tiền thay đổi mỗi kỳ.",
  
  FinAccModalCanUseCorpCardDesc: "Cho phép tài khoản này được sử dụng cho chi phí thẻ doanh nghiệp.",
  FinAccModalDefaultCorpCardDesc: "Đặt làm tài khoản mặc định cho chi phí thẻ doanh nghiệp.",
  FinPnLStatutoryDesc: "Lãi lỗ theo luật định cho mục đích thuế.",
  
  FinRCModalCashflowCoaDesc: "Danh mục COA được chỉ định khi tiền vào ngân hàng.",
  FinRCModalEnableRoutingDesc: "Bật định tuyến tiền gửi tự động.",
  FinRCModalSettlementDelayDesc: "Số ngày trước khi tiền được quyết toán.",
  
  FinSetPnLCategoryExceptionsDesc: "Ghi đè chiến lược P&L mặc định cho các danh mục cụ thể.",
  FinSetPnLCategoryExceptionsTitle: "Ngoại lệ danh mục",
  FinSetPnLEqualPartsDesc: "Chia đều chi phí trong một khoảng thời gian (tháng).",
  FinSetPnLGlobalStrategyTitle: "Chiến lược toàn cục",
  FinSetPnLRevReconDesc: "Cài đặt đối soát doanh thu.",
  FinSetPnLRevReconTitle: "Đối soát doanh thu",
  FinSetPnLRevenuePercentageDesc: "Ghi nhận ngay một tỷ lệ phần trăm doanh thu.",
  
  FinTaxHowFormulaRev: "Khấu trừ doanh thu được tính theo tỷ lệ phần trăm của tổng doanh thu.",
  FinTaxHowFormulaTax: "Chi phí thuế được tính dựa trên thu nhập chịu thuế ròng.",
  FinTaxHowTitle: "Cách thức hoạt động của thuế",
  
  FinanceSettingsSubtitle: "Cấu hình mô-đun, quy tắc thuế và tài khoản sổ cái.",
  FinanceSettingsTitle: "Cài đặt tài chính",

  FinCalModalNotesPlaceholder: "Thêm một số ghi chú vào đây...",
  FinCalModalTitleLabel: "Tiêu đề",
  FinCalModalTitlePlaceholder: "Vd: Hóa đơn Internet",
  
  FinCFDefaultCustomerDepositsInflow: "Tiền gửi của khách hàng",
  FinInvStatus: "Trạng thái",
  FinPayStatus: "Trạng thái",
  FinRCColStatus: "Trạng thái",
  FinTaxColStatus: "Trạng thái",
  
  FinInvInvoiceDateStar: "Ngày hóa đơn *",
  FinInvInvoiceNumberStar: "Số hóa đơn *",
  FinInvNetAmountStar: "Số tiền tịnh *",
  FinInvSupplierNameStar: "Tên nhà cung cấp *",
  FinInvSupplierStar: "Nhà cung cấp *",

  FinPnLDrilldownTransactions: "Giao dịch",
  FinPnLDrilldownTransactionsPlural: "Giao dịch",
};

const i18nPath = path.join(__dirname, '../src/lib/i18n.ts');
let i18nContent = fs.readFileSync(i18nPath, 'utf8');

// The file has a dict with `en: { ... }` and `vi: { ... }`.
// Let's replace each occurrence by searching for `Key: "Value",`
// A regex to replace precisely within the en object or vi object is tricky, 
// but since the keys are unique enough, we can just replace them carefully.
// However, it's safer to parse and stringify if it was pure JSON, but it's JS.
// We'll use a regex that matches the key and replaces the value.

function applyFixes(content, fixes) {
  for (const [key, value] of Object.entries(fixes)) {
    // Escape string for regex and replacement
    const safeValue = value.replace(/"/g, '\\"');
    // Match `Key: "...",` or `Key: '...',`
    const regex = new RegExp(`(${key}:\\s*)(['"]).*?\\2`, 'g');
    content = content.replace(regex, `$1"${safeValue}"`);
  }
  return content;
}

// But wait, what if `FinAccTitle` is in both `en` and `vi` sections?
// We need to apply `enFixes` to the `en` block and `viFixes` to the `vi` block.
// A simple way is to split the content at `vi: {` and apply accordingly.

const viIndex = i18nContent.indexOf('vi: {');
let enContent = i18nContent.substring(0, viIndex);
let viContent = i18nContent.substring(viIndex);

enContent = applyFixes(enContent, enFixes);
viContent = applyFixes(viContent, viFixes);

fs.writeFileSync(i18nPath, enContent + viContent, 'utf8');
console.log('Fixed i18n labels successfully!');

