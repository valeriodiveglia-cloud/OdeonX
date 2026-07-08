-- Migrazione per notificare owner, admin e manager quando uno staff diventa 'inactive' o 'terminated'
CREATE OR REPLACE FUNCTION public.fn_trigger_hr_staff_active_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Se diventa ACTIVE (completamento enrollment)
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
    -- 2. Se diventa INACTIVE (inattività o dimissioni)
    ELSIF NEW.status = 'inactive' AND (OLD.status IS NULL OR OLD.status <> 'inactive') THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'Staff Member Set Inactive',
            'Nhân viên ngừng hoạt động',
            coalesce(NEW.full_name, 'Staff') || ' has been set to Inactive status.',
            coalesce(NEW.full_name, 'Nhân viên') || ' đã được chuyển sang trạng thái ngừng hoạt động.',
            ARRAY['owner', 'admin', 'manager']
        );
    -- 3. Se diventa TERMINATED (licenziamento / dismissione)
    ELSIF NEW.status = 'terminated' AND (OLD.status IS NULL OR OLD.status <> 'terminated') THEN
        INSERT INTO public.app_notifications (module, title_en, title_vi, message_en, message_vi, target_roles)
        VALUES (
            'recruitment',
            'Staff Member Terminated',
            'Nhân viên đã thôi việc',
            coalesce(NEW.full_name, 'Staff') || ' has been set to Terminated status.',
            coalesce(NEW.full_name, 'Nhân viên') || ' đã được chuyển sang trạng thái thôi việc.',
            ARRAY['owner', 'admin', 'manager']
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sincronizza cache
NOTIFY pgrst, 'reload schema';
