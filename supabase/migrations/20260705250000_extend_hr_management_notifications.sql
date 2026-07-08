-- Migrazione per estendere il sistema di notifiche di HR Management.
-- Aggiunge:
-- 1. Notifica su inserimento di un nuovo staff (Onboarding di candidato)
-- 2. Notifica su attivazione account staff (Stato passa a 'active' dopo l'enrollment)
-- 3. Notifiche su aggiornamenti delle informazioni personali e bancarie dello staff
-- 4. Notifiche su assegnazione e restituzione di asset della compagnia (hr_staff_assets)
-- 5. Notifiche su caricamento di nuovi documenti per lo staff (hr_staff_documents)
-- 6. Funzione periodica per il controllo e la generazione di notifiche per contratti in scadenza e scaduti.

-- 1. TRIGGER PER ONBOARDING NUOVO DIPENDENTE (INSERT su hr_staff)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_staff_onboarding_notifications()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'recruitment',
        'Staff Onboarded Successfully',
        'Nhân viên đã onboard thành công',
        coalesce(NEW.full_name, 'Staff') || ' onboarded successfully as a staff member.',
        coalesce(NEW.full_name, 'Nhân viên') || ' đã được onboard thành công vào danh sách nhân viên.',
        ARRAY['owner', 'admin', 'hr manager']
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_staff_onboarding ON public.hr_staff;
CREATE TRIGGER tr_hr_staff_onboarding
    AFTER INSERT ON public.hr_staff
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_staff_onboarding_notifications();


-- 2. TRIGGER PER ATTIVAZIONE ACCOUNT / ACCESSO STAFF (status diventa 'active')
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_staff_active_notifications()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status <> 'active') THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'Staff Enrollment Completed',
            'Nhân viên đã hoàn tất đăng ký',
            coalesce(NEW.full_name, 'Staff') || ' completed enrollment and is now active.',
            coalesce(NEW.full_name, 'Nhân viên') || ' đã hoàn tất đăng ký tài khoản và đang hoạt động.',
            ARRAY['owner', 'admin', 'hr manager']
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_staff_active ON public.hr_staff;
CREATE TRIGGER tr_hr_staff_active
    AFTER UPDATE OF status ON public.hr_staff
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_staff_active_notifications();


-- 3. TRIGGER PER MODIFICA INFORMAZIONI DIPENDENTE (UPDATE su hr_staff)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_staff_info_update_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Controlla se sono cambiati i dati personali (telefono, email, indirizzo)
    IF OLD.phone IS DISTINCT FROM NEW.phone OR OLD.email IS DISTINCT FROM NEW.email OR OLD.address IS DISTINCT FROM NEW.address THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'Staff Personal Info Updated',
            'Cập nhật thông tin cá nhân nhân viên',
            'Personal contact information updated for ' || coalesce(NEW.full_name, 'staff') || '.',
            'Thông tin liên hệ cá nhân của ' || coalesce(NEW.full_name, 'nhân viên') || ' đã được cập nhật.',
            ARRAY['owner', 'admin', 'hr manager']
        );
    END IF;

    -- Controlla se sono cambiati i dati bancari
    IF OLD.bank_name IS DISTINCT FROM NEW.bank_name OR OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number OR OLD.bank_account_name IS DISTINCT FROM NEW.bank_account_name THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'Staff Bank Details Updated',
            'Cập nhật tài khoản ngân hàng nhân viên',
            'Bank payment details updated for ' || coalesce(NEW.full_name, 'staff') || '.',
            'Thông tin tài khoản ngân hàng của ' || coalesce(NEW.full_name, 'nhân viên') || ' đã được cập nhật.',
            ARRAY['owner', 'admin', 'accountant']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_staff_info_update ON public.hr_staff;
CREATE TRIGGER tr_hr_staff_info_update
    AFTER UPDATE ON public.hr_staff
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_staff_info_update_notifications();


-- 4. TRIGGER PER ASSEGNAZIONE E RESTITUZIONE ASSET (hr_staff_assets)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_assets_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- A. Notifica all'app gestionale (owner, admin, manager)
    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'recruitment',
        'Company Asset Assigned',
        'Bàn giao thiết bị công ty',
        'Asset "' || coalesce(NEW.asset_name, 'item') || '" has been assigned to ' || coalesce(v_staff_name, 'staff') || '.',
        'Thiết bị "' || coalesce(NEW.asset_name, 'thiết bị') || '" đã được bàn giao cho ' || coalesce(v_staff_name, 'nhân viên') || '.',
        ARRAY['owner', 'admin', 'manager']
    );

    -- B. Notifica allo staff interessato (portale staff)
    INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
    VALUES (
        NEW.staff_id,
        'Company Asset Assigned',
        'Bàn giao thiết bị công ty',
        'Asset "' || coalesce(NEW.asset_name, 'item') || '" has been assigned to you starting ' || to_char(NEW.assigned_date, 'DD/MM/YYYY') || '.',
        'Thiết bị "' || coalesce(NEW.asset_name, 'thiết bị') || '" đã được bàn giao cho bạn bắt đầu từ ngày ' || to_char(NEW.assigned_date, 'DD/MM/YYYY') || '.',
        'general'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_assets_notifications ON public.hr_staff_assets;
CREATE TRIGGER tr_hr_assets_notifications
    AFTER INSERT ON public.hr_staff_assets
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_assets_notifications();


-- 5. TRIGGER PER CARICAMENTO DOCUMENTI DIPENDENTE (hr_staff_documents)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_documents_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- Notifica all'app gestionale (owner, admin, hr manager)
    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'recruitment',
        'New Document Uploaded',
        'Tài liệu mới đã tải lên',
        'Document "' || coalesce(NEW.document_name, 'doc') || '" (' || coalesce(NEW.document_category, 'general') || ') uploaded for ' || coalesce(v_staff_name, 'staff') || '.',
        'Tài liệu "' || coalesce(NEW.document_name, 'tài liệu') || '" (' || coalesce(NEW.document_category, 'chung') || ') đã được tải lên cho ' || coalesce(v_staff_name, 'nhân viên') || '.',
        ARRAY['owner', 'admin', 'hr manager']
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_documents_notifications ON public.hr_staff_documents;
CREATE TRIGGER tr_hr_documents_notifications
    AFTER INSERT ON public.hr_staff_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_documents_notifications();


-- 6. FUNZIONE PER IL CONTROLLO PERIODICO DELLE SCADENZE DEI CONTRATTI
CREATE OR REPLACE FUNCTION public.fn_check_contract_expirations()
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_days_left INTEGER;
    v_notif_exists BOOLEAN;
BEGIN
    FOR r IN 
        SELECT c.id, c.staff_id, c.expiration_date, s.full_name 
        FROM public.hr_staff_contracts c
        JOIN public.hr_staff s ON c.staff_id = s.id
        WHERE c.expiration_date IS NOT NULL
    LOOP
        v_days_left := r.expiration_date - CURRENT_DATE;

        -- Caso A: Scade tra circa 2 mesi (da 58 a 62 giorni rimasti)
        IF v_days_left >= 58 AND v_days_left <= 62 THEN
            SELECT EXISTS (
                SELECT 1 FROM public.app_notifications 
                WHERE module = 'recruitment' 
                  AND title_en = 'Contract Expiring in 2 Months'
                  AND message_en LIKE '%' || r.full_name || '%'
                  AND created_at > CURRENT_DATE - INTERVAL '10 days'
            ) INTO v_notif_exists;

            IF NOT v_notif_exists THEN
                INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
                VALUES (
                    'recruitment',
                    'Contract Expiring in 2 Months',
                    'Hợp đồng hết hạn sau 2 tháng',
                    'Contract for ' || r.full_name || ' will expire in 2 months (on ' || to_char(r.expiration_date, 'DD/MM/YYYY') || ').',
                    'Hợp đồng của ' || r.full_name || ' sẽ hết hạn sau 2 tháng (vào ngày ' || to_char(r.expiration_date, 'DD/MM/YYYY') || ').',
                    ARRAY['owner', 'admin']
                );
            END IF;
        END IF;

        -- Caso B: Scade tra circa 1 mese (da 28 a 32 giorni rimasti)
        IF v_days_left >= 28 AND v_days_left <= 32 THEN
            SELECT EXISTS (
                SELECT 1 FROM public.app_notifications 
                WHERE module = 'recruitment' 
                  AND title_en = 'Contract Expiring in 1 Month'
                  AND message_en LIKE '%' || r.full_name || '%'
                  AND created_at > CURRENT_DATE - INTERVAL '10 days'
            ) INTO v_notif_exists;

            IF NOT v_notif_exists THEN
                INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
                VALUES (
                    'recruitment',
                    'Contract Expiring in 1 Month',
                    'Hợp đồng hết hạn sau 1 tháng',
                    'Contract for ' || r.full_name || ' will expire in 1 month (on ' || to_char(r.expiration_date, 'DD/MM/YYYY') || ').',
                    'Hợp đồng của ' || r.full_name || ' sẽ hết hạn sau 1 tháng (vào ngày ' || to_char(r.expiration_date, 'DD/MM/YYYY') || ').',
                    ARRAY['owner', 'admin']
                );
            END IF;
        END IF;

        -- Caso C: Scaduto (giorni rimanenti <= 0)
        IF v_days_left <= 0 THEN
            SELECT EXISTS (
                SELECT 1 FROM public.app_notifications 
                WHERE module = 'recruitment' 
                  AND title_en = 'Contract Expired'
                  AND message_en LIKE '%' || r.full_name || '%'
                  AND created_at > CURRENT_DATE - INTERVAL '7 days' -- Ripete una volta a settimana se è scaduto
            ) INTO v_notif_exists;

            IF NOT v_notif_exists THEN
                INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
                VALUES (
                    'recruitment',
                    'Contract Expired',
                    'Hợp đồng đã hết hạn',
                    'Contract for ' || r.full_name || ' expired on ' || to_char(r.expiration_date, 'DD/MM/YYYY') || '.',
                    'Hợp đồng của ' || r.full_name || ' đã hết hạn vào ngày ' || to_char(r.expiration_date, 'DD/MM/YYYY') || '.',
                    ARRAY['owner', 'admin']
                );
            END IF;
        END IF;

    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
