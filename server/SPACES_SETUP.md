# DigitalOcean Spaces Setup Guide

## 1. Create a Space

1. Log in to your DigitalOcean account
2. Go to **Spaces** in the left menu
3. Click **Create a Space**
4. Choose a datacenter region (e.g., `nyc3`, `sgp1`, `fra1`)
5. Give it a name (e.g., `matter-delivery-photos`)
6. Choose **Public** access (so images are accessible via URL)
7. Click **Create a Space**

## 2. Generate Access Keys

1. Go to **API** → **Spaces Keys**
2. Click **Generate New Key**
3. Give it a name (e.g., `delivery-tracker-upload`)
4. Save the **Access Key** and **Secret Key** (you'll need these)

## 3. Configure Environment Variables

Add these to your `.env` file on the server:

```env
# DigitalOcean Spaces Configuration
SPACES_KEY=your_spaces_access_key
SPACES_SECRET=your_spaces_secret_key
SPACES_BUCKET=matter-delivery-photos
SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
```

**Important:** Replace values with your actual:
- `SPACES_KEY` - Your Spaces access key
- `SPACES_SECRET` - Your Spaces secret key
- `SPACES_BUCKET` - Your Space name
- `SPACES_ENDPOINT` - Based on your region:
  - New York: `nyc3.digitaloceanspaces.com`
  - Singapore: `sgp1.digitaloceanspaces.com`
  - Frankfurt: `fra1.digitaloceanspaces.com`
  - San Francisco: `sfo3.digitaloceanspaces.com`
- `SPACES_REGION` - Must match your endpoint (e.g., `nyc3`, `sgp1`, `fra1`)

## 4. Install Dependencies

On your server:
```bash
cd /path/to/matter-delivery-tracker/server
npm install
```

This will install:
- `aws-sdk` (Spaces uses S3-compatible API)
- `multer-s3` (Direct upload to Spaces)
- `sharp` (Image compression)

## 5. Restart Your Server

```bash
pm2 restart matter-delivery-api
pm2 logs
```

## 6. Test Upload

1. Have a driver complete a delivery and upload a photo
2. Check your Space in the DigitalOcean dashboard - you should see files in the `photos/` folder
3. Images will be publicly accessible at:
   ```
   https://matter-delivery-photos.nyc3.digitaloceanspaces.com/photos/delivery-xxxxx.jpg
   ```

## Benefits of Using Spaces

✅ **Free up disk space** - Your 25GB server disk won't fill up with photos
✅ **Better performance** - Offloads storage and serving of images
✅ **CDN built-in** - Fast delivery worldwide
✅ **Scalable** - No limits on photo uploads
✅ **Cost-effective** - $5/month for 250GB storage + 1TB transfer

## Pricing

- **$5/month** for 250GB storage + 1TB outbound transfer
- Additional storage: $0.02/GB/month
- Additional transfer: $0.01/GB

For 13 drivers uploading ~50 photos/day:
- ~650 photos/day = ~20,000 photos/month
- Average photo size after compression: ~200KB
- Monthly storage: ~4GB = **$5/month** (well within limits)

## Fallback to Local Storage

The system automatically falls back to local storage if Spaces credentials are not configured. Remove or comment out the `SPACES_*` environment variables to use local storage.

## Troubleshooting

**Error: "Access Denied"**
- Check that your Space is set to **Public** read access
- Verify your Access Key and Secret Key are correct

**Error: "Region not found"**
- Ensure `SPACES_REGION` matches your `SPACES_ENDPOINT`

**Photos not appearing**
- Check Space name matches `SPACES_BUCKET` in `.env`
- Verify photos folder exists in your Space
- Check PM2 logs: `pm2 logs matter-delivery-api`
