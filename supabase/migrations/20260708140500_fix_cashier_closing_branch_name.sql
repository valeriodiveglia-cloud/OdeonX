-- Migration: Fix cashier closing notifications to use branch name instead of ID.

CREATE OR REPLACE FUNCTION public.fn_trigger_daily_reports_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_name text;
BEGIN
    -- Chiusura cassa inviata
    IF TG_TABLE_NAME = 'cashier_closings' AND TG_OP = 'INSERT' THEN
        -- Recupera il nome della filiale
        SELECT name INTO v_branch_name 
        FROM public.provider_branches 
        WHERE id = NEW.branch_id;
        
        -- Fallback se non trovato
        IF v_branch_name IS NULL THEN
            v_branch_name := NEW.branch_id;
        END IF;

        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'daily_reports',
            'Cashier Closing Submitted',
            'Đóng ca bán hàng đã nộp',
            'Cashier closing submitted for branch: ' || coalesce(v_branch_name, ''),
            'Báo cáo đóng ca đã được nộp cho chi nhánh: ' || coalesce(v_branch_name, ''),
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
