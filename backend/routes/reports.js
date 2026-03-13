

const express = require('express');
const router = express.Router();

const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/auth');
const { validateSubmitReport, validateStatusRequest } = require('../middleware/validation');

router.post('/submitReport', authMiddleware, validateSubmitReport, async (req, res, next) => {
  try {
    await reportController.submitReport(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.get('/reportStatus', authMiddleware, validateStatusRequest, async (req, res, next) => {
  try {
    await reportController.getReportStatus(req, res, next);
  } catch (error) {
    next(error);
  }
});

//only hides reports from the lists in the library but doesnt delete it from blaockchain
router.post('/report/:reportId/archive', authMiddleware, async (req, res, next) => {
  try {
    await reportController.archiveReport(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.post('/report/:reportId/unarchive', authMiddleware, async (req, res, next) => {
  try {
    await reportController.unarchiveReport(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.get('/health', async (req, res, next) => {
  try {
    await reportController.healthCheck(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.get('/report/:reportId/decrypt', authMiddleware, async (req, res, next) => {
  try {
    await reportController.getDecryptedReport(req, res, next);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
