import express, { Request, Response, NextFunction } from 'express';
const router = express.Router();
import multer from 'multer';

import reportController from '../controllers/reportController';
import authMiddleware from '../middleware/auth';
import {
  validateSubmitReport,
  validateStatusRequest,
} from '../middleware/validation';

// Configure multer for multipart/form-data
// Store in memory, max 50MB for audio + payload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

router.post(
  '/submitReport',
  authMiddleware,
  upload.single('audio'),
  validateSubmitReport,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await reportController.submitReport(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/reportStatus',
  authMiddleware,
  validateStatusRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await reportController.getReportStatus(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

// Hides report from library views; does not delete blockchain record.
router.post(
  '/report/:reportId/archive',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await reportController.archiveReport(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/report/:reportId/unarchive',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await reportController.unarchiveReport(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await reportController.healthCheck(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/report/:reportId/decrypt',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await reportController.getDecryptedReport(req, res, next);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
