/**
 * Rejects non-JSON POST bodies with 415 before validation runs.
 * (Plan test 2.7 allows 400 or 415 — 415 is the semantically correct one.)
 */
function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({
      success: false,
      error: 'Content-Type must be application/json',
    });
  }
  return next();
}

module.exports = requireJson;
