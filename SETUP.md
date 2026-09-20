# تشغيل الموقع على Cloudflare

الموقع كله — الصفحات وقاعدة البيانات والصور ولوحة التحكم — شغّال على
حساب Cloudflare واحد، من غير أي خدمة تانية.

| الحتة | الخدمة | اسمها في الحساب |
| --- | --- | --- |
| الصفحات + الـAPI | Workers | `madinty-ratan` |
| قاعدة البيانات | D1 | `madinty-ratan` |
| الصور المرفوعة من اللوحة | R2 | `madinty-ratan-media` |

**التركيب اتعمل خلاص.** الملف ده للرجوع ليه لما تحتاج تغيّر حاجة أو
تعيد التركيب من الصفر.

---

## اليومي: إزاي أرفع تعديل

أي تعديل في الكود (HTML أو CSS أو JS أو `data.js`):

```bash
npx wrangler deploy
```

وبس. التعديل بيبقى على الهوا في تانيتين.

> تعديلات المنتجات والأقسام والطلبات **مش** محتاجة نشر خالص — دي من
> لوحة التحكم وبتظهر للزوّار على طول.

---

## الأوامر اللي هتحتاجها

```bash
# نشر الموقع
npx wrangler deploy

# تشغيل نسخة محلية على http://localhost:8787 (بقاعدة بيانات محلية منفصلة)
npx wrangler dev

# شوف اللوج وهو شغّال
npx wrangler tail

# استعلام سريع على قاعدة البيانات الحقيقية
npx wrangler d1 execute madinty-ratan --remote --command "select count(*) from orders"
```

---

## لو احتجت تعيد التركيب من الأول

### 1) الدخول على الحساب

```bash
npx wrangler login
```

### 2) اعمل قاعدة البيانات والتخزين

```bash
npx wrangler d1 create madinty-ratan
npx wrangler r2 bucket create madinty-ratan-media
```

الأمر الأول بيطبع `database_id` — حطّه في `wrangler.jsonc` مكان القديم.

### 3) جهّز الجداول

```bash
npx wrangler d1 execute madinty-ratan --remote --file=d1/schema.sql
```

### 4) المفتاح السري

ده اللي بيوقّع جلسات الدخول. لازم يكون طويل وعشوائي، ومحدش يشوفه:

```bash
node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" | npx wrangler secret put SESSION_SECRET
```

> لو غيّرته، كل اللي داخلين على اللوحة هيطلعوا برّه ويسجّلوا دخول تاني.

### 5) انشر

```bash
npx wrangler deploy
```

### 6) حط كلمة سر اللوحة

افتح `/admin`، اكتب إيميلك المسجّل في جدول `admins` واختار كلمة السر،
واضغط دخول. هيسألك تأكيد ويثبّتها.

⚠️ **اعمل الخطوة دي أول ما تنشر.** الحساب طول ما هو من غير كلمة سر،
أي حد يعرف الإيميل والرابط يقدر يثبّت كلمة سر بدالك.

---

## مين له حق الدخول على اللوحة

الصلاحية مربوطة بجدول `admins` في قاعدة البيانات — مش بمجرد إن حد
عنده الرابط.

**تضيف حساب جديد:**

```bash
npx wrangler d1 execute madinty-ratan --remote --command "insert or ignore into admins (email) values ('elemail@gmail.com')"
```

بعدين صاحب الإيميل يفتح `/admin` ويحط كلمة سره بنفسه.

**تشيل حساب:**

```bash
npx wrangler d1 execute madinty-ratan --remote --command "delete from admins where email='elemail@gmail.com'"
```

**تصفّر كلمة سر حد نسيها:**

```bash
npx wrangler d1 execute madinty-ratan --remote --command "update admins set pass_hash=null, pass_salt=null where email='elemail@gmail.com'"
```

وبعدين يدخل على `/admin` ويحط كلمة سر جديدة.

**تشوف مين مسجّل:**

```bash
npx wrangler d1 execute madinty-ratan --remote --command "select email, case when pass_hash is null then 'لسه ما حطش كلمة سر' else 'متفعّل' end from admins"
```

---

## النسخ الاحتياطي

من اللوحة ← الإعدادات ← **💾 النسخة الاحتياطية** — بينزّل ملف JSON فيه
الأقسام والمنتجات والطلبات. اعمل كده كل فترة واحتفظ بالملف.

لو احتجت ترجّع نسخة:

```bash
node migrate/to-sql.mjs backup.json > restore.sql
npx wrangler d1 execute madinty-ratan --remote --file=restore.sql
```

---

## الدومين

الدومين مربوط على الـWorker من:
**Cloudflare Dashboard ← Workers & Pages ← madinty-ratan ← Settings ←
Domains & Routes ← Add ← Custom Domain**

Cloudflare بيعمل شهادة SSL لوحده وبيظبط الـDNS.

**لو غيّرت الدومين**، لازم تبدّل القديم بالجديد في:
`index.html` · `products.html` · `product.html` · `cart.html` ·
`about.html` · `contact.html` (في `canonical` و `og:url` و `og:image`)
وكمان في `robots.txt` و `sitemap.xml`.

---

## حاجات لازم تعرفها

**1) الطلب بيتسجّل قبل ما العميل يبعت الواتساب.**
أول ما يضغط «تأكيد الطلب» بيتحفظ في القاعدة وبعدين بتتفتح نافذة
الواتساب. يعني ممكن يوصلك طلب في اللوحة والعميل ما بعتش الرسالة —
كلّمه على رقمه اللي في الطلب.

**2) أي حد يقدر يضيف طلب** (لازم كده عشان الزائر يطلب من غير تسجيل
دخول). فيه حد أقصى 15 طلب في الدقيقة لكل جهاز. لو ظهرت طلبات وهمية
كتير، الحل إضافة تحقّق زي Turnstile.

**3) كلمة السر عمرها ما بتخرج من جهازك.** المتصفح بيشفّرها الأول
والسيرفر بيشفّر الناتج تاني قبل ما يخزّنه. يعني حتى لو حد وصل لقاعدة
البيانات مش هيعرف كلمة السر.

**4) مفيش أي مفتاح سري في الكود.** كل الأسرار في إعدادات الـWorker على
Cloudflare. الملفات اللي مش المفروض تتنشر مكتوبة في `.assetsignore`.

---

## لو حاجة مشيت غلط

| اللي بيحصل | السبب غالبًا | الحل |
| --- | --- | --- |
| اللوحة بتقول «الإيميل أو كلمة السر غلط» وانت متأكد | الإيميل مش في جدول `admins` | شوف قسم «مين له حق الدخول» فوق |
| «الحساب ده لسه ما اتفعّلش» | أول مرة تدخل | اكتب كلمة السر اللي عايزها واضغط دخول، هيسألك تأكيد |
| «محاولات دخول كتير» | اتخطى 10 محاولات في الدقيقة | استنّى دقيقة |
| «الجلسة انتهت» | عدّى شهر، أو كلمة السر اتغيّرت من جهاز تاني | سجّل خروج ودخول تاني |
| «SESSION_SECRET مش متظبط» | المفتاح السري مش موجود | خطوة 4 فوق |
| الموقع بيعرض منتجات قديمة | القاعدة مردّتش فرجع لنسخة المتصفح | حدّث الصفحة؛ لو فضلت، شوف `npx wrangler tail` |
| صورة بدّلتها وما ظهرتش | صورة من `assets/img` والكاش لسه ماسكها | زوّد `ASSET_V` في `assets/js/app.js` وانشر |
| «الصورة أكبر من 10 ميجا» | الحد الأقصى للرفع | صغّر الصورة |

---

## حاجات مقصودة (مش مشاكل)

- `data.js` لسه فيه نسخة من المنتجات — دي **شبكة أمان** بتظهر لو
  القاعدة مردّتش، عشان الصفحة ما تفضلش فاضية أبدًا.
- الصور القديمة في `assets/img` وبتتنشر مع الموقع. الصور الجديدة اللي
  بترفعها من اللوحة بتروح R2 وبتتعرض من `/media/...`.
- `/admin` مش موجود في قائمة الموقع ومتحطّط عليه `noindex` — احفظ
  اللينك عندك.
