-- Migrazione per la gestione delle notifiche di HR Time Keeping.
-- Modifiche mirate esclusivamente all'App Gestionale per Owner e Admin.

-- 1. TRIGGER PER NOTIFICHE GESTIONALI STRAORDINARI (hr_staff_overtime)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_staff_overtime_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
    v_target_row RECORD;
    v_comp_label TEXT;
BEGIN
    v_target_row := COALESCE(NEW, OLD);
    
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = v_target_row.staff_id;
    v_comp_label := CASE WHEN v_target_row.compensation_type = 'salary' THEN 'Salary' ELSE 'Leave Recovery' END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'time_keeping',
            'Overtime Registered',
            'Ghi nhận tăng ca',
            'Overtime of ' || v_target_row.hours || 'h registered for ' || v_staff_name || ' on ' || to_char(v_target_row.date, 'DD/MM/YYYY') || ' (' || v_comp_label || ').',
            'Ghi nhận tăng ca ' || v_target_row.hours || ' giờ cho ' || v_staff_name || ' ngày ' || to_char(v_target_row.date, 'DD/MM/YYYY') || ' (' || v_comp_label || ').',
            ARRAY['owner', 'admin']
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'time_keeping',
            'Overtime Deleted',
            'Hủy ghi nhận tăng ca',
            'Overtime record of ' || v_target_row.hours || 'h for ' || v_staff_name || ' on ' || to_char(v_target_row.date, 'DD/MM/YYYY') || ' has been deleted.',
            'Bản ghi tăng ca ' || v_target_row.hours || ' giờ của ' || v_staff_name || ' ngày ' || to_char(v_target_row.date, 'DD/MM/YYYY') || ' đã bị hủy.',
            ARRAY['owner', 'admin']
        );
    END IF;

    RETURN v_target_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_staff_overtime_notifications ON public.hr_staff_overtime;
CREATE TRIGGER tr_hr_staff_overtime_notifications
    AFTER INSERT OR DELETE ON public.hr_staff_overtime
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_staff_overtime_notifications();


-- 2. TRIGGER PER ALERT ANOMALIE PRESENZE GESTIONALE (hr_staff_attendance_monthly)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_staff_attendance_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name TEXT;
    v_has_warning BOOLEAN := FALSE;
    v_warn_msg_en TEXT := '';
    v_warn_msg_vi TEXT := '';
BEGIN
    SELECT full_name INTO v_staff_name FROM public.hr_staff WHERE id = NEW.staff_id;

    -- Controllo anomalie
    IF NEW.no_shows_count > 0 THEN
        v_has_warning := TRUE;
        v_warn_msg_en := v_warn_msg_en || NEW.no_shows_count || ' no-shows ';
        v_warn_msg_vi := v_warn_msg_vi || NEW.no_shows_count || ' lần nghỉ không phép ';
    END IF;

    IF NEW.lates_count >= 3 OR NEW.lates_minutes >= 60 THEN
        v_has_warning := TRUE;
        v_warn_msg_en := v_warn_msg_en || NEW.lates_count || ' lates (' || NEW.lates_minutes || ' min) ';
        v_warn_msg_vi := v_warn_msg_vi || NEW.lates_count || ' lần đi trễ (' || NEW.lates_minutes || ' phút) ';
    END IF;

    -- Inserisce notifica solo se c'è un'anomalia rilevata
    IF v_has_warning THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'time_keeping',
            'Attendance Warning',
            'Cảnh cáo chuyên cần',
            'Critical attendance warning for ' || v_staff_name || ' in ' || NEW.month_id || ': ' || trim(v_warn_msg_en) || '.',
            'Cảnh báo chuyên cần nghiêm trọng cho ' || v_staff_name || ' trong tháng ' || NEW.month_id || ': ' || trim(v_warn_msg_vi) || '.',
            ARRAY['owner', 'admin']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_staff_attendance_notifications ON public.hr_staff_attendance_monthly;
CREATE TRIGGER tr_hr_staff_attendance_notifications
    AFTER INSERT OR UPDATE ON public.hr_staff_attendance_monthly
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_staff_attendance_notifications();


-- 3. TRIGGER PER NOTIFICA GESTIONALE SERVICE CHARGE (hr_service_charges)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_service_charge_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_amount_formatted TEXT;
BEGIN
    v_amount_formatted := to_char(NEW.total_amount, 'FM999,999,999');

    INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
    VALUES (
        'time_keeping',
        'Service Charge Distributed',
        'Phân bổ phí dịch vụ',
        'Service Charge pool of ' || v_amount_formatted || ' VND distributed for ' || NEW.city || ' in ' || NEW.month_id || '.',
        'Hạn mức phí dịch vụ ' || v_amount_formatted || ' VND đã được phân bổ cho ' || NEW.city || ' trong tháng ' || NEW.month_id || '.',
        ARRAY['owner', 'admin']
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_service_charge_notifications ON public.hr_service_charges;
CREATE TRIGGER tr_hr_service_charge_notifications
    AFTER INSERT OR UPDATE ON public.hr_service_charges
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_service_charge_notifications();
