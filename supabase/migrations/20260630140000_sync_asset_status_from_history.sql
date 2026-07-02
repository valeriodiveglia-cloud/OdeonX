-- Migration to add trigger that syncs hr_staff_assets.status after updating or deleting from hr_staff_asset_history

-- 1. Aggiorniamo la funzione del trigger esistente su hr_staff_assets per essere protetta e idempotente
CREATE OR REPLACE FUNCTION public.log_hr_staff_asset_status_change()
RETURNS trigger AS $$
DECLARE
    last_hist_status text;
    last_hist_notes text;
BEGIN
    -- Selezioniamo l'ultimo stato inserito nella history
    SELECT status, notes INTO last_hist_status, last_hist_notes 
    FROM public.hr_staff_asset_history 
    WHERE asset_id = NEW.id 
    ORDER BY changed_at DESC, created_at DESC 
    LIMIT 1;

    -- Se lo stato o le note correnti differiscono dall'ultimo inserito nella history (o non ci sono record storici), inseriamo il log
    IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) OR (NEW.notes IS DISTINCT FROM OLD.notes) THEN
        IF last_hist_status IS DISTINCT FROM NEW.status OR last_hist_notes IS DISTINCT FROM NEW.notes OR last_hist_status IS NULL THEN
            INSERT INTO public.hr_staff_asset_history (asset_id, status, changed_at, notes)
            VALUES (
                NEW.id,
                NEW.status,
                COALESCE(NEW.return_date, NEW.assigned_date, CURRENT_DATE),
                NEW.notes
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Creiamo la funzione trigger per sincronizzare l'asset quando la history viene modificata o eliminata
CREATE OR REPLACE FUNCTION public.sync_hr_staff_asset_from_history()
RETURNS trigger AS $$
DECLARE
    v_last_status text;
    v_last_notes text;
    v_last_changed_at date;
    v_asset_id uuid;
END; -- Wait, this is empty? No, let's write body:
DECLARE
    v_last_status text;
    v_last_notes text;
    v_last_changed_at date;
    v_asset_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_asset_id := OLD.asset_id;
    ELSE
        v_asset_id := NEW.asset_id;
    END IF;

    -- Otteniamo l'ultimo record della history per questo asset
    SELECT status, notes, changed_at INTO v_last_status, v_last_notes, v_last_changed_at
    FROM public.hr_staff_asset_history
    WHERE asset_id = v_asset_id
    ORDER BY changed_at DESC, created_at DESC
    LIMIT 1;

    -- Se non ci sono più record storici per questo asset, reimpostiamo i valori iniziali di default
    IF v_last_status IS NULL THEN
        UPDATE public.hr_staff_assets
        SET status = 'assigned',
            return_date = NULL,
            notes = NULL
        WHERE id = v_asset_id;
    ELSE
        UPDATE public.hr_staff_assets
        SET status = v_last_status,
            notes = v_last_notes,
            return_date = CASE WHEN v_last_status = 'returned' THEN v_last_changed_at ELSE NULL END
        WHERE id = v_asset_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Registriamo il trigger AFTER UPDATE OR DELETE su hr_staff_asset_history
DROP TRIGGER IF EXISTS trg_sync_hr_staff_asset_from_history ON public.hr_staff_asset_history;
CREATE TRIGGER trg_sync_hr_staff_asset_from_history
AFTER UPDATE OR DELETE ON public.hr_staff_asset_history
FOR EACH ROW
EXECUTE FUNCTION public.sync_hr_staff_asset_from_history();
