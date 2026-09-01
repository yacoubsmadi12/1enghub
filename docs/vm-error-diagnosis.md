# تشخيص تشغيل تحديث ENGHUB على الـVM

## سبب الخطأ

السحب من GitHub نجح، ووصل الـVM إلى commit `d57b205e836a95ed19a1d44d450d4611c8c0d483`. كما نجح `pnpm install` وتم تثبيت `xlsx`. التوقف حدث عند أوامر PostgreSQL لأن متغير `ENGHUB_DATABASE_URL` لم يكن محمّلًا في جلسة الطرفية. لذلك حاول `pg_dump` و`psql` الاتصال عبر socket المحلي باستخدام مستخدم Linux الحالي `root`، وظهر الخطأ `FATAL: role "root" does not exist`.

الـVM لم يفشل في GitHub ولا في dependencies. كذلك `pnpm check` بدأ بعد فشل أوامر قاعدة البيانات لأن السكربت المرفق لم يستخدم `set -e`; لذلك يجب عدم اعتبار استمرار TypeScript دليلًا على نجاح migration.

## الإصلاح الآمن

من مجلد المشروع، أنشئ ملف `.env` محليًا لا ترفعه إلى GitHub، وضع فيه اتصال PostgreSQL الحقيقي:

```bash
cd /var/www/enghub
nano .env
```

محتوى الملف يكون بصيغة مشابهة، مع استبدال القيم السرية:

```dotenv
ENGHUB_DATABASE_URL=postgresql://enghub_app:YOUR_PASSWORD@127.0.0.1:5432/enghub?sslmode=disable
```

ثم حمّل المتغير في نفس الجلسة واختبر الاتصال قبل backup أو migration:

```bash
set -a
source .env
set +a
printf 'Database host configured: %s\n' "${ENGHUB_DATABASE_URL%%@*}@***"
psql "$ENGHUB_DATABASE_URL" -c 'SELECT current_database(), current_user;'
```

بعد نجاح اختبار الاتصال، خذ النسخة الاحتياطية وطبّق migration الجديدة. لا تطبق migration إذا كان العمودان موجودين مسبقًا:

```bash
mkdir -p backups
pg_dump "$ENGHUB_DATABASE_URL" > "backups/enghub-before-d57b205-$(date +%Y%m%d-%H%M%S).sql"

psql "$ENGHUB_DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('employee_number','manager_id') ORDER BY column_name;"

# نفّذ السطر التالي مرة واحدة فقط إذا لم يظهر العمودان أعلاه
psql "$ENGHUB_DATABASE_URL" -f drizzle/0003_eager_shinobi_shaw.sql
```

بعدها أكمل التحقق والبناء مع إيقاف التسلسل عند أي خطأ:

```bash
set -e
pnpm check
pnpm test
pnpm build
```

## التشغيل

إذا كانت المنصة تعمل عبر systemd، استخدم:

```bash
sudo systemctl restart enghub
sudo systemctl status enghub --no-pager
```

إذا كانت تعمل عبر PM2، استخدم:

```bash
pm2 restart enghub
pm2 status
```

ولا تستخدم `pnpm start` في نفس الوقت إذا كانت إحدى الطريقتين السابقتين تعمل، حتى لا تشغّل نسختين على المنفذ نفسه.
