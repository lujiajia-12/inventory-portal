const express = require('express');
const router = express.Router();
const { runReconciliation } = require('../reconcile');

/**
 * POST /api/reconcile
 * Run reconciliation between 京东对账单 and 退货明细.
 * Body: { dryRun?: boolean } — dryRun=true only returns results without writing to Base.
 */
router.post('/', async (req, res, next) => {
  try {
    const dryRun = req.body.dryRun === true;
    const result = runReconciliation(!dryRun);

    res.json({
      ok: true,
      data: {
        dryRun,
        summary: {
          total: result.total,
          matched: result.matched,
          unmatched: result.unmatched,
          discrepancy: result.discrepancy,
        },
        results: result.results,
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
