const express = require('express');
const router = express.Router();
const feishu = require('../feishu');

/**
 * POST /api/receive
 * Confirm receipt for one or more records.
 * Body: { recordIds: string[] }
 */
router.post('/', async (req, res, next) => {
  try {
    const { recordIds } = req.body;

    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_INPUT', message: '请提供要确认的记录ID列表' }
      });
    }

    if (recordIds.length > 200) {
      return res.status(400).json({
        ok: false,
        error: { code: 'TOO_MANY', message: '单次最多确认200条记录' }
      });
    }

    const result = feishu.batchConfirmReceive(recordIds);

    // Write log
    const tn = req.body.trackingNumber || '';
    feishu.writeLog(tn, '确认收货', recordIds.length, '');

    res.json({
      ok: true,
      data: {
        updatedCount: result.updatedCount,
        totalRequested: recordIds.length,
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
