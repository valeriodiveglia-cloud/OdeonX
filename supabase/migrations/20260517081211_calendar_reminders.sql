CREATE TABLE IF NOT EXISTS public.fin_calendar_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    estimated_amount NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'VND',
    start_date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    frequency VARCHAR(50) CHECK (frequency IN ('Monthly', 'Quarterly', 'Semi-Annually', 'Annually')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS public.fin_reminder_dismissals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_id UUID REFERENCES public.fin_calendar_reminders(id) ON DELETE CASCADE,
    dismissed_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE(reminder_id, dismissed_date)
);

ALTER TABLE public.fin_calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_reminder_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON public.fin_calendar_reminders FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON public.fin_reminder_dismissals FOR ALL TO authenticated USING (true);
