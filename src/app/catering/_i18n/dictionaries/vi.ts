// _i18n/dictionaries/vi.ts
import type { ECKeys } from './en'

const vi: Record<ECKeys, string> = {
  /* ===== Navigation / Sections ===== */
  EventInfo: 'Thông tin sự kiện',
  Bundles: 'Gói',
  Transportation: 'Vận chuyển',
  ExtraFee: 'Phí bổ sung',
  Staff: 'Nhân sự',
  Summary: 'Tổng kết',

  /* ===== Catering List Page ===== */
  'catering.title': 'Catering',
  'catering.selected': 'đã chọn',
  'catering.new_event': 'Tạo sự kiện',
  'catering.empty': 'Chưa có sự kiện. Nhấn "Tạo sự kiện".',

  /* Bulk / Selection */
  'bulk.menu_title': 'Thao tác hàng loạt',
  'bulk.delete': 'Xóa',
  'bulk.delete_confirm': 'Xóa {n} sự kiện và tất cả dữ liệu liên quan? Thao tác này không thể hoàn tác.',
  'bulk.deleted_ok': 'Xóa thành công.',
  'bulk.deleted_fail': 'Xóa thất bại: {msg}',

  'select.enter': 'Bật chế độ chọn',
  'select.exit': 'Thoát chế độ chọn',
  'select.active': 'Đang chọn',
  'select.button': 'Chọn',
  'select.all': 'Chọn tất cả',

  /* Refresh */
  'refresh.aria': 'Làm mới danh sách',
  'refresh.title': 'Làm mới',
  'refresh.btn': 'Làm mới',

  /* Table */
  'table.col.date': 'Ngày',
  'table.col.event': 'Sự kiện',
  'table.col.host': 'Chủ tiệc',
  'table.col.payment': 'Thanh toán',
  'table.col.status': 'Trạng thái',
  'table.col.total_vnd': 'Tổng (VND)',

  'table.sort.date': 'Sắp xếp theo ngày',
  'table.sort.event': 'Sắp xếp theo tên sự kiện',
  'table.sort.host': 'Sắp xếp theo chủ tiệc',
  'table.sort.payment': 'Sắp xếp theo thanh toán',
  'table.sort.total': 'Sắp xếp theo tổng',
  'table.group.status': 'Nhóm theo trạng thái',

  /* Common */
  'common.error': 'Lỗi',
  'common.cancel': 'Hủy',
  'common.save': 'Lưu',

  /* Row actions */
  'row.actions': 'Thao tác',

  /* Status */
  'status.title': 'Trạng thái',
  'status.select': 'Chọn trạng thái',
  'status.empty': ' - trống - ',
  'status.inquiry': 'Yêu cầu',
  'status.pending': 'Đang chờ',
  'status.confirmed': 'Đã xác nhận',
  'status.done': 'Hoàn tất',
  'status.save_failed': 'Lưu trạng thái thất bại: {msg}',

  /* Payment (column + modal) */
  'payment.deposit': 'Đặt cọc',
  'payment.balance': 'Còn lại',
  'payment.paid': 'Đã thanh toán',
  'payment.due_date': 'Hạn thanh toán',
  'payment.amount_vnd': 'Số tiền (VND)',
  'payment.paid_at': 'Thời điểm thanh toán',
  'payment.overdue': 'Quá hạn',

  /* Manage Payment (flows) */
  'pay.title': 'Quản lý thanh toán',
  'pay.manage': 'Quản lý thanh toán',
  'pay.checking': 'Đang kiểm tra…',
  'pay.missing': 'Thiếu dữ liệu',
  'pay.hint_missing_total': 'Thiếu hoặc tổng bằng 0',
  'pay.hint_missing_data': 'Thiếu dữ liệu thanh toán',
  'pay.hint_missing_bal_due': 'Thiếu hạn thanh toán còn lại',
  'pay.hint_missing_dates': 'Thiếu hạn đặt cọc hoặc hạn còn lại',
  'pay.hint_missing_pct': 'Thiếu phần trăm đặt cọc hoặc còn lại',
  'pay.save_failed': 'Lưu thanh toán thất bại: {msg}',

  /* ===== Assets Card ===== */
  'assets.title': 'Tài sản công ty',
  'assets.add_row_title': 'Thêm dòng tài sản',
  'assets.need_event_id': 'Cung cấp eventId để thêm dòng vào DB',
  'assets.add': 'Thêm tài sản',
  'assets.empty': 'Chưa có tài sản. Nhấn "Thêm tài sản" để thêm dòng đầu tiên.',
  'assets.name': 'Tên',
  'assets.name_ph': 'Tên tài sản',
  'assets.name_aria': 'Tên tài sản',
  'assets.qty': 'Số lượng',
  'assets.qty_aria': 'Số lượng',
  'assets.include_price': 'Tính giá',
  'assets.unit_price': 'Đơn giá',
  'assets.unit_price_aria': 'Đơn giá (VND)',
  'assets.unit_price_title': 'Đơn giá bằng VND',
  'assets.enable_toggle': 'Bật công tắc để chỉnh',
  'assets.total_price': 'Thành tiền',
  'assets.row_total_aria': 'Thành tiền của dòng',
  'assets.row_total_title': 'Số lượng × Đơn giá khi được tính',
  'assets.remove_title': 'Xóa dòng tài sản',
  'assets.remove_aria': 'Xóa dòng',
  'assets.totals': 'Tổng cộng',
  'assets.price_label': 'Giá',

  /* ===== Discounts Card ===== */
  'discounts.title': 'Giảm giá',
  'discounts.missing_event': 'Thiếu eventId. Mở hoặc tạo sự kiện để thêm Giảm giá.',
  'discounts.add_row_title': 'Thêm dòng giảm giá',
  'discounts.need_event_id': 'Cung cấp eventId để thêm dòng vào DB',
  'discounts.add': 'Thêm giảm giá',
  'discounts.load_error': 'Lỗi tải',
  'discounts.empty': 'Chưa có giảm giá. Nhấn "Thêm giảm giá" để tạo dòng đầu tiên.',
  'discounts.label': 'Nhãn',
  'discounts.label_ph': 'Mô tả',
  'discounts.label_aria': 'Nhãn giảm giá',
  'discounts.percentage': 'Phần trăm',
  'discounts.toggle_pct_aria': 'Bật/tắt chế độ phần trăm',
  'discounts.configure_pct_aria': 'Cấu hình phần trăm',
  'discounts.configure_pct_title': 'Cấu hình phần trăm',
  'discounts.scope_chip_title': 'Nhấn để cấu hình',
  'discounts.total_row': 'Tổng giảm',
  'discounts.amount_aria': 'Số tiền giảm (VND)',
  'discounts.remove_aria': 'Xóa giảm giá',
  'discounts.remove_title': 'Xóa giảm giá',
  'discounts.totals': 'Tổng cộng',
  'discounts.total_label': 'Giảm giá',

  /* Discounts Modal */
  'discounts.modal.title': 'Thiết lập phần trăm',
  'discounts.modal.close': 'Đóng',
  'discounts.modal.mode': 'Chế độ phần trăm',
  'discounts.modal.percent': 'Phần trăm (%)',
  'discounts.modal.base': 'Cơ sở tính',
  'discounts.modal.bundle_specific': 'Gói cụ thể',
  'discounts.modal.bundles_all': '- Tất cả gói -',
  'discounts.modal.bundle_prefix': 'Gói:',
  'discounts.modal.note': 'Không ghi DB/LS cho đến khi bấm Lưu toàn cục. UI hiển thị giá trị live cục bộ.',

  /* Discounts Base options */
  'discounts.base.bundles': 'Gói',
  'discounts.base.equipment': 'Thiết bị',
  'discounts.base.staff': 'Nhân sự',
  'discounts.base.transport': 'Vận chuyển',
  'discounts.base.assets': 'Tài sản công ty',
  'discounts.base.total_excl_extrafee': 'Tổng (không gồm phụ phí)',
  'discounts.base.total_incl_extrafee': 'Tổng (gồm phụ phí)',

  /* Discounts Scope labels (chips) */
  'discounts.scope.bundle': 'GÓI',
  'discounts.scope.bundle_selected': 'GÓI (đang chọn)',
  'discounts.scope.bundles_all': 'CÁC GÓI (tất cả)',
  'discounts.scope.equipment': 'THIẾT BỊ',
  'discounts.scope.staff': 'NHÂN SỰ',
  'discounts.scope.transport': 'VẬN CHUYỂN',
  'discounts.scope.assets': 'TÀI SẢN CÔNG TY',
  'discounts.scope.total_excl_extrafee': 'TỔNG (không gồm phụ phí)',
  'discounts.scope.total_incl_extrafee': 'TỔNG (gồm phụ phí)',

  /* ===== Equipment Card ===== */
  'equipment.title': 'Thiết bị',
  'equipment.any': 'Bất kỳ',
  'equipment.badge_no_event': 'Không có eventId: hãy lưu/mở một sự kiện trước',
  'equipment.need_event_id': 'Cần eventId để lưu',
  'equipment.add_row_title': 'Thêm dòng thiết bị',
  'equipment.loading': 'Đang tải…',
  'equipment.add': 'Thêm thiết bị',
  'equipment.col.item': 'Thiết bị',
  'equipment.col.category': 'Danh mục',
  'equipment.col.qty': 'Số lượng',
  'equipment.col.unit_price': 'Đơn giá',
  'equipment.col.total': 'Thành tiền',
  'equipment.col.notes': 'Ghi chú',
  'equipment.qty_aria': 'Số lượng',
  'equipment.notes_db_prefix': 'Ghi chú DB: {note}',
  'equipment.notes_optional': 'Ghi chú tùy chọn',
  'equipment.remove_title': 'Xóa',
  'equipment.remove_aria': 'Xóa',
  'equipment.totals': 'Tổng cộng',

  /* ===== Extra Fee Card ===== */
  'extrafee.title': 'Phí bổ sung',
  'extrafee.add_row_title': 'Thêm dòng phí',
  'extrafee.add': 'Thêm phí',
  'extrafee.missing_event': 'Thiếu eventId. Mở hoặc tạo sự kiện để thêm Phí bổ sung.',
  'extrafee.load_error': 'Lỗi tải',
  'extrafee.loading': 'Đang tải…',
  'extrafee.empty': 'Chưa có phí. Nhấn “Thêm phí” để tạo dòng đầu tiên.',
  'extrafee.label': 'Nhãn',
  'extrafee.label_ph': 'Mô tả',
  'extrafee.label_aria': 'Nhãn phí',
  'extrafee.qty': 'Số lượng',
  'extrafee.qty_aria': 'Số lượng',
  'extrafee.adv_label': 'Nâng cao',
  'extrafee.toggle_adv_aria': 'Bật/tắt chế độ nâng cao',
  'extrafee.configure_adv_aria': 'Cấu hình cài đặt nâng cao',
  'extrafee.unit_price': 'Đơn giá',
  'extrafee.unit_price_aria': 'Đơn giá (VND)',
  'extrafee.total_price': 'Thành tiền',
  'extrafee.remove_aria': 'Xóa phí',
  'extrafee.totals': 'Tổng cộng',
  'extrafee.price_label': 'Giá',

  /* Extra Fee Modal */
  'extrafee.modal.title': 'Cài đặt nâng cao',
  'extrafee.modal.close': 'Đóng',
  'extrafee.modal.mode': 'Chế độ',
  'extrafee.modal.mode_cost': 'Chi phí & Hệ số',
  'extrafee.modal.mode_pct': 'Phần trăm',
  'extrafee.modal.cost': 'Chi phí',
  'extrafee.modal.markup_x': 'Hệ số nhân',
  'extrafee.modal.help_cost': 'Đơn giá = Chi phí × Hệ số. Tổng = SL × Đơn giá.',
  'extrafee.modal.percent': 'Phần trăm (%)',
  'extrafee.modal.base': 'Cơ sở tính',
  'extrafee.modal.help_pct': 'Phần trăm áp dụng trên giá bán, không phải chi phí. Bỏ qua số lượng. Tổng = Cơ sở × %.',
  'extrafee.modal.cancel': 'Hủy',
  'extrafee.modal.save': 'Lưu',

  /* Extra Fee Base options */
  'extrafee.base.bundles': 'Gói',
  'extrafee.base.equipment': 'Thiết bị',
  'extrafee.base.staff': 'Nhân sự',
  'extrafee.base.transport': 'Vận chuyển',
  'extrafee.base.assets': 'Tài sản công ty',
  'extrafee.base.total_excl_extrafee': 'Tổng (không gồm phụ phí)',
  'extrafee.base.total_incl_extrafee': 'Tổng (gồm phụ phí)',

  /* Extra Fee Scope chip labels */
  'extrafee.scope.bundles': 'GÓI',
  'extrafee.scope.equipment': 'THIẾT BỊ',
  'extrafee.scope.staff': 'NHÂN SỰ',
  'extrafee.scope.transport': 'VẬN CHUYỂN',
  'extrafee.scope.assets': 'TÀI SẢN CÔNG TY',
  'extrafee.scope.total_excl_extrafee': 'TỔNG (không gồm phụ phí)',
  'extrafee.scope.total_incl_extrafee': 'TỔNG (gồm phụ phí)',

  // ===== Event Info Card =====
  'eventinfo.loading': 'Đang tải…',
  'eventinfo.title': 'Thông tin sự kiện',
  'eventinfo.event': 'Sự kiện',
  'eventinfo.date': 'Ngày',
  'eventinfo.start_time': 'Giờ bắt đầu',
  'eventinfo.end_time': 'Giờ kết thúc',
  'eventinfo.total_hours': 'Tổng giờ',
  'eventinfo.location': 'Địa điểm',

  'eventinfo.host_poc': 'Chủ tiệc/POC',
  'eventinfo.phone': 'Điện thoại',
  'eventinfo.email': 'Email',
  'eventinfo.preferred_contact': 'Liên hệ ưu tiên',
  'eventinfo.contact.zalo': 'Zalo',
  'eventinfo.contact.phone': 'Điện thoại',
  'eventinfo.contact.email': 'Email',
  'eventinfo.contact.whatsapp': 'WhatsApp',
  'eventinfo.contact.other': 'Khác',

  'eventinfo.customer_type': 'Loại khách hàng',
  'eventinfo.customer.private': 'Cá nhân',
  'eventinfo.customer.company': 'Công ty',

  'eventinfo.company.name': 'Tên công ty',
  'eventinfo.company.director': 'Giám đốc',
  'eventinfo.company.tax_code': 'Mã số thuế',
  'eventinfo.company.address': 'Địa chỉ',
  'eventinfo.company.city': 'Thành phố',
  'eventinfo.company.billing_email': 'Email xuất hóa đơn',

  'eventinfo.people': 'Số người',
  'eventinfo.budget_per_person': 'Ngân sách mỗi người',
  'eventinfo.per_person_suffix': '/ người',
  'eventinfo.budget_total': 'Tổng ngân sách',
  'eventinfo.notes': 'Ghi chú',

  'eventinfo.payment': 'Thanh toán',
  'eventinfo.payment.full': 'Trả toàn bộ',
  'eventinfo.payment.installments': 'Trả theo đợt',
  'eventinfo.deposit': 'Đặt cọc',
  'eventinfo.deposit_pct': '% đặt cọc',
  'eventinfo.due_date': 'Hạn thanh toán',
  'eventinfo.balance': 'Còn lại',
  'eventinfo.balance_pct': '% còn lại',

  'eventinfo.provider_branch': 'Chi nhánh nhà cung cấp',
  'eventinfo.select_branch': '— Chọn chi nhánh —',

  /* ===== Event Staff Card ===== */
  'eventstaff.title': 'Nhân sự',
  'eventstaff.markup': 'Hệ số',
  'eventstaff.adopt_global': 'Áp dụng thiết lập chung',
  'eventstaff.add': 'Thêm nhân sự',
  'eventstaff.add_row_title': 'Thêm dòng nhân sự',

  'eventstaff.col.name': 'Họ tên',
  'eventstaff.col.role': 'Vai trò',
  'eventstaff.col.cost_per_hour': 'Chi phí/giờ',
  'eventstaff.col.hours': 'Giờ',
  'eventstaff.col.cost': 'Chi phí',
  'eventstaff.col.price': 'Giá bán',

  'eventstaff.ph.name': 'Họ và tên',
  'eventstaff.ph.role': 'Vị trí/vai trò',

  'eventstaff.aria.cost_per_hour': 'Chi phí mỗi giờ',
  'eventstaff.aria.hours': 'Số giờ',

  'eventstaff.hint.step_thousand': 'Dùng phím mũi tên để thay đổi ±1000',
  'eventstaff.hint.step_half': 'Dùng phím mũi tên để thay đổi ±0.5',

  'eventstaff.remove_title': 'Xóa',
  'eventstaff.totals': 'Tổng cộng',

  /* ===== Totals Card ===== */
  'totals.title': 'Tổng cộng',
  'totals.loading': 'Đang tải…',

  'totals.col.section': 'Hạng mục',
  'totals.col.cost': 'Chi phí',
  'totals.col.price': 'Giá bán',

  'totals.row.bundles': 'Gói',
  'totals.row.equipment': 'Thiết bị',
  'totals.row.staff': 'Nhân sự',
  'totals.row.transport': 'Vận chuyển',
  'totals.row.assets': 'Tài sản công ty',
  'totals.row.extrafee': 'Phí bổ sung',

  'totals.label.totals': 'Tổng cộng',
  'totals.label.after_discounts': 'Tổng sau giảm giá',

  'totals.payment_split.title': 'Chia thanh toán',
  'totals.payment_split.note': 'Chỉnh các số tiền sẽ cập nhật phần trăm. Nhấn Lưu để lưu kế hoạch thanh toán.',

  'totals.kpi.margin_pct': 'Biên lợi nhuận %',
  'totals.kpi.margin': 'Lợi nhuận',
  'totals.kpi.cost_pct': 'Chi phí %',
  'totals.kpi.people': 'Số người',
  'totals.kpi.service_hours': 'Giờ phục vụ',
  'totals.kpi.budget_total': 'Ngân sách (tổng)',
  'totals.kpi.per_person_suffix': '/ người',
  'totals.kpi.delta_vs_budget': 'Chênh lệch so với ngân sách',

  /* ===== Event Transport Card ===== */
  'eventtransport.add': 'Thêm chuyến',
  'eventtransport.add_row_title': 'Thêm dòng chuyến',
  'eventtransport.empty': 'Chưa có chuyến. Nhấn “Thêm chuyến” để tạo tuyến đầu tiên.',
  'eventtransport.trip': 'Chuyến',
  'eventtransport.aria.trip_type': 'Loại chuyến',
  'eventtransport.trip.oneway': 'Một chiều',
  'eventtransport.trip.roundtrip': 'Khứ hồi',
  'eventtransport.col.from': 'Từ',
  'eventtransport.col.to': 'Đến',
  'eventtransport.col.vehicle': 'Phương tiện',
  'eventtransport.col.distance_eta': 'Quãng đường / ETA',
  'eventtransport.col.notes': 'Ghi chú',
  'eventtransport.select_vehicle': 'Chọn phương tiện',
  'eventtransport.no_vehicles_yet': 'Chưa có phương tiện',
  'eventtransport.per_km_suffix': '/km',
  'eventtransport.km_unit': 'km',
  'eventtransport.min_unit': 'phút',
  'eventtransport.searching': 'Đang tìm…',
  'eventtransport.no_suggestions': 'Không có gợi ý',
  'eventtransport.ph.from': 'vd. 2 Hai Trieu, Quận 1, TP.HCM',
  'eventtransport.ph.to': 'vd. 1 Vo Van Kiet, Quận 1, TP.HCM',
  'eventtransport.ph.notes': 'Thêm chi tiết, biển số xe, bãi đỗ, v.v.',
  'eventtransport.remove_title': 'Xóa chuyến',

  /* ===== Event Calculator (page) ===== */
  'eventcalc.toolbar.back': 'Quay lại',
  'eventcalc.toolbar.new_event': 'Tạo sự kiện',
  'eventcalc.toolbar.summary': 'Tổng kết',

  'eventcalc.savebar.saving': 'Đang lưu…',
  'eventcalc.savebar.unsaved': 'Thay đổi chưa lưu',
  'eventcalc.savebar.never_saved': 'Chưa từng lưu',
  'eventcalc.savebar.saved_at': 'Đã lưu lúc {time}',
  'eventcalc.savebar.save': 'Lưu',

  'eventcalc.add_bundle': 'Thêm gói',
  'eventcalc.add_bundle_title': 'Thêm gói mới',
  'eventcalc.add_bundle_disabled': 'Chưa có loại gói. Vào Cài đặt Sự kiện để tạo ít nhất một loại.',
  'eventcalc.no_bundle_types': 'Chưa có loại gói. Vào Cài đặt Sự kiện và tạo ít nhất một loại.',
  'eventcalc.no_bundles_yet': 'Chưa có gói. Nhấn “Thêm gói” để bắt đầu.',

  'eventcalc.table.dish': 'Món',
  'eventcalc.table.modifier_n': 'Tùy chọn {n}',
  'eventcalc.table.qty': 'SL',
  'eventcalc.table.cost': 'Chi phí',
  'eventcalc.table.price': 'Giá bán',
  'eventcalc.table.totals': 'Tổng cộng',
  'eventcalc.table.required': 'Bắt buộc',
  'eventcalc.table.item_out_of_scope': 'Món không thuộc danh mục của gói này',
  'eventcalc.table.add_modifier_to_row': 'Thêm tùy chọn cho dòng này',
  'eventcalc.table.add_row': 'Thêm dòng',
  'eventcalc.table.remove_row': 'Xóa dòng',
  'eventcalc.loading_items': 'Đang tải mục…',
  'eventcalc.select_item': 'Chọn mục',
  'eventcalc.add_row_title': 'Thêm dòng mới',

  'eventcalc.bundle_totals.title': 'Tổng gộp các gói',
  'eventcalc.bundle_totals.qty': 'SL:',
  'eventcalc.bundle_totals.cost': 'Chi phí:',
  'eventcalc.bundle_totals.price': 'Giá:',

  'eventcalc.wizard.choose_type': 'Chọn loại gói',
  'eventcalc.wizard.configure': 'Cấu hình {label}',
  'eventcalc.wizard.select_to_add': 'Chọn để thêm các dòng với món cơ bản và các tùy chọn bắt buộc.',
  'eventcalc.wizard.no_types': 'Chưa có loại gói. Mở Cài đặt Sự kiện và tạo ít nhất một loại.',
  'eventcalc.wizard.add_row': 'Thêm dòng',
  'eventcalc.wizard.add_bundle': 'Thêm gói',

  /* ===== Event Transport (extra per parità con en) ===== */
  'eventtransport.title': 'Vận chuyển',
  'eventtransport.loading': 'Đang tải…',
  'eventtransport.load_error': 'Lỗi tải',
  'eventtransport.missing_event': 'Thiếu eventId. Mở hoặc tạo sự kiện để thêm Vận chuyển.',
  'eventtransport.need_event_id': 'Cung cấp eventId để thêm dòng vào DB',
  'eventtransport.totals': 'Tổng cộng',
  'eventtransport.col.cost': 'Chi phí',
  'eventtransport.col.price': 'Giá bán',
  'eventtransport.col.total': 'Thành tiền',
  'eventtransport.remove_aria': 'Xóa chuyến',
  'eventtransport.price_label': 'Giá',
  'common.back': 'Quay lại',

  /* ===== Event Summary (new) ===== */
  'Event Summary': 'Tóm tắt sự kiện',
  'Event Info': 'Thông tin sự kiện',
  'Bundles & Menu': 'Gói & Thực đơn',

  /* Action bar / modal */
  Back: 'Quay lại',
  'Export PDF': 'Xuất PDF',
  Edit: 'Sửa',
  Export: 'Xuất',
  'Export → Quotation': 'Xuất → Báo giá',
  Report: 'Báo cáo',
  Quotation: 'Báo giá',
  Menu: 'Thực đơn',
  Contract: 'Hợp đồng',
  'Note of payment': 'Phiếu thanh toán',
  Liquidation: 'Thanh lý',
  'Quotation (Detailed)': 'Báo giá (Chi tiết)',
  'Quotation (Summary)': 'Báo giá (Tóm tắt)',
  Close: 'Đóng',
  Hide: 'Ẩn',
  Show: 'Hiện',
  'Loading…': 'Đang tải…',

  /* Bundles block */
  'Dish / Item': 'Món / Mục',
  Modifiers: 'Tùy chọn',
  Qty: 'SL',
  'Unit cost': 'Chi phí đơn vị',
  'Unit price': 'Đơn giá',
  'Subtotal cost': 'Tạm tính chi phí',
  'Subtotal price': 'Tạm tính giá',
  Subtotal: 'Tạm tính',
  'No bundles.': 'Không có gói.',

  /* Equipment block */
  Name: 'Tên',
  Category: 'Danh mục',
  'No equipment.': 'Không có thiết bị.',

  /* Staff block */
  Role: 'Vai trò',
  'Cost / hour': 'Chi phí/giờ',
  Hours: 'Giờ',
  Notes: 'Ghi chú',
  'No staff.': 'Không có nhân sự.',

  /* Transport block */
  'From → To': 'Từ → Đến',
  Vehicle: 'Phương tiện',
  'Distance (km)': 'Quãng đường (km)',
  Trips: 'Lượt',
  'Cost / km': 'Chi phí/km',
  'ETA (min)': 'ETA (phút)',
  'No transport routes.': 'Không có tuyến vận chuyển.',

  /* Assets block */
  Asset: 'Tài sản',
  'No company assets.': 'Không có tài sản công ty.',

  /* Extra fee block */
  Label: 'Nhãn',
  Details: 'Chi tiết',
  Cost: 'Chi phí',
  'Markup ×': 'Hệ số ×',
  'No extra fee rows.': 'Không có dòng phí bổ sung.',
  'calc (cost × markup)': 'tính (chi phí × hệ số)',
  unit: 'đơn vị',

  /* Discounts block */
  Amount: 'Số tiền',
  'Total discounts': 'Tổng giảm giá',
  'No discounts.': 'Không có giảm giá.',
  'BUNDLES (all)': 'CÁC GÓI (tất cả)',
  BUNDLE: 'GÓI',

  /* Totals table */
  Section: 'Hạng mục',
  Price: 'Giá bán',
  Totals: 'Tổng cộng',
  Discounts: 'Giảm giá',
  'Total after discounts': 'Tổng sau giảm giá',
 

  /* Payment row */
  'Payment due': 'Số tiền đến hạn',
  Deposit: 'Đặt cọc',
  Balance: 'Còn lại',

  /* Event info doc (labels sintetici) */
  Title: 'Tiêu đề',
  Date: 'Ngày',
  Time: 'Thời gian',
  Location: 'Địa điểm',
  'Host / POC': 'Chủ tiệc / POC',
  'Customer type': 'Loại khách hàng',
  Phone: 'Điện thoại',
  Email: 'Email',
  'Preferred contact': 'Liên hệ ưu tiên',
  Company: 'Công ty',
  'Company director': 'Giám đốc công ty',
  'Company tax code': 'Mã số thuế công ty',
  'Company address': 'Địa chỉ công ty',
  'Company city': 'Thành phố (công ty)',
  'Billing email': 'Email xuất hóa đơn',
  People: 'Số người',
  'Budget / person': 'Ngân sách/người',
  'Payment term': 'Điều khoản thanh toán',
  'Due by (deposit/balance)': 'Hạn (đặt cọc/còn lại)',
  'Branch provider': 'Chi nhánh nhà cung cấp',
  person: 'người',

  /* ===== Event Summary – integrazioni mancanti ===== */

  /* Pulsanti */
  'New event': 'Tạo sự kiện',

  /* KPI (etichette semplici usate nel Summary) */
  'Margin %': 'Biên lợi nhuận %',
  Margin: 'Lợi nhuận',
  'Cost %': 'Chi phí %',
  'Service hours': 'Giờ phục vụ',
  'Budget (total)': 'Ngân sách (tổng)',
  'Δ vs budget': 'Chênh lệch so với ngân sách',

  /* Sezioni con titoli non coperti dal nav */
  Equipment: 'Thiết bị',
  Transport: 'Vận chuyển',
  'Company assets': 'Tài sản công ty',
  'Extra fee': 'Phí bổ sung',

  /* Event Info: suffisso “hours” vicino all’orario */
  hours: 'giờ',
  /* ===== Contract Template ===== */
'contractTpl.importDocx': 'Nhập DOCX…',

/* ===== Common (aggiunte per Contract Template) ===== */
'common.saving': 'Đang lưu…',
'common.profile': 'Hồ sơ',
'common.event': 'Sự kiện',
'common.insert': 'Chèn',
/* ===== LeftNav ===== */
EventCalculator: 'Tính sự kiện',
EventSettings: 'Cài đặt Sự kiện',
}

export default vi