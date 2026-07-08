-- Migrazione per la gestione delle notifiche di HR Operational (Roster & Turni).
-- 1. Aggiorna la funzione tr_notify_roster_publication() per inviare notifiche all'app gestionale (modulo 'operational' per owner e admin).
-- 2. Crea la funzione fn_trigger_hr_roster_assignments_notifications() ed il relativo trigger su hr_roster_assignments per gestire le variazioni dei turni post-pubblicazione.

-- 1. AGGIORNAMENTO DELLA FUNZIONE DI NOTIFICA PUBBLICAZIONE ROSTER ESISTENTE
CREATE OR REPLACE FUNCTION public.tr_notify_roster_publication()
RETURNS TRIGGER AS $$
DECLARE
  r_staff RECORD;
  branch_name text;
  week_start_str text;
  has_previous_publication boolean;
BEGIN
  SELECT name INTO branch_name FROM public.provider_branches WHERE id = NEW.branch_id;
  IF branch_name IS NULL THEN
    branch_name := 'Branch';
  END IF;
  week_start_str := to_char(NEW.week_start, 'DD/MM/YYYY');

  -- A. Notifica all'app gestionale per i manager (owner e admin)
  INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
  VALUES (
      'operational',
      'Roster Published',
      'Lịch làm việc đã công bố',
      'Roster published for ' || branch_name || ' starting ' || week_start_str || '.',
      'Lịch làm việc cho ' || branch_name || ' bắt đầu từ ngày ' || week_start_str || ' đã được công bố.',
      ARRAY['owner', 'admin']
  );

  -- B. Notifiche ai dipendenti (Logica preesistente)
  FOR r_staff IN 
    SELECT sb.staff_id 
    FROM public.hr_staff_branches sb
    JOIN public.hr_staff s ON s.id = sb.staff_id
    WHERE sb.branch_id = NEW.branch_id AND s.status = 'active'
  -- Mettiamo in ascolto anche del realtime del portale staff per ogni singolo dipendente
  LOOP
    SELECT EXISTS (
      SELECT 1 
      FROM public.hr_staff_notifications 
      WHERE staff_id = r_staff.staff_id 
        AND category = 'roster' 
        AND (body_en LIKE '%' || week_start_str || '%' OR body_vi LIKE '%' || week_start_str || '%')
    ) INTO has_previous_publication;

    IF has_previous_publication THEN
      INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
      VALUES (
        r_staff.staff_id,
        'Roster Updated',
        'Lịch làm việc đã cập nhật',
        'The roster for ' || branch_name || ' for the week starting ' || week_start_str || ' has been updated.',
        'Lịch làm việc của chi nhánh ' || branch_name || ' cho tuần từ ' || week_start_str || ' đã được cập nhật.',
        'roster'
      );
    ELSE
      INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
      VALUES (
        r_staff.staff_id,
        'Roster Published',
        'Lịch làm việc đã công bố',
        'The roster for ' || branch_name || ' for the week starting ' || week_start_str || ' has been published.',
        'Lịch làm việc của chi nhánh ' || branch_name || ' cho tuần từ ' || week_start_str || ' đã được công bố.',
        'roster'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. TRIGGER PER LE VARIAZIONI DEI TURNI PUNTUALI (INSERT OR UPDATE OR DELETE su hr_roster_assignments)
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_roster_assignments_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_target_row RECORD;
    v_week_start DATE;
    v_is_published BOOLEAN;
    v_branch_name TEXT;
    v_shift_code TEXT;
BEGIN
    v_target_row := COALESCE(NEW, OLD);
    
    -- Calcola il lunedì della settimana dell'assegnazione
    v_week_start := date_trunc('week', v_target_row.date)::date;

    -- Verifica se il roster è già stato pubblicato per questa settimana e filiale
    SELECT EXISTS (
        SELECT 1 FROM public.hr_published_rosters
        WHERE branch_id = v_target_row.branch_id
          AND week_start = v_week_start
    ) INTO v_is_published;

    -- Se il roster non è pubblicato, non inviare notifiche (siamo ancora in bozza/draft)
    IF NOT v_is_published THEN
        RETURN v_target_row;
    END IF;

    -- Recupera informazioni per il testo del messaggio
    SELECT name INTO v_branch_name FROM public.provider_branches WHERE id = v_target_row.branch_id;
    
    IF TG_OP <> 'DELETE' AND NEW.shift_ids IS NOT NULL THEN
        SELECT code INTO v_shift_code FROM public.hr_operational_shift_types WHERE id = NEW.shift_ids;
    ELSIF TG_OP = 'DELETE' AND OLD.shift_ids IS NOT NULL THEN
        SELECT code INTO v_shift_code FROM public.hr_operational_shift_types WHERE id = OLD.shift_ids;
    END IF;

    IF v_shift_code IS NULL THEN
        v_shift_code := 'work';
    END IF;

    -- Gestione Scenari
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
        VALUES (
            NEW.staff_id,
            'New Shift Assigned',
            'Phân công ca làm việc mới',
            'New shift ' || v_shift_code || ' assigned at ' || coalesce(v_branch_name, 'branch') || ' on ' || to_char(NEW.date, 'DD/MM/YYYY') || '.',
            'Bạn đã được phân công ca làm việc mới tại ' || coalesce(v_branch_name, 'chi nhánh') || ' ngày ' || to_char(NEW.date, 'DD/MM/YYYY') || ': ' || v_shift_code || '.',
            'roster'
        );
    ELSIF TG_OP = 'UPDATE' AND (OLD.shift_ids IS DISTINCT FROM NEW.shift_ids OR OLD.branch_id IS DISTINCT FROM NEW.branch_id OR OLD.date IS DISTINCT FROM NEW.date) THEN
        INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
        VALUES (
            NEW.staff_id,
            'Shift Schedule Updated',
            'Cập nhật ca làm việc',
            'Your shift at ' || coalesce(v_branch_name, 'branch') || ' on ' || to_char(NEW.date, 'DD/MM/YYYY') || ' has been updated to ' || v_shift_code || '.',
            'Lịch làm việc ngày ' || to_char(NEW.date, 'DD/MM/YYYY') || ' tại ' || coalesce(v_branch_name, 'chi nhánh') || ' của bạn đã được cập nhật thành ' || v_shift_code || '.',
            'roster'
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.hr_staff_notifications (staff_id, title_en, title_vi, body_en, body_vi, category)
        VALUES (
            OLD.staff_id,
            'Shift Cancelled',
            'Ca làm việc bị hủy',
            'Your shift at ' || coalesce(v_branch_name, 'branch') || ' on ' || to_char(OLD.date, 'DD/MM/YYYY') || ' has been cancelled.',
            'Ca làm việc ngày ' || to_char(OLD.date, 'DD/MM/YYYY') || ' tại ' || coalesce(v_branch_name, 'chi nhánh') || ' của bạn đã bị hủy.',
            'roster'
        );
    END IF;

    RETURN v_target_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hr_roster_assignments_notifications ON public.hr_roster_assignments;
CREATE TRIGGER tr_hr_roster_assignments_notifications
    AFTER INSERT OR UPDATE OR DELETE ON public.hr_roster_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hr_roster_assignments_notifications();
