import { resolveBase } from './client'

// 图床：文件上传与 URL 转存（成功响应 data.image.url）

export async function uploadImageFile(file) {
  const base = await resolveBase()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${base}/api/v1/images/upload`, {
    method: 'POST',
    body: form,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(json?.msg || `[${res.status}] 上传失败`)
  }
  const url = json?.data?.image?.url
  if (!url) throw new Error(json?.msg || '上传失败：未返回图片地址')
  return url
}

export async function uploadImageFromUrl(url) {
  const base = await resolveBase()
  const res = await fetch(`${base}/api/v1/images/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(json?.msg || `[${res.status}] 转存失败`)
  }
  const preview = json?.data?.image?.url
  if (!preview) throw new Error(json?.msg || '转存失败：未返回图片地址')
  return preview
}
