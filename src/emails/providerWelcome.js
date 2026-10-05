const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const RULES = [
  {
    number: '01',
    title: 'التسليم في الوقت المحدد',
    text: 'التزم بتسليم المشروع للطالب ضمن الموعد المتفق عليه. التأخير يضر بثقة المنصة وبدرجة تقييمك.',
  },
  {
    number: '02',
    title: 'الأدب واحترام الطالب',
    text: 'كن مهذباً في المحادثة والعمل. أي إساءة أو لغة غير لائقة تجاه الطالب غير مقبولة وتُعرض حسابك للمراجعة.',
  },
  {
    number: '03',
    title: 'الإبلاغ عن الطالب المشاغب',
    text: 'إذا أساء الطالب التصرف، لا ترد بالمثل. ارفع اسمه إلى الإدارة من صفحة المحادثة مع ذكر السبب والمستمسكات إن وجدت.',
  },
  {
    number: '04',
    title: 'طريقة الدفع',
    text: 'يتم استلام مستحقاتك عبر بطاقة الماستر كارد فقط. لا تطلب تحويلات خارج المنصة ولا تشارك بيانات الدفع مع الطالب.',
  },
];

export const buildProviderWelcomeEmail = ({ name, email, loginUrl, password }) => {
  const safeName = escapeHtml(name || 'مزود الخدمة');
  const safeEmail = escapeHtml(email || '');
  const safeLogin = escapeHtml(loginUrl || 'http://localhost:5173/login');
  const safePassword = escapeHtml(password || '');

  const rulesHtml = RULES.map(
    (rule) => `
      <tr>
        <td style="padding:0 0 14px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAFC;border:1px solid #E6EEF4;border-radius:18px;">
            <tr>
              <td style="padding:18px 20px;vertical-align:top;width:58px;">
                <div style="width:44px;height:44px;border-radius:14px;background:#1A5276;color:#E9C176;font-weight:800;font-size:13px;line-height:44px;text-align:center;">
                  ${rule.number}
                </div>
              </td>
              <td style="padding:18px 20px 18px 0;text-align:right;">
                <p style="margin:0 0 6px 0;font-size:16px;font-weight:800;color:#1A5276;">${rule.title}</p>
                <p style="margin:0;font-size:14px;line-height:1.8;color:#4A5B67;">${rule.text}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>مرحباً بك في الأفق الأكاديمي</title>
  </head>
  <body style="margin:0;padding:0;background:#EEF3F7;font-family:Tahoma,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3F7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 12px 40px rgba(26,82,118,0.08);">
            <tr>
              <td style="background:#1A5276;padding:36px 32px 32px 32px;text-align:right;">
                <p style="margin:0 0 10px 0;color:#E9C176;font-size:12px;letter-spacing:2px;font-weight:700;">ACADEMIC HORIZON</p>
                <h1 style="margin:0 0 10px 0;color:#ffffff;font-size:28px;line-height:1.4;">أهلاً بك في الأفق الأكاديمي</h1>
                <p style="margin:0;color:#D5E4EE;font-size:15px;line-height:1.8;">
                  يسعدنا انضمامك يا <strong style="color:#E9C176;">${safeName}</strong> إلى شبكة مزودي الخدمة المعتمدين.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;text-align:right;">
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.9;color:#334155;">
                  تم إنشاء حسابك بنجاح من قبل الإدارة. هذه رسالة ترحيبية وتعليمات العمل داخل المنصة. اقرأها بعناية لأنها جزء من التزامك معنا.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F4EA;border:1px solid #E9C176;border-radius:16px;margin-bottom:24px;">
                  <tr>
                    <td style="padding:16px 18px;text-align:right;">
                      <p style="margin:0 0 4px 0;font-size:12px;color:#8A7040;font-weight:700;">بريد الدخول</p>
                      <p style="margin:0 0 14px 0;font-size:16px;color:#1A5276;font-weight:800;direction:ltr;text-align:right;">${safeEmail}</p>
                      <p style="margin:0 0 4px 0;font-size:12px;color:#8A7040;font-weight:700;">كلمة المرور</p>
                      <p style="margin:0;font-size:16px;color:#1A5276;font-weight:800;direction:ltr;text-align:right;letter-spacing:0.5px;">${safePassword}</p>
                    </td>
                  </tr>
                </table>
                <h2 style="margin:0 0 16px 0;font-size:18px;color:#1A5276;">التعليمات التي يجب الالتزام بها</h2>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rulesHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;text-align:center;">
                <a href="${safeLogin}" style="display:inline-block;background:#1A5276;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:14px;">
                  الدخول إلى لوحة التحكم
                </a>
                <p style="margin:16px 0 0 0;font-size:13px;color:#64748B;line-height:1.7;">
                  احتفظ بكلمة المرور هذه، ولا تشاركها مع أحد. يُفضَّل تغييرها بعد أول دخول من إعدادات الحساب.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#F8FAFC;padding:22px 32px;text-align:center;border-top:1px solid #E8EEF3;">
                <p style="margin:0 0 6px 0;font-size:13px;color:#1A5276;font-weight:800;">الأفق الأكاديمي</p>
                <p style="margin:0;font-size:12px;color:#94A3B8;">منصة تربط الطلاب بمزودي الخدمات الأكاديمية بثقة واحتراف.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `أهلاً بك في الأفق الأكاديمي، ${name || 'مزود الخدمة'}.`,
    `تم إنشاء حسابك على البريد: ${email}`,
    `كلمة المرور: ${password || ''}`,
    '',
    'التعليمات التي يجب الالتزام بها:',
    '1. الالتزام بتسليم المشروع في الوقت المحدد.',
    '2. كن مهذباً ولا تُسئ إلى الطالب.',
    '3. إذا كان الطالب سيئاً، أبلغ عنه برفع اسمه إلى الإدارة.',
    '4. يتم الدفع عن طريق بطاقة الماستر كارد فقط.',
    '',
    `الدخول: ${loginUrl}`,
  ].join('\n');

  return {
    subject: `مرحباً بك في الأفق الأكاديمي، ${name || 'مزود الخدمة'}`,
    html,
    text,
  };
};
