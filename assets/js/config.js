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

const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
