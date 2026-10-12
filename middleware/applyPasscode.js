'use strict';

const crypto = require('crypto');

// Hash both sides so timingSafeEqual always compares equal-length buffers and
// the comparison time leaks nothing about the passcode's length or prefix.
function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

/**
 * requireApplyPasscode
 *
 * Gates the public application endpoints behind the shared staff access code
 * in APPLY_PASSCODE, sent as the `X-Apply-Passcode` header. Interim control so
 * FinScore (billed per call) only runs for applications entered by GR8 staff;
 * the planned replacement is SO-assisted entry behind staff login.
 *
 * Mounted in index.js ahead of the application router, so a refused request
 * never reaches multer, storage, or FinScore.
 *
 * Fails with:
 *   401 { code: 'invalid_passcode' } — header missing or wrong
 *   503 { code: 'applications_unavailable' } — APPLY_PASSCODE unset in
 *       production. Fails closed: a deleted env var must not silently reopen
 *       the paid FinScore path. Outside production an unset code means no gate,
 *       for local dev.
 */
const requireApplyPasscode = (req, res, next) => {
  const expected = process.env.APPLY_PASSCODE;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[apply-gate] APPLY_PASSCODE is not set; refusing applications');
      return res.status(503).json({
        status: 'error',
        code: 'applications_unavailable',
        message: 'Applications are temporarily unavailable. Please contact GR8 Lending.',
      });
    }
    return next();
  }

  const provided = req.get('x-apply-passcode') || '';
  if (!crypto.timingSafeEqual(digest(provided), digest(expected))) {
    return res.status(401).json({
      status: 'error',
      code: 'invalid_passcode',
      message: 'Incorrect access code.',
    });
  }

  return next();
};

module.exports = { requireApplyPasscode };
