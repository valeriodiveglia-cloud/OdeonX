-- Migrazione per aggiungere i trigger delle notifiche di sistema per gli altri moduli:
-- Finance, Daily Reports, CRM, Loyalty e Catering.

-- 1. MODULO FINANCE
CREATE OR REPLACE FUNCTION public.fn_trigger_finance_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Caso A: Nuova fattura inserita
    IF TG_TABLE_NAME = 'fin_invoices' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'finance',
            'New Invoice Received',
            'Hóa đơn mới nhận',
            'New invoice #' || coalesce(NEW.id::text, '') || ' registered for payment.',
            'Hóa đơn mới #' || coalesce(NEW.id::text, '') || ' đã được đăng ký thanh toán.',
            ARRAY['owner', 'accountant']
        );
    END IF;

    -- Caso B: Nuovo ordine di pagamento
    IF TG_TABLE_NAME = 'fin_payment_orders' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'finance',
            'Payment Order Requires Approval',
            'Yêu cầu chi tiền cần duyệt',
            'New payment order requires authorization.',
            'Yêu cầu chi tiền mới đang chờ phê duyệt.',
            ARRAY['owner', 'accountant']
        );
    END IF;

    -- Caso C: Nuova spesa con carta aziendale
    IF TG_TABLE_NAME = 'fin_corporate_card_expenses' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'finance',
            'Corporate Card Expense',
            'Chi phí thẻ doanh nghiệp',
            'New corporate card expense of ' || coalesce(NEW.amount_vnd::text, '0') || ' VND registered.',
            'Ghi nhận chi phí thẻ doanh nghiệp mới trị giá ' || coalesce(NEW.amount_vnd::text, '0') || ' VND.',
            ARRAY['owner', 'accountant']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger per fin_invoices
DROP TRIGGER IF EXISTS tr_finance_invoice_notifications ON public.fin_invoices;
CREATE TRIGGER tr_finance_invoice_notifications
    AFTER INSERT ON public.fin_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_finance_notifications();

-- Trigger per fin_payment_orders
DROP TRIGGER IF EXISTS tr_finance_payment_order_notifications ON public.fin_payment_orders;
CREATE TRIGGER tr_finance_payment_order_notifications
    AFTER INSERT ON public.fin_payment_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_finance_notifications();

-- Trigger per fin_corporate_card_expenses
DROP TRIGGER IF EXISTS tr_finance_card_expense_notifications ON public.fin_corporate_card_expenses;
CREATE TRIGGER tr_finance_card_expense_notifications
    AFTER INSERT ON public.fin_corporate_card_expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_finance_notifications();


-- 2. MODULO DAILY REPORTS & CASSA
CREATE OR REPLACE FUNCTION public.fn_trigger_daily_reports_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Chiusura cassa inviata
    IF TG_TABLE_NAME = 'cashier_closings' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'daily_reports',
            'Cashier Closing Submitted',
            'Đóng ca bán hàng đã nộp',
            'Cashier closing submitted for branch ID: ' || coalesce(NEW.branch_id::text, ''),
            'Báo cáo đóng ca đã được nộp cho chi nhánh ID: ' || coalesce(NEW.branch_id::text, ''),
            ARRAY['owner', 'admin', 'accountant']
        );
    END IF;

    -- Nuovo deposito registrato
    IF TG_TABLE_NAME = 'deposits' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'daily_reports',
            'New Deposit Registered',
            'Khoản nộp tiền mới',
            'New cash deposit of ' || coalesce(NEW.amount_vnd::text, '0') || ' VND registered.',
            'Khoản nộp tiền mặt mới trị giá ' || coalesce(NEW.amount_vnd::text, '0') || ' VND đã ghi nhận.',
            ARRAY['owner', 'admin', 'accountant']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger per cashier_closings
DROP TRIGGER IF EXISTS tr_daily_reports_closing_notifications ON public.cashier_closings;
CREATE TRIGGER tr_daily_reports_closing_notifications
    AFTER INSERT ON public.cashier_closings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_daily_reports_notifications();

-- Trigger per deposits
DROP TRIGGER IF EXISTS tr_daily_reports_deposit_notifications ON public.deposits;
CREATE TRIGGER tr_daily_reports_deposit_notifications
    AFTER INSERT ON public.deposits
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_daily_reports_notifications();


-- 3. MODULO CRM
CREATE OR REPLACE FUNCTION public.fn_trigger_crm_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Nuovo partner creato
    IF TG_TABLE_NAME = 'crm_partners' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'crm',
            'New Partner Registered',
            'Đối tác mới đăng ký',
            'New partner ' || coalesce(NEW.name, '') || ' registered in CRM pipeline.',
            'Đối tác mới ' || coalesce(NEW.name, '') || ' đã được đăng ký vào hệ thống CRM.',
            ARRAY['owner', 'admin', 'manager']
        );
    END IF;

    -- Nuovo payout provvigionale generato
    IF TG_TABLE_NAME = 'crm_payouts' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'crm',
            'New CRM Payout Generated',
            'Yêu cầu chi hoa hồng mới',
            'A new payout of ' || coalesce(NEW.amount_vnd::text, '0') || ' VND is generated.',
            'Một yêu cầu chi hoa hồng mới trị giá ' || coalesce(NEW.amount_vnd::text, '0') || ' VND đã được tạo.',
            ARRAY['owner', 'accountant']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger per crm_partners
DROP TRIGGER IF EXISTS tr_crm_partner_notifications ON public.crm_partners;
CREATE TRIGGER tr_crm_partner_notifications
    AFTER INSERT ON public.crm_partners
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_crm_notifications();

-- Trigger per crm_payouts
DROP TRIGGER IF EXISTS tr_crm_payout_notifications ON public.crm_payouts;
CREATE TRIGGER tr_crm_payout_notifications
    AFTER INSERT ON public.crm_payouts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_crm_notifications();


-- 4. MODULO LOYALTY
CREATE OR REPLACE FUNCTION public.fn_trigger_loyalty_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Nuova carta prepagata emessa
    IF TG_TABLE_NAME = 'prepaid_cards' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'loyalty',
            'New Prepaid Card Issued',
            'Thẻ trả trước mới được cấp',
            'New prepaid card issued for client. Initial balance: ' || coalesce(NEW.initial_balance::text, '0') || ' VND.',
            'Thẻ trả trước mới đã được phát hành. Số dư ban đầu: ' || coalesce(NEW.initial_balance::text, '0') || ' VND.',
            ARRAY['owner', 'admin', 'manager']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger per prepaid_cards
DROP TRIGGER IF EXISTS tr_loyalty_card_notifications ON public.prepaid_cards;
CREATE TRIGGER tr_loyalty_card_notifications
    AFTER INSERT ON public.prepaid_cards
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_loyalty_notifications();


-- 5. MODULO CATERING
CREATE OR REPLACE FUNCTION public.fn_trigger_catering_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Nuovo evento catering inserito
    IF TG_TABLE_NAME = 'event_headers' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'catering',
            'New Catering Event Created',
            'Sự kiện Catering mới',
            'New event "' || coalesce(NEW.event_name, '') || '" created.',
            'Sự kiện mới "' || coalesce(NEW.event_name, '') || '" đã được tạo.',
            ARRAY['owner', 'admin', 'manager', 'sale advisor']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger per event_headers
DROP TRIGGER IF EXISTS tr_catering_event_notifications ON public.event_headers;
CREATE TRIGGER tr_catering_event_notifications
    AFTER INSERT ON public.event_headers
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_catering_notifications();
