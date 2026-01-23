/**
 * Report Routes
 * Handles /api/submitReport and /api/reportStatus endpoints
 */

const express = require('express');
const router = express.Router();

const reportController = require('../controllers/reportController');
const { validateSubmitReport, validateStatusRequest } = require('../middleware/validation');

/**
 * POST /api/submitReport
 * Submit a new encrypted report
 *
 * Request:
 * {
 *   "encryptedPayload": "0x..." or "base64...",
 *   "responses": ["answer1", "answer2", "answer3", "answer4", "answer5"],
 *   "metadata": { optional fields }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "reportId": "report_1234567890_abcdef",
 *   "txHash": "0x...",
 *   "ipfsHash": "Qm...",
 *   "status": "pending",
 *   "data": { detailed info }
 * }
 */
router.post('/submitReport', validateSubmitReport, async (req, res, next) => {
  try {
    await reportController.submitReport(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reportStatus
 * Check status of a submitted report
 *
 * Query:
 * ?reportId=report_1234567890_abcdef
 *
 * Response:
 * {
 *   "success": true,
 *   "reportId": "report_1234567890_abcdef",
 *   "status": "pending|confirmed|failed",
 *   "txHash": "0x...",
 *   "confirmations": 5,
 *   "blockNumber": 123456
 * }
 */
router.get('/reportStatus', validateStatusRequest, async (req, res, next) => {
  try {
    await reportController.getReportStatus(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /health
 * Health check endpoint
 *
 * Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-01-22T...",
 *   "backend": { wallet, contract },
 *   "services": { ipfs, blockchain }
 * }
 */
router.get('/health', async (req, res, next) => {
  try {
    await reportController.healthCheck(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
