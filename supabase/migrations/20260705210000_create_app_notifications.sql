-- Migrazione per la creazione del sistema centrale delle notifiche dell'applicazione.
-- Questa migrazione crea le tabelle app_notifications e app_notification_reads.
-- Inoltre crea i trigger per il modulo HR Recruitment (candidates e hiring_requests).

-- 1. Tabella delle Notifiche
CREATE TABLE IF NOT EXISTS public.app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    module VARCHAR(50) NOT NULL, -- es. 'recruitment', 'finance', 'crm', 'loyalty', 'daily_reports', 'catering', 'assets'
    title_en VARCHAR(255) NOT NULL,
    title_vi VARCHAR(255) NOT NULL,
    message_en TEXT NOT NULL,
    message_vi TEXT NOT NULL,
    target_roles VARCHAR(50)[] DEFAULT NULL, -- Ruoli abilitati (es. ARRAY['admin', 'owner', 'hr manager']). Se NULL, visibile a tutti.
    target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT NULL
);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_app_notifications ON public.app_notifications;
CREATE POLICY select_app_notifications ON public.app_notifications
    FOR SELECT
    USING (
        (target_user_id IS NULL OR target_user_id = auth.uid())
        AND 
        (target_roles IS NULL OR (
            SELECT role FROM public.app_accounts WHERE user_id = auth.uid()
        ) = ANY(target_roles))
    );

-- 2. Tabella di Lettura Notifiche
CREATE TABLE IF NOT EXISTS public.app_notification_reads (
    notification_id UUID REFERENCES public.app_notifications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE public.app_notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS all_app_notification_reads ON public.app_notification_reads;
CREATE POLICY all_app_notification_reads ON public.app_notification_reads
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 3. Funzione e Trigger per public.candidates (HR Recruitment)
CREATE OR REPLACE FUNCTION public.fn_trigger_candidate_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_pos_title TEXT;
BEGIN
    -- Recupera il titolo della posizione lavorativa dalla richiesta di assunzione associata
    IF NEW.hiring_request_id IS NOT NULL THEN
        SELECT position_title INTO v_pos_title 
        FROM public.hiring_requests 
        WHERE id = NEW.hiring_request_id;
    END IF;
    
    IF v_pos_title IS NULL THEN
        v_pos_title := 'job';
    END IF;

    -- Caso A: Inserimento Candidato (Nuova Candidatura)
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'New Candidate Applied',
            'Ứng viên mới ứng tuyển',
            NEW.full_name || ' applied for the ' || v_pos_title || ' position.',
            NEW.full_name || ' đã ứng tuyển vào vị trí ' || v_pos_title || '.',
            ARRAY['owner', 'admin', 'hr manager']
        );
    END IF;

    -- Caso B: Aggiornamento Stato (Job Offer o Approvazioni)
    IF TG_OP = 'UPDATE' THEN
        -- B1: Offerta inserita e in attesa di approvazione
        IF NEW.offer_approval_status = 'pending' AND (OLD.offer_approval_status IS NULL OR OLD.offer_approval_status <> 'pending') THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
            VALUES (
                'recruitment',
                'Job Offer Pending Approval',
                'Thư mời nhận việc chờ duyệt',
                'The job offer for ' || NEW.full_name || ' is pending approval.',
                'Thư mời nhận việc cho ' || NEW.full_name || ' đang chờ được phê duyệt.',
                ARRAY['owner', 'admin']
            );
        END IF;

        -- B2: Offerta approvata
        IF NEW.offer_approval_status = 'approved' AND (OLD.offer_approval_status IS NULL OR OLD.offer_approval_status <> 'approved') THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
            VALUES (
                'recruitment',
                'Job Offer Approved',
                'Thư mời nhận việc đã duyệt',
                'The job offer for ' || NEW.full_name || ' has been approved.',
                'Thư mời nhận việc cho ' || NEW.full_name || ' đã được phê duyệt.',
                ARRAY['owner', 'admin', 'hr manager']
            );
        END IF;

        -- B3: Offerta rifiutata
        IF NEW.offer_approval_status = 'rejected' AND (OLD.offer_approval_status IS NULL OR OLD.offer_approval_status <> 'rejected') THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
            VALUES (
                'recruitment',
                'Job Offer Rejected',
                'Thư mời nhận việc bị từ chối',
                'The job offer for ' || NEW.full_name || ' has been rejected.',
                'Thư mời nhận việc cho ' || NEW.full_name || ' đã bị từ chối.',
                ARRAY['owner', 'admin', 'hr manager']
            );
        END IF;

        -- B4: Colloquio pianificato o aggiornato
        IF NEW.stage = 'interview_scheduled' AND NEW.interview_scheduled_at IS NOT NULL AND (OLD.interview_scheduled_at IS NULL OR OLD.interview_scheduled_at <> NEW.interview_scheduled_at) THEN
            INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
            VALUES (
                'recruitment',
                'Interview Scheduled',
                'Lịch phỏng vấn đã xếp',
                'Interview scheduled for ' || NEW.full_name || ' on ' || to_char(NEW.interview_scheduled_at, 'DD/MM/YYYY HH24:MI') || '.',
                'Lịch phỏng vấn cho ' || NEW.full_name || ' đã được xếp vào ngày ' || to_char(NEW.interview_scheduled_at, 'DD/MM/YYYY HH24:MI') || '.',
                ARRAY['owner', 'admin', 'hr manager', 'manager']
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_candidate_notifications ON public.candidates;
CREATE TRIGGER tr_candidate_notifications
    AFTER INSERT OR UPDATE ON public.candidates
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_candidate_notifications();

-- 4. Funzione e Trigger per public.hiring_requests (HR Recruitment)
CREATE OR REPLACE FUNCTION public.fn_trigger_hiring_request_notifications()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'New Hiring Request',
            'Yêu cầu tuyển dụng mới',
            'A new hiring request for ' || coalesce(NEW.position_title, 'job') || ' has been submitted.',
            'Một yêu cầu tuyển dụng mới cho ' || coalesce(NEW.position_title, 'công việc') || ' đã được gửi.',
            ARRAY['owner', 'admin', 'hr manager']
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_hiring_request_notifications ON public.hiring_requests;
CREATE TRIGGER tr_hiring_request_notifications
    AFTER INSERT ON public.hiring_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trigger_hiring_request_notifications();
