import { supabase } from './supabaseClient'

export const getStorageBucket = bucketName =>
  bucketName || import.meta.env.VITE_SUPABASE_ITEMS_BUCKET || 'item-images'

const createStoragePath = (folder, file) => {
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
  return `${folder}/${crypto.randomUUID()}${extension.toLowerCase()}`
}

export const uploadStorageFile = async (file, folder, bucketName) => {
  if (!file) return null

  const bucket = getStorageBucket(bucketName)
  const path = createStoragePath(folder, file)
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  })

  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { path, publicUrl: data.publicUrl }
}

export const getStoragePublicUrl = imagePath => {
  if (!imagePath) return null
  if (/^https?:\/\//i.test(imagePath)) return imagePath

  const bucket = getStorageBucket()
  const path = imagePath.replace(/^\/+/, '')
  const storagePath = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path

  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl
}
