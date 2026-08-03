import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '../config/spaces.js';
import MatterCorePdf from '../models/MatterCorePdf.js';

const router = express.Router();

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    return cb(new Error('Only PDF files are allowed!'), false);
  }
});

const buildShareUrl = (req, token) => {
  const fallbackOrigin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  return `${process.env.FRONTEND_URL || fallbackOrigin}/matter-core/${token}`;
};

// Get current Matter Core PDF status (admin)
router.get('/', protect, async (req, res) => {
  try {
    const doc = await MatterCorePdf.findOne().sort({ createdAt: -1 });
    if (!doc) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        originalName: doc.originalName,
        size: doc.size,
        viewCount: doc.viewCount,
        updatedAt: doc.updatedAt,
        shareUrl: doc.shareToken ? buildShareUrl(req, doc.shareToken) : null
      }
    });
  } catch (error) {
    console.error('Get Matter Core PDF error:', error);
    res.status(500).json({ success: false, message: 'Unable to fetch Matter Core PDF', error: error.message });
  }
});

// Upload / replace the Matter Core PDF (admin)
router.post('/upload', protect, (req, res, next) => {
  memoryUpload.single('pdf')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File is too large. Maximum size is 20MB.' });
    }
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const s3 = getS3Client();
    if (!s3 || !process.env.SPACES_BUCKET) {
      return res.status(503).json({ success: false, message: 'DigitalOcean Spaces is not configured.' });
    }

    const key = 'matter-core/menu.pdf';
    const uploadParams = {
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'application/pdf'
    };

    try {
      await s3.send(new PutObjectCommand({ ...uploadParams, ACL: 'public-read' }));
    } catch (aclErr) {
      const code = aclErr?.Code || aclErr?.code || aclErr?.$metadata?.httpStatusCode;
      const isAclError = ['AccessControlListNotSupported', 'AccessDenied', 'InvalidArgument'].includes(String(code))
        || String(aclErr.message).toLowerCase().includes('acl');
      if (isAclError) {
        await s3.send(new PutObjectCommand(uploadParams));
      } else {
        throw aclErr;
      }
    }

    const cdnBase = process.env.SPACES_CDN_URL?.replace(/\/$/, '');
    const endpoint = process.env.SPACES_ENDPOINT?.replace(/^https?:\/\//, '');
    const fileUrl = cdnBase
      ? `${cdnBase}/${key}`
      : `https://${process.env.SPACES_BUCKET}.${endpoint}/${key}`;

    let doc = await MatterCorePdf.findOne().sort({ createdAt: -1 });
    if (!doc) {
      doc = new MatterCorePdf({ shareToken: crypto.randomBytes(32).toString('hex') });
    }
    if (!doc.shareToken) {
      doc.shareToken = crypto.randomBytes(32).toString('hex');
    }

    doc.fileKey = key;
    doc.fileUrl = fileUrl;
    doc.originalName = req.file.originalname;
    doc.size = req.file.size;
    doc.uploadedBy = req.user._id;
    await doc.save();

    res.json({
      success: true,
      message: 'Matter Core PDF uploaded successfully',
      data: {
        originalName: doc.originalName,
        size: doc.size,
        shareUrl: buildShareUrl(req, doc.shareToken)
      }
    });
  } catch (error) {
    console.error('Matter Core PDF upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed. Please try again.', error: error.message });
  }
});

// Public: resolve share token to the current PDF (no auth)
router.get('/share/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const doc = await MatterCorePdf.findOne({ shareToken: token });

    if (!doc || !doc.fileUrl) {
      return res.status(404).json({ success: false, message: 'This link is invalid or has expired.' });
    }

    doc.viewCount = (doc.viewCount || 0) + 1;
    await doc.save();

    res.json({
      success: true,
      data: {
        fileUrl: doc.fileUrl,
        originalName: doc.originalName
      }
    });
  } catch (error) {
    console.error('Matter Core PDF share lookup error:', error);
    res.status(500).json({ success: false, message: 'Unable to load this link.', error: error.message });
  }
});

export default router;
