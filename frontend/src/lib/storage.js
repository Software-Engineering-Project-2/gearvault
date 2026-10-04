import { api } from './api'

/**
 * Uploads a file using the S3 presigned URL flow:
 * 1. POST /api/uploads/presign -> { upload_url, key }
 * 2. PUT file bytes directly to upload_url
 * 3. Returns { path: key, key, publicUrl: key }
 */
export const uploadStorageFile = async (file, folderOrType = 'items', options = {}) => {
  if (!file) return null

  // Determine type: 'item' or 'condition'
  let uploadType = 'item'
  let rentalId = null

  if (typeof options === 'string' || typeof options === 'number') {
    rentalId = options
  } else if (options && typeof options === 'object') {
    rentalId = options.rentalId || options.rental_id || options.id
  }

  if (
    folderOrType === 'condition' ||
    folderOrType === 'pre-dispatch' ||
    folderOrType === 'post-rental' ||
    String(options).includes('condition')
  ) {
    uploadType = 'condition'
  }

  const payload = {
    type: uploadType,
    content_type: file.type || 'image/jpeg',
    file_size: file.size,
  }
  if (rentalId) {
    payload.rental_id = rentalId
  }

  // 1. Get presigned upload URL from Flask backend
  const presignData = await api('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const { upload_url, key } = presignData
  if (!upload_url || !key) {
    throw new Error('Storage presign failed: missing upload_url or key in response')
  }

  // 2. Direct PUT to S3 / MinIO
  const uploadResponse = await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  })

  if (!uploadResponse.ok) {
    throw new Error(`Direct storage upload failed: HTTP ${uploadResponse.status} ${uploadResponse.statusText}`)
  }

  return {
    path: key,
    key,
    publicUrl: key,
  }
}

/**
 * Converts a stored image path / key into a resolvable URL.
 */
export const getStoragePublicUrl = (imagePath) => {
  if (!imagePath) return ''
  if (/^https?:\/\//i.test(imagePath)) return imagePath

  const mediaBase = import.meta.env.VITE_MEDIA_BASE_URL
  if (mediaBase) {
    return `${mediaBase.replace(/\/+$/, '')}/${imagePath.replace(/^\/+/, '')}`
  }

  const s3Endpoint = import.meta.env.VITE_S3_ENDPOINT_URL
  const s3Bucket = import.meta.env.VITE_S3_BUCKET || 'gearvault-media'
  if (s3Endpoint) {
    return `${s3Endpoint.replace(/\/+$/, '')}/${s3Bucket}/${imagePath.replace(/^\/+/, '')}`
  }

  return `/media/${imagePath.replace(/^\/+/, '')}`
}
