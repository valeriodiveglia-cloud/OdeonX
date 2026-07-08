-- Create trigger function for recruitment postings activity logging
CREATE OR REPLACE FUNCTION public.on_recruitment_posting_change()
RETURNS TRIGGER AS $$
DECLARE
    v_position_title TEXT;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Get the position title of the hiring request
        SELECT position_title INTO v_position_title
        FROM public.hiring_requests
        WHERE id = NEW.hiring_request_id;
        
        INSERT INTO public.hr_activity_log (hiring_request_id, action_type, message)
        VALUES (
            NEW.hiring_request_id,
            'posting_added',
            'Job posted on ' || NEW.platform || ' for "' || COALESCE(v_position_title, 'Unknown') || '" / Đã đăng tuyển trên ' || NEW.platform || ' cho "' || COALESCE(v_position_title, 'Unknown') || '"'
        );
    ELSIF (TG_OP = 'DELETE') THEN
        -- Get the position title of the hiring request
        SELECT position_title INTO v_position_title
        FROM public.hiring_requests
        WHERE id = OLD.hiring_request_id;
        
        INSERT INTO public.hr_activity_log (hiring_request_id, action_type, message)
        VALUES (
            OLD.hiring_request_id,
            'posting_deleted',
            'Job posting on ' || OLD.platform || ' for "' || COALESCE(v_position_title, 'Unknown') || '" was deleted / Đã xóa nhật ký đăng tuyển trên ' || OLD.platform || ' cho "' || COALESCE(v_position_title, 'Unknown') || '"'
        );
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS tr_recruitment_posting_activity ON public.recruitment_postings;

-- Create trigger
CREATE TRIGGER tr_recruitment_posting_activity
AFTER INSERT OR DELETE ON public.recruitment_postings
FOR EACH ROW
EXECUTE FUNCTION public.on_recruitment_posting_change();
