-- Migration: Fix Closing Notification Branch Name
-- Description: Query provider_branches by NEW.branch_name to correctly resolve branch name and branch_id for notifications.

CREATE OR REPLACE FUNCTION public.fn_trigger_daily_reports_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_name text;
    v_branch_id text;
    v_notification_id uuid;
BEGIN
    -- Chiusura cassa inviata o modificata
    IF TG_TABLE_NAME = 'cashier_closings' AND TG_OP IN ('INSERT', 'UPDATE') THEN
        -- Cerca name e id in provider_branches in base a branch_name
        SELECT id, name INTO v_branch_id, v_branch_name 
        FROM public.provider_branches 
        WHERE name = NEW.branch_name
        LIMIT 1;
        
        IF v_branch_name IS NULL THEN
            v_branch_name := NEW.branch_name;
        END IF;

        IF v_branch_id IS NULL THEN
            v_branch_id := NEW.branch_id::text;
        END IF;

        -- Cerchiamo se esiste già una notifica nelle ultime 24 ore per lo stesso branch
        SELECT id INTO v_notification_id 
        FROM public.app_notifications 
        WHERE module = 'daily_reports' 
          AND branch_id = v_branch_id
          AND (title_en = 'Cashier Closing Submitted' OR title_en = 'Cashier Closing Updated')
          AND created_at >= now() - INTERVAL '24 hours'
        LIMIT 1;

        IF v_notification_id IS NOT NULL THEN
            -- Aggiorna la notifica esistente per portarla in cima e aggiornare l'orario
            UPDATE public.app_notifications
            SET title_en = 'Cashier Closing Updated',
                title_vi = 'Đóng ca bán hàng đã cập nhật',
                message_en = 'Cashier closing updated for branch: ' || coalesce(v_branch_name, '') || ' (last saved at ' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') || ')',
                message_vi = 'Báo cáo đóng ca đã được cập nhật cho chi nhánh: ' || coalesce(v_branch_name, '') || ' (cập nhật lúc ' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') || ')',
                created_at = now() -- Aggiorna la data/ora per farla risalire in cima alla lista
            WHERE id = v_notification_id;
        ELSE
            -- Inserisce una nuova notifica
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
            VALUES (
                'daily_reports',
                'Cashier Closing Submitted',
                'Đóng ca bán hàng đã nộp',
                'Cashier closing submitted for branch: ' || coalesce(v_branch_name, ''),
                'Báo cáo đóng ca đã được nộp cho chi nhánh: ' || coalesce(v_branch_name, ''),
                ARRAY['owner', 'admin', 'accountant'],
                v_branch_id
            );
        END IF;
    END IF;

    -- Nuovo deposito registrato
    IF TG_TABLE_NAME = 'deposits' AND TG_OP = 'INSERT' THEN
        -- Cerca l'ID del branch in base al nome (se NEW.branch contiene il nome)
        SELECT id::text INTO v_branch_id
        FROM public.provider_branches
        WHERE name = NEW.branch OR id::text = NEW.branch
        LIMIT 1;

        IF v_branch_id IS NULL THEN
            v_branch_id := NEW.branch;
        END IF;

        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
        VALUES (
            'daily_reports',
            'New Deposit Registered',
            'Khoản nộp tiền mới',
            'New cash deposit of ' || coalesce(NEW.amount_vnd::text, '0') || ' VND registered.',
            'Khoản nộp tiền mặt mới trị giá ' || coalesce(NEW.amount_vnd::text, '0') || ' VND đã ghi nhận.',
            ARRAY['owner', 'admin', 'accountant'],
            v_branch_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
