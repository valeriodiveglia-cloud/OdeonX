-- Table: hr_interview_templates
CREATE TABLE IF NOT EXISTS public.hr_interview_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    name TEXT NOT NULL,
    department TEXT, -- Optional department name matching
    position_title TEXT, -- Optional position title matching
    employment_type TEXT, -- Optional employment type matching
    is_default BOOLEAN DEFAULT false,
    sections JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.hr_interview_templates ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.hr_interview_templates;

-- Policy for Authenticated Users
CREATE POLICY "Enable all access for authenticated users" ON public.hr_interview_templates 
    FOR ALL 
    USING (auth.role() = 'authenticated');

-- Grant access to authenticated users and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_interview_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_interview_templates TO service_role;

-- Seed Default Template (The 10 classic restaurant interview questions)
INSERT INTO public.hr_interview_templates (name, is_default, sections)
VALUES (
    'Default Restaurant Interview Template',
    true,
    '[
      {
        "id": "sec_1",
        "name_en": "Background & Motivation",
        "name_vi": "Thông tin cơ bản & Động lực",
        "questions": [
          {
            "id": "q1_background",
            "text_en": "1. Tell us briefly about your professional career in the industry. What tasks did you perform?",
            "text_vi": "1. Hãy chia sẻ ngắn gọn về quá trình làm việc của bạn trong ngành này. Bạn đã làm những công việc gì?",
            "type": "text"
          },
          {
            "id": "q2_motivation",
            "text_en": "2. What attracts you most about this position and our brand?",
            "text_vi": "2. Điều gì thu hút bạn nhất ở vị trí này và thương hiệu của chúng tôi?",
            "type": "text"
          }
        ]
      },
      {
        "id": "sec_2",
        "name_en": "Professional Skills & Scenarios",
        "name_vi": "Kỹ năng chuyên môn & Tình huống",
        "questions": [
          {
            "id": "q3_skills",
            "text_en": "3. Cooking/Service: How do you manage order times, table organization, and rush hours?",
            "text_vi": "3. Bếp/Phục vụ: Bạn quản lý thời gian ra món, sắp xếp bàn và các khung giờ cao điểm như thế nào?",
            "type": "text"
          },
          {
            "id": "q4_customer",
            "text_en": "4. Describe how you handle a difficult customer or a mistake during service.",
            "text_vi": "4. Mô tả cách bạn xử lý một khách hàng khó tính hoặc một sai sót trong quá trình phục vụ.",
            "type": "text"
          },
          {
            "id": "q5_haccp",
            "text_en": "5. Do you regularly apply HACCP and food safety procedures? Give us an example.",
            "text_vi": "5. Bạn có thường xuyên áp dụng quy trình HACCP và an toàn thực phẩm không? Cho ví dụ.",
            "type": "text"
          }
        ]
      },
      {
        "id": "sec_3",
        "name_en": "Teamwork & Stress Management",
        "name_vi": "Lực lượng phối hợp & Khả năng chịu áp lực",
        "questions": [
          {
            "id": "q6_feedback",
            "text_en": "6. How do you react to constructive feedback or criticism from a manager or chef?",
            "text_vi": "6. Bạn phản ứng thế nào trước phản hồi mang tính xây dựng hoặc sự phê bình từ quản lý hoặc bếp trưởng?",
            "type": "text"
          },
          {
            "id": "q7_teamwork",
            "text_en": "7. Tell us about a time when you had to help a colleague in difficulty during service.",
            "text_vi": "7. Kể về một lần bạn phải giúp đỡ một đồng nghiệp gặp khó khăn trong quá trình làm việc.",
            "type": "text"
          },
          {
            "id": "q8_stress",
            "text_en": "8. How do you maintain calm and efficiency under stress in a chaotic moment?",
            "text_vi": "8. Làm thế nào để bạn giữ bình tĩnh và hiệu quả dưới áp lực trong những thời điểm hỗn loạn?",
            "type": "text"
          }
        ]
      },
      {
        "id": "sec_4",
        "name_en": "Logistics & Availability",
        "name_vi": "Logistics & Sự linh hoạt thời gian",
        "questions": [
          {
            "id": "q9_availability",
            "text_en": "9. What is your actual availability for split shifts, evening shifts, and weekends?",
            "text_vi": "9. Khả năng làm việc thực tế của bạn đối với ca gãy, ca tối và cuối tuần là gì?",
            "type": "text"
          },
          {
            "id": "q10_transport",
            "text_en": "10. Do you have transport or distance issues reaching the premises at these times?",
            "text_vi": "10. Bạn có gặp khó khăn về phương tiện đi lại hoặc khoảng cách khi đến quán vào những khung giờ này không?",
            "type": "text"
          }
        ]
      }
    ]'::jsonb
) ON CONFLICT DO NOTHING;

-- Notify pgrst to reload schema cache
NOTIFY pgrst, 'reload schema';
