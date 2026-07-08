-- Migrazione per la segregazione delle notifiche (app_notifications) per branch.
-- Aggiunge la colonna branch_id e aggiorna i trigger dei moduli principali per popolarla.

-- 1. Aggiunta della colonna branch_id
ALTER TABLE public.app_notifications ADD COLUMN IF NOT EXISTS branch_id text DEFAULT NULL;

-- 2. Aggiornamento Policy RLS select_app_notifications
DROP POLICY IF EXISTS select_app_notifications ON public.app_notifications;
CREATE POLICY select_app_notifications ON public.app_notifications
    FOR SELECT
    USING (
        (target_user_id IS NULL OR target_user_id = auth.uid())
        AND 
        (target_roles IS NULL OR (
            SELECT role FROM public.app_accounts WHERE user_id = auth.uid()
        ) = ANY(target_roles))
        AND
        (
            -- Se l'utente è owner o admin, vede tutto
            (SELECT role FROM public.app_accounts WHERE user_id = auth.uid()) IN ('owner', 'admin')
            OR
            -- Altrimenti, se la notifica ha un branch_id, l'utente deve essere associato a quel branch
            branch_id IS NULL
            OR
            branch_id = ANY(
                SELECT unnest(branches) FROM public.app_accounts WHERE user_id = auth.uid()
            )
        )
    );

-- 3. Aggiornamento Trigger per Daily Reports (Chiusure cassa e depositi)
CREATE OR REPLACE FUNCTION public.fn_trigger_daily_reports_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_name text;
    v_branch_id text;
BEGIN
    -- Chiusura cassa inviata
    IF TG_TABLE_NAME = 'cashier_closings' AND TG_OP = 'INSERT' THEN
        SELECT name INTO v_branch_name 
        FROM public.provider_branches 
        WHERE id = NEW.branch_id;
        
        IF v_branch_name IS NULL THEN
            v_branch_name := NEW.branch_id;
        END IF;

        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
        VALUES (
            'daily_reports',
            'Cashier Closing Submitted',
            'Đóng ca bán hàng đã nộp',
            'Cashier closing submitted for branch: ' || coalesce(v_branch_name, ''),
            'Báo cáo đóng ca đã được nộp cho chi nhánh: ' || coalesce(v_branch_name, ''),
            ARRAY['owner', 'admin', 'accountant'],
            NEW.branch_id::text
        );
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

-- 4. Aggiornamento Trigger per Catering
CREATE OR REPLACE FUNCTION public.fn_trigger_catering_notifications()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'event_headers' AND TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
        VALUES (
            'catering',
            'New Catering Event Created',
            'Sự kiện Catering mới',
            'New event "' || coalesce(NEW.event_name, '') || '" created.',
            'Sự kiện mới "' || coalesce(NEW.event_name, '') || '" đã được tạo.',
            ARRAY['owner', 'admin', 'manager', 'sale advisor'],
            NEW.provider_branch_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Aggiornamento Trigger per Recruitment (Richieste Assunzione e Candidature)
CREATE OR REPLACE FUNCTION public.fn_trigger_hiring_request_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_id text := NULL;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.branch_ids IS NOT NULL AND array_length(NEW.branch_ids, 1) > 0 THEN
            v_branch_id := NEW.branch_ids[1];
        END IF;

        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
        VALUES (
            'recruitment',
            'New Hiring Request',
            'Yêu cầu tuyển dụng mới',
            'A new hiring request for ' || coalesce(NEW.position_title, 'job') || ' has been submitted.',
            'Một yêu cầu tuyển dụng mới cho ' || coalesce(NEW.position_title, 'công việc') || ' đã được gửi.',
            ARRAY['owner', 'admin', 'hr manager'],
            v_branch_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_trigger_candidate_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_pos_title TEXT;
    v_branch_id TEXT := NULL;
BEGIN
    IF NEW.hiring_request_id IS NOT NULL THEN
        SELECT position_title, (CASE WHEN branch_ids IS NOT NULL AND array_length(branch_ids, 1) > 0 THEN branch_ids[1] ELSE NULL END)
        INTO v_pos_title, v_branch_id
        FROM public.hiring_requests 
        WHERE id = NEW.hiring_request_id;
    END IF;
    
    IF v_pos_title IS NULL THEN
        v_pos_title := 'job';
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
        VALUES (
            'recruitment',
            'New Candidate Applied',
            'Ứng viên mới ứng tuyển',
            NEW.full_name || ' applied for the ' || v_pos_title || ' position.',
            NEW.full_name || ' đã ứng tuyển vào vị trí ' || v_pos_title || '.',
            ARRAY['owner', 'admin', 'hr manager'],
            v_branch_id
        );
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.offer_approval_status = 'pending' AND (OLD.offer_approval_status IS NULL OR OLD.offer_approval_status <> 'pending') THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
            VALUES (
                'recruitment',
                'Job Offer Pending Approval',
                'Thư mời nhận việc chờ duyệt',
                'The job offer for ' || NEW.full_name || ' is pending approval.',
                'Thư mời nhận việc cho ' || NEW.full_name || ' đang chờ được phê duyệt.',
                ARRAY['owner', 'admin'],
                v_branch_id
            );
        END IF;

        IF NEW.offer_approval_status = 'approved' AND (OLD.offer_approval_status IS NULL OR OLD.offer_approval_status <> 'approved') THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
            VALUES (
                'recruitment',
                'Job Offer Approved',
                'Thư mời nhận việc đã duyệt',
                'The job offer for ' || NEW.full_name || ' has been approved.',
                'Thư mời nhận việc cho ' || NEW.full_name || ' đã được phê duyệt.',
                ARRAY['owner', 'admin', 'hr manager'],
                v_branch_id
            );
        END IF;

        IF NEW.offer_approval_status = 'rejected' AND (OLD.offer_approval_status IS NULL OR OLD.offer_approval_status <> 'rejected') THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
            VALUES (
                'recruitment',
                'Job Offer Rejected',
                'Thư mời nhận việc bị từ chối',
                'The job offer for ' || NEW.full_name || ' has been rejected.',
                'Thư mời nhận việc cho ' || NEW.full_name || ' đã bị từ chối.',
                ARRAY['owner', 'admin', 'hr manager'],
                v_branch_id
            );
        END IF;

        IF NEW.stage = 'interview_scheduled' AND NEW.interview_scheduled_at IS NOT NULL AND (OLD.interview_scheduled_at IS NULL OR OLD.interview_scheduled_at <> NEW.interview_scheduled_at) THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
            VALUES (
                'recruitment',
                'Interview Scheduled',
                'Lịch phỏng vấn đã xếp',
                'Interview scheduled for ' || NEW.full_name || ' on ' || to_char(NEW.interview_scheduled_at, 'DD/MM/YYYY HH24:MI') || '.',
                'Lịch phỏng vấn cho ' || NEW.full_name || ' đã được xếp vào ngày ' || to_char(NEW.interview_scheduled_at, 'DD/MM/YYYY HH24:MI') || '.',
                ARRAY['owner', 'admin', 'hr manager', 'manager'],
                v_branch_id
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Aggiornamento Trigger per HR Management (Richiami e Sanzioni)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_warnings_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
    v_branch_id TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;
    
    SELECT branch_id INTO v_branch_id FROM public.hr_staff_branches WHERE staff_id = NEW.staff_id AND is_primary = true LIMIT 1;
    IF v_branch_id IS NULL THEN
        SELECT branch_id INTO v_branch_id FROM public.hr_staff_branches WHERE staff_id = NEW.staff_id LIMIT 1;
    END IF;

    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
    VALUES (
        'recruitment',
        'Disciplinary Warning Issued',
        'Cảnh cáo kỷ luật đã ban hành',
        'New disciplinary warning (' || coalesce(NEW.flag_type, 'warning') || ') issued for ' || coalesce(v_staff_name, 'staff') || ': ' || coalesce(NEW.reason, ''),
        'Đã ban hành cảnh cáo kỷ luật mới (' || coalesce(NEW.flag_type, 'cảnh cáo') || ') cho ' || coalesce(v_staff_name, 'nhân viên') || ': ' || coalesce(NEW.reason, ''),
        ARRAY['owner', 'admin', 'manager'],
        v_branch_id
    );

    -- Portale staff (non ha bisogno di modifiche)
    INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
    VALUES (
        NEW.staff_id,
        'Disciplinary Warning Received',
        'Nhận cảnh cáo kỷ luật',
        'You have received a ' || coalesce(NEW.flag_type, 'disciplinary') || ' warning on ' || to_char(NEW.date, 'DD/MM/YYYY') || ': ' || coalesce(NEW.reason, ''),
        'Bạn đã nhận được một cảnh cáo ' || coalesce(NEW.flag_type, 'kỷ luật') || ' vào ngày ' || to_char(NEW.date, 'DD/MM/YYYY') || ': ' || coalesce(NEW.reason, ''),
        'warning'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_trigger_hr_fines_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
    v_branch_id TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    SELECT branch_id INTO v_branch_id FROM public.hr_staff_branches WHERE staff_id = NEW.staff_id AND is_primary = true LIMIT 1;
    IF v_branch_id IS NULL THEN
        SELECT branch_id INTO v_branch_id FROM public.hr_staff_branches WHERE staff_id = NEW.staff_id LIMIT 1;
    END IF;

    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
    VALUES (
        'recruitment',
        'Disciplinary Fine Registered',
        'Khấu trừ kỷ luật đã ghi nhận',
        'A fine of ' || coalesce(NEW.amount::text, '0') || ' VND registered for ' || coalesce(v_staff_name, 'staff') || ': ' || coalesce(NEW.infraction, ''),
        'Đã ghi nhận khoản phạt ' || coalesce(NEW.amount::text, '0') || ' VND cho ' || coalesce(v_staff_name, 'nhân viên') || ': ' || coalesce(NEW.infraction, ''),
        ARRAY['owner', 'admin', 'manager'],
        v_branch_id
    );

    INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
    VALUES (
        NEW.staff_id,
        'Disciplinary Fine Received',
        'Nhận khấu trừ kỷ luật',
        'A fine of ' || coalesce(NEW.amount::text, '0') || ' VND has been registered on ' || to_char(NEW.date, 'DD/MM/YYYY') || ': ' || coalesce(NEW.infraction, ''),
        'Một khoản phạt trị giá ' || coalesce(NEW.amount::text, '0') || ' VND đã bị ghi nhận vào ngày ' || to_char(NEW.date, 'DD/MM/YYYY') || ': ' || coalesce(NEW.infraction, ''),
        'fine'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_trigger_hr_awards_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
    v_branch_id TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    SELECT branch_id INTO v_branch_id FROM public.hr_staff_branches WHERE staff_id = NEW.staff_id AND is_primary = true LIMIT 1;
    IF v_branch_id IS NULL THEN
        SELECT branch_id INTO v_branch_id FROM public.hr_staff_branches WHERE staff_id = NEW.staff_id LIMIT 1;
    END IF;

    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles, branch_id)
    VALUES (
        'recruitment',
        'Staff Award Issued',
        'Khen thưởng nhân viên',
        'Award "' || coalesce(NEW.award_name, '') || '" (' || coalesce(NEW.amount::text, '0') || ' VND) issued for ' || coalesce(v_staff_name, 'staff') || '.',
        'Khen thưởng "' || coalesce(NEW.award_name, '') || '" (' || coalesce(NEW.amount::text, '0') || ' VND) cho ' || coalesce(v_staff_name, 'nhân viên') || '.',
        ARRAY['owner', 'admin', 'manager'],
        v_branch_id
    );

    INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
    VALUES (
        NEW.staff_id,
        'Staff Award Received',
        'Nhận khen thưởng nhân viên',
        'You have received the award "' || coalesce(NEW.award_name, '') || '" of ' || coalesce(NEW.amount::text, '0') || ' VND on ' || to_char(NEW.date, 'DD/MM/YYYY') || '.',
        'Bạn đã nhận được khen thưởng "' || coalesce(NEW.award_name, '') || '" trị giá ' || coalesce(NEW.amount::text, '0') || ' VND vào ngày ' || to_char(NEW.date, 'DD/MM/YYYY') || '.',
        'award'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
