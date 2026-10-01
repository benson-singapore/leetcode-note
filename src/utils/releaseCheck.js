export const RELEASES_URL = 'https://github.com/benson-singapore/leetcode-note/releases'
const LATEST_RELEASE_API = 'https://api.github.com/repos/benson-singapore/leetcode-note/releases/latest'
const RELEASES_API = 'https://api.github.com/repos/benson-singapore/leetcode-note/releases/tags'

function parseVersion(version) {
  const match = String(version || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  return match ? match.slice(1, 4).map(Number) : null
}

export function isNewerVersion(latest, current) {
  const latestParts = parseVersion(latest)
  const currentParts = parseVersion(current)
  if (!latestParts || !currentParts) return false
  for (let index = 0; index < 3; index += 1) {
    if (latestParts[index] !== currentParts[index]) return latestParts[index] > currentParts[index]
  }
  return false
}

export async function fetchLatestRelease() {
  const release = await fetchRelease(LATEST_RELEASE_API)
  return normalizeRelease(release)
}

export async function fetchReleaseByVersion(version) {
  const normalizedVersion = String(version || '').trim().replace(/^v/i, '')
  for (const tag of [`v${normalizedVersion}`, normalizedVersion]) {
    const response = await fetch(`${RELEASES_API}/${encodeURIComponent(tag)}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (response.ok) return normalizeRelease(await response.json())
    if (response.status !== 404) throw new Error(`GitHub 返回错误 (${response.status})`)
  }
  return null
}

async function fetchRelease(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`GitHub 返回错误 (${response.status})`)
  return response.json()
}

function normalizeRelease(release) {
  if (!release?.tag_name) throw new Error('GitHub 未返回有效的版本号')
  return {
    version: release.tag_name.replace(/^v/i, ''),
    name: release.name || release.tag_name,
    body: release.body || '',
    publishedAt: release.published_at || release.created_at || '',
    htmlUrl: release.html_url || RELEASES_URL,
  }
}
