// src/lib/storage.ts
import { supabase } from '@/lib/supabase_shim'

export async function uploadLogo(file: File) {
  const path = `logos/company.${file.name.split('.').pop()}`

  const { error } = await supabase.storage
    .from('app-assets')
    .upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/png',
      cacheControl: '3600',
    })

  if (error) throw error
  return path
}

export async function getLogoSignedUrl(path: string) {
  const { data, error } = await supabase.storage
    .from('app-assets')
    .createSignedUrl(path, 60 * 60) // 1 ora
  if (error) throw error
  return data.signedUrl
}
