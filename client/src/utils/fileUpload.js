import api from './api';

// Compress image before upload
const compressImage = async (blob, maxWidth = 1920, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate new dimensions
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (compressedBlob) => {
          resolve(compressedBlob);
        },
        'image/jpeg',
        quality
      );
    };
    
    img.src = objectUrl;
  });
};

// Retry helper function
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Upload attempt ${attempt}/${maxRetries}...`);
      const result = await operation();
      console.log(`Upload successful on attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Exponential backoff: wait longer between each retry
        const waitTime = delay * Math.pow(2, attempt - 1);
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError;
};

export const uploadPhoto = async (photoData) => {
  try {
    // Convert data URL to blob if needed
    let blob;
    if (photoData.startsWith('data:')) {
      const response = await fetch(photoData);
      blob = await response.blob();
    } else {
      blob = photoData;
    }

    // Compress image to reduce file size
    console.log(`Original image size: ${(blob.size / 1024).toFixed(2)} KB`);
    const compressedBlob = await compressImage(blob);
    console.log(`Compressed image size: ${(compressedBlob.size / 1024).toFixed(2)} KB`);

    // Upload with retry logic
    const uploadOperation = async () => {
      const formData = new FormData();
      formData.append('image', compressedBlob, `delivery-${Date.now()}.jpg`);

      const response = await api.post('/upload/delivery-photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 second timeout
      });

      if (!response.data.url) {
        throw new Error('No URL returned from server');
      }

      return response.data.url;
    };

    // Retry up to 3 times with exponential backoff
    const url = await retryOperation(uploadOperation, 3, 1000);
    return url;
    
  } catch (error) {
    console.error('Photo upload failed after all retries:', error);
    
    // Provide more specific error messages
    if (error.message?.includes('Network Error') || error.code === 'ECONNABORTED') {
      throw new Error('Network connection failed. Please check your internet connection and try again.');
    } else if (error.response?.status === 413) {
      throw new Error('Image file is too large. Please try taking a new photo.');
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again in a moment.');
    } else {
      throw new Error('Failed to upload photo. Please try again.');
    }
  }
};

// Alternative: Upload to Cloudinary or other cloud storage
export const uploadToCloudinary = async (photoData) => {
  try {
    let blob;
    if (photoData.startsWith('data:')) {
      const response = await fetch(photoData);
      blob = await response.blob();
    } else {
      blob = photoData;
    }

    // Compress image before upload
    const compressedBlob = await compressImage(blob);

    const uploadOperation = async () => {
      const formData = new FormData();
      formData.append('file', compressedBlob);
      formData.append('upload_preset', 'delivery_photos');
      formData.append('cloud_name', 'your-cloud-name');

      const response = await fetch('https://api.cloudinary.com/v1_1/your-cloud-name/image/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const data = await response.json();
      return data.secure_url;
    };

    // Retry with exponential backoff
    const url = await retryOperation(uploadOperation, 3, 1000);
    return url;
    
  } catch (error) {
    console.error('Cloudinary upload failed:', error);
    throw new Error('Failed to upload to cloud storage');
  }
};