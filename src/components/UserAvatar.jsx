import { useState } from 'react'

export default function UserAvatar({ src, name, alt = '' }) {
  return <AvatarImage key={src || ''} src={src} name={name} alt={alt} />
}

function AvatarImage({ src, name, alt }) {
  const [failed, setFailed] = useState(false)
  const initial = Array.from(name?.trim() || '?')[0].toLocaleUpperCase()

  if (src && !failed) {
    return <img src={src} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" />
  }

  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className="flex h-full w-full items-center justify-center bg-green-600 font-bold text-white"
    >
      {initial}
    </span>
  )
}
