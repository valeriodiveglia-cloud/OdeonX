-- Migrazione per la creazione dei trigger di notifica del sottomodulo HR Management.
-- Copre: Richiami (warnings), Multe (fines), Premi (awards), Contratti (contracts), Storico stipendi e Promozioni (salary_history).
-- Invia notifiche sia a public.app_notifications (per l'app gestionale) 
-- sia a public.hr_staff_notifications (per lo staff interessato sul portale dello staff).

-- 1. TRIGGER PER RICHIAMI DISCIPLINARI (hr_staff_warnings)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_warnings_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
BEGIN
    -- Recupera il nome dello staff
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- A. Notifica all'app gestionale (owner, admin, manager)
    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'recruitment', -- fa parte del modulo HR (usiamo lo stesso filtro UI)
        'Disciplinary Warning Issued',
        'Cảnh cáo kỷ luật đã ban hành',
        'New disciplinary warning (' || coalesce(NEW.flag_type, 'warning') || ') issued for ' || coalesce(v_staff_name, 'staff') || ': ' || coalesce(NEW.reason, ''),
        'Đã ban hành cảnh cáo kỷ luật mới (' || coalesce(NEW.flag_type, 'cảnh cáo') || ') cho ' || coalesce(v_staff_name, 'nhân viên') || ': ' || coalesce(NEW.reason, ''),
        ARRAY['owner', 'admin', 'manager']
    );

    -- B. Notifica al portale dello staff (staff interessato)
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

DROP TRIGGER IF EXISTS tr_hr_warnings_notifications ON public.hr_staff_warnings;
CREATE TRIGGER tr_hr_warnings_notifications
    AFTER INSERT ON public.hr_staff_warnings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_warnings_notifications();


-- 2. TRIGGER PER SANZIONI / MULTE (hr_staff_fines)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_fines_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- A. Notifica all'app gestionale (owner, admin, manager)
    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'recruitment',
        'Disciplinary Fine Registered',
        'Khấu trừ kỷ luật đã ghi nhận',
        'A fine of ' || coalesce(NEW.amount::text, '0') || ' VND registered for ' || coalesce(v_staff_name, 'staff') || ': ' || coalesce(NEW.infraction, ''),
        'Đã ghi nhận khoản phạt ' || coalesce(NEW.amount::text, '0') || ' VND cho ' || coalesce(v_staff_name, 'nhân viên') || ': ' || coalesce(NEW.infraction, ''),
        ARRAY['owner', 'admin', 'manager']
    );

    -- B. Notifica al portale dello staff (staff interessato)
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

DROP TRIGGER IF EXISTS tr_hr_fines_notifications ON public.hr_staff_fines;
CREATE TRIGGER tr_hr_fines_notifications
    AFTER INSERT ON public.hr_staff_fines
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_fines_notifications();


-- 3. TRIGGER PER PREMI E RICONOSCIMENTI (hr_staff_awards)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_awards_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- A. Notifica all'app gestionale (owner, admin, manager)
    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'recruitment',
        'Staff Award Issued',
        'Khen thưởng nhân viên',
        'Award "' || coalesce(NEW.award_name, '') || '" (' || coalesce(NEW.amount::text, '0') || ' VND) issued for ' || coalesce(v_staff_name, 'staff') || '.',
        'Khen thưởng "' || coalesce(NEW.award_name, '') || '" (' || coalesce(NEW.amount::text, '0') || ' VND) cho ' || coalesce(v_staff_name, 'nhân viên') || '.',
        ARRAY['owner', 'admin', 'manager']
    );

    -- B. Notifica al portale dello staff (staff interessato)
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

DROP TRIGGER IF EXISTS tr_hr_awards_notifications ON public.hr_staff_awards;
CREATE TRIGGER tr_hr_awards_notifications
    AFTER INSERT ON public.hr_staff_awards
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_awards_notifications();


-- 4. TRIGGER PER CONTRATTI DI LAVORO (hr_staff_contracts)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_contracts_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- Notifica all'app gestionale (owner, admin)
    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'recruitment',
        'New Contract Registered',
        'Đăng ký hợp đồng mới',
        'New contract version #' || coalesce(NEW.version::text, '1') || ' registered for ' || coalesce(v_staff_name, 'staff') || ' starting ' || to_char(NEW.signing_date, 'DD/MM/YYYY') || '.',
        'Hợp đồng mới phiên bản #' || coalesce(NEW.version::text, '1') || ' đã được đăng ký cho ' || coalesce(v_staff_name, 'nhân viên') || ' bắt đầu từ ' || to_char(NEW.signing_date, 'DD/MM/YYYY') || '.',
        ARRAY['owner', 'admin']
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_contracts_notifications ON public.hr_staff_contracts;
CREATE TRIGGER tr_hr_contracts_notifications
    AFTER INSERT ON public.hr_staff_contracts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_contracts_notifications();


-- 5. TRIGGER PER STORICO STIPENDI & PROMOZIONI (hr_staff_salary_history)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_salary_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
    v_prev_pos TEXT;
    v_new_pos TEXT;
    v_is_promo BOOLEAN := FALSE;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- Verifica se c'è un cambio di posizione (promozione)
    IF NEW.new_position_id IS NOT NULL AND (NEW.previous_position_id IS NULL OR NEW.previous_position_id <> NEW.new_position_id) THEN
        v_is_promo := TRUE;
        SELECT title INTO v_prev_pos FROM public.hr_positions WHERE id = NEW.previous_position_id;
        SELECT title INTO v_new_pos FROM public.hr_positions WHERE id = NEW.new_position_id;
    END IF;

    -- A. Notifica all'app gestionale (owner, admin, accountant)
    IF v_is_promo THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'Promotion & Salary Update',
            'Thăng chức & Cập nhật lương',
            coalesce(v_staff_name, 'Staff') || ' promoted to ' || coalesce(v_new_pos, 'new role') || ' (Salary: ' || coalesce(NEW.new_amount::text, '0') || ' VND).',
            coalesce(v_staff_name, 'Nhân viên') || ' đã được thăng chức lên ' || coalesce(v_new_pos, 'vị trí mới') || ' (Mức lương: ' || coalesce(NEW.new_amount::text, '0') || ' VND).',
            ARRAY['owner', 'admin', 'accountant']
        );
    ELSE
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'Salary Update',
            'Cập nhật lương',
            'Salary update for ' || coalesce(v_staff_name, 'staff') || ' from ' || coalesce(NEW.previous_amount::text, '0') || ' to ' || coalesce(NEW.new_amount::text, '0') || ' VND.',
            'Cập nhật lương cho ' || coalesce(v_staff_name, 'nhân viên') || ' từ ' || coalesce(NEW.previous_amount::text, '0') || ' lên ' || coalesce(NEW.new_amount::text, '0') || ' VND.',
            ARRAY['owner', 'admin', 'accountant']
        );
    END IF;

    -- B. Notifica al portale dello staff (staff interessato)
    IF v_is_promo THEN
        INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
        VALUES (
            NEW.staff_id,
            'Promotion & Salary Update',
            'Thăng chức & Cập nhật lương',
            'Congratulations! You have been promoted to ' || coalesce(v_new_pos, 'new role') || ' with a new salary of ' || coalesce(NEW.new_amount::text, '0') || ' VND effective ' || to_char(NEW.effective_date, 'DD/MM/YYYY') || '.',
            'Chúc mừng! Bạn đã được thăng chức lên vị trí ' || coalesce(v_new_pos, 'mới') || ' với mức lương mới ' || coalesce(NEW.new_amount::text, '0') || ' VND có hiệu lực từ ' || to_char(NEW.effective_date, 'DD/MM/YYYY') || '.',
            'salary'
        );
    ELSE
        INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
        VALUES (
            NEW.staff_id,
            'Salary Update Received',
            'Nhận thông tin cập nhật lương',
            'Your salary has been updated to ' || coalesce(NEW.new_amount::text, '0') || ' VND effective ' || to_char(NEW.effective_date, 'DD/MM/YYYY') || '.',
            'Mức lương của bạn đã được cập nhật thành ' || coalesce(NEW.new_amount::text, '0') || ' VND có hiệu lực từ ' || to_char(NEW.effective_date, 'DD/MM/YYYY') || '.',
            'salary'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_salary_notifications ON public.hr_staff_salary_history;
CREATE TRIGGER tr_hr_salary_notifications
    AFTER INSERT ON public.hr_staff_salary_history
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_salary_notifications();
