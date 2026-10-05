/**
 * Application constants — subscription limits, order statuses, roles.
 */

export const ROLES = {
  STUDENT: 'student',
  PROVIDER: 'provider',
  ADMIN: 'admin',
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

// Valid status transitions: current → [allowed next statuses]
export const STATUS_TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ASSIGNED]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
  // completed = submitted by the provider, waiting for admin review:
  //   approve → delivered, or send back to the provider → in_progress
  [ORDER_STATUS.COMPLETED]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.IN_PROGRESS],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

export const SUBSCRIPTION = {
  FREE: 'free',
  BASIC: 'basic',
  PRO: 'pro',
};

// Max active (non-completed/cancelled) orders per subscription
export const SUBSCRIPTION_LIMITS = {
  [SUBSCRIPTION.FREE]: 3,
  [SUBSCRIPTION.BASIC]: 10,
  [SUBSCRIPTION.PRO]: Infinity,
};

// Subscription duration in days
export const SUBSCRIPTION_DURATION_DAYS = 30;

// Uploads accept any file type EXCEPT these (executables / scripts / active content).
// Files are always served back as attachments, never rendered by the browser.
export const BLOCKED_FILE_EXTENSIONS = [
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl', '.dll', '.sys', '.lnk', '.reg',
  '.ps1', '.psm1', '.vbs', '.vbe', '.wsf', '.wsh', '.hta', '.jar', '.apk', '.sh', '.bash',
  '.js', '.mjs', '.cjs', '.jse', '.php', '.phtml', '.asp', '.aspx', '.jsp',
  '.html', '.htm', '.xhtml', '.svg',
];

// (legacy) kept for reference only — no longer used for filtering uploads
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
];
