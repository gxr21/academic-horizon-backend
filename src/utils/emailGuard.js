import dns from 'node:dns/promises';
import { ValidationError } from './errors.js';

/**
 * First line of defence against fake sign-ups.
 * It cannot prove an inbox exists (only the verification link can), but it
 * rejects typos, throw-away mailbox services and domains that cannot receive mail.
 */

// Common typos of big providers -> the address the visitor probably meant
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'iclod.com': 'icloud.com',
  'icloud.con': 'icloud.com',
};

// Disposable / throw-away mailbox providers (not exhaustive, covers the popular ones)
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'spam4.me', 'pokemail.net',
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '20minutemail.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmailo.com',
  'tempail.com', 'tempinbox.com', 'throwawaymail.com', 'trashmail.com', 'trashmail.net',
  'trashmail.de', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'getnada.com', 'nada.email',
  'dispostable.com', 'fakeinbox.com', 'fakemail.net', 'maildrop.cc', 'mailnesia.com',
  'mintemail.com', 'mohmal.com', 'moakt.com', 'mytemp.email', 'emailondeck.com',
  'burnermail.io', 'discard.email', 'discardmail.com', 'spambox.us', 'spamgourmet.com',
  'mailcatch.com', 'mailtemp.net', 'inboxkitten.com', 'minuteinbox.com', 'luxusmail.org',
  'mail.tm', 'mail7.io', 'emailfake.com', 'fakemailgenerator.com', 'crazymailing.com',
  'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'tmails.net', 'harakirimail.com',
  'owlymail.com', 'mailpoof.com', 'anonaddy.me', 'simplelogin.co', 'dropmail.me',
  'emltmp.com', 'fexbox.org', 'vomoto.com', 'zetmail.com', 'cuvox.de', 'dayrep.com',
  'einrot.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com',
  'superrito.com', 'teleworm.us', 'armyspy.com',
]);

const MX_TIMEOUT_MS = 4000;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), ms);
    }),
  ]);

// Codes that prove the domain has no mail setup (anything else = DNS hiccup, so we let it pass)
const NO_MAIL_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ENOENT']);

// Last resort when the DNS client itself is unusable: ask the operating system
const lookupExists = async (domain) => {
  try {
    await withTimeout(dns.lookup(domain), MX_TIMEOUT_MS);
    return true;
  } catch (error) {
    return !NO_MAIL_CODES.has(error.code);
  }
};

const domainCanReceiveMail = async (domain) => {
  let definitive = true;

  try {
    const records = await withTimeout(dns.resolveMx(domain), MX_TIMEOUT_MS);
    if (records && records.length > 0) return true;
  } catch (error) {
    if (!NO_MAIL_CODES.has(error.code)) definitive = false;
  }

  // RFC 5321: a domain without MX may still accept mail on its A/AAAA record
  try {
    const addresses = await withTimeout(dns.resolve4(domain), MX_TIMEOUT_MS);
    if (addresses.length > 0) return true;
  } catch (error) {
    if (!NO_MAIL_CODES.has(error.code)) definitive = false;
  }

  // Both lookups answered "nothing there" -> the domain cannot receive mail
  if (definitive) return false;

  // DNS client trouble (timeout, refused...): double-check with the OS resolver
  return lookupExists(domain);
};

/**
 * Throws a ValidationError (Arabic message) if the address looks fake or cannot receive mail.
 */
export const assertRealEmail = async (rawEmail) => {
  const email = String(rawEmail || '').trim().toLowerCase();
  const match = email.match(/^[a-z0-9._%+'-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/);
  if (!match) {
    throw new ValidationError('صيغة البريد الإلكتروني غير صحيحة.');
  }

  const domain = match[1];

  if (TYPO_DOMAINS[domain]) {
    throw new ValidationError(
      `هل تقصد ${email.split('@')[0]}@${TYPO_DOMAINS[domain]}؟ تأكد من كتابة البريد بشكل صحيح.`
    );
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    throw new ValidationError('لا نقبل البريد المؤقت. استخدم بريدك الحقيقي (Gmail أو Outlook أو بريد الجامعة).');
  }

  if (!(await domainCanReceiveMail(domain))) {
    throw new ValidationError('نطاق هذا البريد غير موجود أو لا يستقبل رسائل. استخدم بريداً حقيقياً.');
  }

  return email;
};
