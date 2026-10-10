const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildProviderDecisionEmail = ({ name, approved, note, loginUrl }) => {
  const safeName = escapeHtml(name || 'مزود الخدمة');
  const safeNote = escapeHtml(note || '');
  const safeUrl = escapeHtml(loginUrl);

  const subject = approved
    ? 'تمت الموافقة على حسابك — الأفق الأكاديمي'
    : 'بخصوص طلب انضمامك — الأفق الأكاديمي';

  const text = approved
    ? `مرحباً ${name || ''}\n\nوافقت الإدارة على حسابك كمزود خدمة. يمكنك تسجيل الدخول الآن:\n${loginUrl}`
    : `مرحباً ${name || ''}\n\nنأسف، لم تتم الموافقة على طلب انضمامك كمزود خدمة.${note ? `\nالسبب: ${note}` : ''}\n\nللاستفسار تواصل مع الإدارة.`;

  const body = approved
    ? `<p>يسعدنا إبلاغك أن الإدارة <strong>وافقت</strong> على حسابك كمزود خدمة. يمكنك الآن تسجيل الدخول والبدء باستقبال الطلبات.</p>
       <p style="text-align:center;padding:18px 0;">
         <a href="${safeUrl}" style="background:#1A5276;color:#fff;text-decoration:none;padding:14px 28px;border-radius:14px;display:inline-block;font-weight:bold;">تسجيل الدخول</a>
       </p>`
    : `<p>نأسف لإبلاغك أن الإدارة لم توافق على طلب انضمامك كمزود خدمة.</p>
       ${safeNote ? `<p style="background:#FDF2F2;border-radius:12px;padding:12px 16px;">السبب: ${safeNote}</p>` : ''}
       <p style="font-size:13px;color:#5B6B76;">للاستفسار يمكنك التواصل مع الإدارة.</p>`;

  return {
    subject,
    text,
    html: `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F4F7FA;padding:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;">
          <tr>
            <td style="background:#1A5276;color:#fff;padding:28px 32px;">
              <h1 style="margin:0;font-size:22px;">الأفق الأكاديمي</h1>
              <p style="margin:8px 0 0;opacity:.85;">${approved ? 'تمت الموافقة على حسابك' : 'قرار بشأن طلب الانضمام'}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#1A2A36;line-height:1.9;">
              <p>مرحباً ${safeName}،</p>
              ${body}
            </td>
          </tr>
        </table>
      </div>
    `,
  };
};
