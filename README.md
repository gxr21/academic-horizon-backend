# Academic Horizon — Backend

واجهة برمجية لمنصة الأفق الأكاديمي (Express + MongoDB + Socket.io).

## التشغيل المحلي

```bash
npm install
cp .env.example .env.development.local
npm run dev
```

لا ترفع ملفات `.env*.local`. انسخ `.env.example` واملأ القيم على جهازك أو على Render.

## النشر على Render

- Root: مجلد هذا المستودع
- Start: `node src/server.js`
- أضف متغيرات البيئة من `.env.example` مع `NODE_ENV=production`
