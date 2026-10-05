/**
 * Account restriction helpers.
 *
 * restriction_type: 'none' | 'temporary' | 'permanent'
 * A temporary restriction expires automatically on the next authenticated request.
 */

export const RESTRICTION = {
  NONE: 'none',
  TEMPORARY: 'temporary',
  PERMANENT: 'permanent',
};

export const ALLOWED_RESTRICTION_DAYS = [1, 3, 7, 14, 30, 90];

/**
 * Inspect a user document and lift an expired temporary restriction.
 * Returns { restricted, type, until, reason } — never throws.
 */
export const evaluateRestriction = async (user) => {
  const type = user.restriction_type || RESTRICTION.NONE;

  if (type === RESTRICTION.PERMANENT) {
    return {
      restricted: true,
      type: RESTRICTION.PERMANENT,
      until: null,
      reason: user.restriction_reason || '',
    };
  }

  if (type === RESTRICTION.TEMPORARY) {
    if (user.restriction_until && user.restriction_until > new Date()) {
      return {
        restricted: true,
        type: RESTRICTION.TEMPORARY,
        until: user.restriction_until,
        reason: user.restriction_reason || '',
      };
    }

    // Temporary restriction has expired — lift it so the user can continue
    user.restriction_type = RESTRICTION.NONE;
    user.restriction_until = null;
    user.restriction_reason = '';
    user.restricted_by = null;
    user.restricted_at = null;
    try {
      await user.save();
    } catch (err) {
      console.error('Failed to lift expired restriction:', err.message);
    }
    return { restricted: false, type: RESTRICTION.NONE, until: null, reason: '' };
  }

  return { restricted: false, type: RESTRICTION.NONE, until: null, reason: '' };
};

export const restrictionMessage = (status) => {
  if (!status?.restricted) return '';
  if (status.type === RESTRICTION.PERMANENT) {
    return status.reason
      ? `تم حظر حسابك نهائياً من قبل الإدارة. السبب: ${status.reason}`
      : 'تم حظر حسابك نهائياً من قبل الإدارة.';
  }
  const until = status.until ? new Date(status.until).toLocaleString('ar-EG') : '';
  const base = until ? `حسابك مقيّد حتى ${until}` : 'حسابك مقيّد مؤقتاً';
  return status.reason ? `${base}. السبب: ${status.reason}` : `${base}.`;
};
