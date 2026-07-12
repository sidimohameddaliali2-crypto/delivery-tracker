import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';

// Lazy initialization - these will be populated after env vars are loaded
let s3 = null;
let uploadToSpaces = null;

// Function to initialize Spaces config (call this after dotenv.config())
export function initializeSpaces() {
  const {
    SPACES_KEY,
    SPACES_SECRET,
    SPACES_BUCKET,
    SPACES_ENDPOINT,
    SPACES_REGION
  } = process.env;

  console.log('🔍 Spaces config check:', {
    hasKey: !!SPACES_KEY,
    hasSecret: !!SPACES_SECRET,
    hasBucket: !!SPACES_BUCKET,
    keyLength: SPACES_KEY?.length,
    secretLength: SPACES_SECRET?.length,
    bucket: SPACES_BUCKET,
    endpoint: SPACES_ENDPOINT
  });

  if (!SPACES_KEY || !SPACES_SECRET || !SPACES_BUCKET) {
    console.warn('⚠️  DigitalOcean Spaces env vars missing. Photo uploads will fail until configured.');
    console.warn('   Required: SPACES_KEY, SPACES_SECRET, SPACES_BUCKET');
    return;
  }

  const endpointUrl = `https://${(SPACES_ENDPOINT || 'nyc3.digitaloceanspaces.com').replace(/^https?:\/\//, '')}`;

  // Configure DigitalOcean Spaces (S3-compatible)
  s3 = new S3Client({
    region: SPACES_REGION || 'nyc3',
    endpoint: endpointUrl,
    forcePathStyle: false,
    credentials: {
      accessKeyId: SPACES_KEY,
      secretAccessKey: SPACES_SECRET
    }
  });

  const defaultKeyBuilder = (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'delivery-' + uniqueSuffix + path.extname(file.originalname);
    cb(null, `photos/${filename}`);
  };

  // Multer upload to Spaces with optional overrides
  uploadToSpaces = (options = {}) => {
    const keyBuilder = options.keyBuilder || defaultKeyBuilder;
    const sizeLimit = options.maxFileSize || 10 * 1024 * 1024;

    return multer({
      storage: multerS3({
        s3: s3,
        bucket: SPACES_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
          cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
          return keyBuilder(req, file, cb);
        }
      }),
      limits: {
        fileSize: sizeLimit
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new Error('Only image files are allowed!'), false);
        }
      }
    });
  };

  console.log('✅ DigitalOcean Spaces configured successfully');
}

// Export a getter function that returns the current uploadToSpaces
export function getUploadToSpaces(options = {}) {
  if (!uploadToSpaces) {
    // Fallback to memory storage if not initialized
    return multer({ 
      storage: multer.memoryStorage(),
      limits: { fileSize: options.maxFileSize || 10 * 1024 * 1024 }
    });
  }
  return uploadToSpaces(options);
}

export function getS3Client() {
  return s3;
}

export default s3;
