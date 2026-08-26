/* ============================================================
   Madinty Ratan — ربط Supabase
   ------------------------------------------------------------
   هات القيمتين دول من:
   Supabase Dashboard ← Project Settings ← API

   • SUPABASE_URL       = Project URL       (شكله: https://xxxxx.supabase.co)
   • SUPABASE_ANON_KEY  = anon public key   (أو publishable key في المشاريع الجديدة)

   المفتاح ده عام ومكشوف للكل — ده طبيعي وآمن، لأن الحماية الحقيقية
   في قواعد RLS في supabase/schema.sql مش في إخفاء المفتاح.
   ⛔ متحطش هنا الـ service_role key نهائيًا.

   لو الخانتين فاضيتين، الموقع بيشتغل عادي من assets/js/data.js
   (بس لوحة التحكم مش هتشتغل).
   ============================================================ */

const SUPABASE_URL = "https://rmsospceilwkdsknkapw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtc29zcGNlaWx3a2Rza25rYXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTc5OTcsImV4cCI6MjEwMzMzMzk5N30.TOKB07fXjLHrFeNLxSn2WXYW6ZPHUStI086Mbe3aqwA";
