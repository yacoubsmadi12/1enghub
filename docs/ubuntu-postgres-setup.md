# ENGHUB على Ubuntu مع PostgreSQL

هذا الدليل يجهز خادم Ubuntu لتشغيل ENGHUB وربطه بقاعدة PostgreSQL. المنصة تحفظ **بيانات الأصول وروابط الملفات الوصفية** في PostgreSQL، بينما تحفظ بايتات الملفات في طبقة التخزين الآمنة التي يوفرها التطبيق؛ لا تُستخدم أعمدة BLOB لمحتوى الملفات.

## 1. تثبيت المتطلبات

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib git curl ca-certificates build-essential
sudo systemctl enable --now postgresql

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@10.4.1 --activate
```

تحقق من الإصدارات:

```bash
node --version
pnpm --version
psql --version
sudo systemctl is-active postgresql
```

## 2. إنشاء قاعدة ومستخدم مخصصين

استبدل كلمة المرور بقيمة قوية، ولا تضعها داخل مستودع Git:

```bash
sudo -u postgres psql
```

```sql
CREATE USER enghub_app WITH PASSWORD 'CHANGE_ME_TO_A_STRONG_PASSWORD';
CREATE DATABASE enghub OWNER enghub_app;
GRANT ALL PRIVILEGES ON DATABASE enghub TO enghub_app;
\c enghub
GRANT ALL ON SCHEMA public TO enghub_app;
\q
```

## 3. تنزيل المشروع وإعداده

```bash
git clone <ENGHUB_REPOSITORY_URL> enghub
cd enghub
pnpm install
cp docs/environment.template .env
```

عدّل `.env` وضع اتصال PostgreSQL الحقيقي:

```bash
ENGHUB_DATABASE_URL=postgresql://enghub_app:YOUR_PASSWORD@127.0.0.1:5432/enghub?sslmode=disable
```

في الإنتاج، استخدم `sslmode=require` إذا كان PostgreSQL على خادم منفصل أو خلف شبكة موثوقة تتطلب TLS. يجب حفظ `.env` بصلاحيات مقيدة:

```bash
chmod 600 .env
```

## 4. تطبيق مخطط PostgreSQL

ملف Drizzle المصدر هو `drizzle/schema.ts`، والهجرة الجاهزة موجودة في `drizzle/0000_workable_gambit.sql`. طبّقها على قاعدة ENGHUB:

```bash
set -a
source .env
set +a
psql "$ENGHUB_DATABASE_URL" -f drizzle/0000_workable_gambit.sql
```

للتحقق:

```bash
psql "$ENGHUB_DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```

يجب أن تظهر جداول مثل `users` و`teams` و`assets` و`asset_files` و`approvals` و`notifications` و`audit_events`.

## 5. التشغيل والتحقق

```bash
pnpm check
pnpm test
pnpm dev
```

للتشغيل الإنتاجي:

```bash
pnpm build
NODE_ENV=production pnpm start
```

لا تجعل الخدمة تستمع على عنوان عام قبل وضع reverse proxy وTLS وقواعد جدار ناري مناسبة. في بيئة Ubuntu الإنتاجية يُفضّل تشغيل التطبيق عبر systemd أو مدير عمليات، مع تدوير السجلات والنسخ الاحتياطية الدورية لقاعدة البيانات.

## 6. منطق الموافقة

يُسمح لعضو الفريق بإنشاء أصل ورفع ملف إلى حالة مقيدة، لكن لا يصبح الأصل منشوراً أو قابلاً للمشاركة العامة داخل المؤسسة حتى يوافق المدير المسؤول عليه. عند طلب التعديل، تعود الحالة إلى `changes_requested` ويُسجّل سبب القرار في `approvals.decision_note`. تُسجّل عمليات الرفع والموافقة والمشاركة والتنزيل في `audit_events`.

### الأدوار

| الدور | النطاق الأساسي |
|---|---|
| Top Manager | رؤية وإدارة كامل مساحة العمل والفرق والسياسات والتدقيق. |
| Manager | إدارة أعضاء فرقه، مراجعة أصولهم، اعتمادها، ومشاركة الأصول المسموح بها. |
| Team Member | إنشاء أصول ورفع نسخ جديدة، مع بقائها مقيدة حتى مراجعة المدير. |

## 7. ملاحظات أمنية

لا ترسل `ENGHUB_DATABASE_URL` إلى المتصفح ولا تضعها في ملفات frontend. تحقق الخوادم من الدور والفريق وحالة الاعتماد في كل إجراء حساس؛ فإخفاء زر في الواجهة ليس بديلاً عن التفويض الخلفي. يجب تقييد أنواع الملفات وحجمها والتحقق من أسماء الملفات ومسارات التخزين قبل الحفظ.

## 8. فرق محرك قاعدة البيانات في بيئة المعاينة

بيئة المعاينة المُدارة قد تعرض اتصالاً متوافقاً مع TiDB/MySQL، بينما النسخة القابلة للتنزيل من ENGHUB مبنية على PostgreSQL كما طلبت. لذلك يجب تطبيق `drizzle/0001_audit_immutability.sql` على PostgreSQL في Ubuntu بعد `drizzle/0000_workable_gambit.sql`. هذا الملف يضيف حماية append-only لسجل التدقيق، ولن يعمل على اتصال TiDB/MySQL.

## 9. الدخول الداخلي للحسابات

الدخول من واجهة ENGHUB لا يستخدم Gmail. الحسابات الداخلية هي `admin` لدور Top Manager، و`manager` لدور Manager، و`team-member` لدور Team Member. في بيئة التطوير المحلية فقط توجد كلمات مرور تجريبية افتراضية: `admin-dev-only` و`manager-dev-only` و`team-member-dev-only`.

في الإنتاج، يجب تعريف قيم hash منفصلة وعدم استخدام كلمات المرور التجريبية. الصيغة المطلوبة لكل متغير هي `salt:sha256(salt:password)`:

```bash
export ENGHUB_ADMIN_PASSWORD_HASH='CHANGE_SALT:CHANGE_HASH'
export ENGHUB_MANAGER_PASSWORD_HASH='CHANGE_SALT:CHANGE_HASH'
export ENGHUB_TEAM_MEMBER_PASSWORD_HASH='CHANGE_SALT:CHANGE_HASH'
```

استخدم مولد hash موثوقاً على الخادم، واحفظ هذه القيم خارج Git وبصلاحيات مقيدة. إذا لم توجد hashes في بيئة `production` فسيرفض التطبيق تسجيل الدخول، ولن يستطيع أي زائر افتراض دور `admin` بمجرد كتابة اسم المستخدم.
