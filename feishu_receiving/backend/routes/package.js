const express = require('express');
const router = express.Router();
const feishu = require('../feishu');

/**
 * GET /api/package/:trackingNumber
 * Search all items for a given tracking number (运单号).
 */
router.get('/:trackingNumber', async (req, res, next) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber || trackingNumber.trim().length < 3) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_INPUT', message: '运单号至少需要3个字符' }
      });
    }

    const items = feishu.searchByTracking(trackingNumber.trim());

    if (!items || items.length === 0) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: `未找到运单号 "${trackingNumber}" 的相关记录` }
      });
    }

    // Check if all items are already confirmed
    const allConfirmed = items.every(item => item['收货确认'] === true);

    res.json({
      ok: true,
      data: {
        trackingNumber: trackingNumber.trim(),
        totalItems: items.length,
        allConfirmed,
        items,
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
