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
- `CORS_ORIGIN` يجب أن يشمل عنوان الواجهة الحالي، مثلاً:
  `https://academic-horizon-frontend.onrender.com,https://academichorizonapp.fyi,https://www.academichorizonapp.fyi`
- `FRONTEND_URL` عنوان الواجهة (روابط الإيميل)، حالياً `https://academic-horizon-frontend.onrender.com`
