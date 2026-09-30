// 校验 i18n 字典：key 唯一性、插值占位符一致性
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'src/i18n/locales'
const files = readdirSync(dir).filter((f) => f.endsWith('.js'))

const all = new Map()   // key -> [files]
const bad = []

for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8')
  // 逐条匹配  'key': 'value',
  const re = /^\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)',?\s*$/gm
  let m
  while ((m = re.exec(src)) !== null) {
    const key = m[1].replace(/\\'/g, "'")
    const val = m[2].replace(/\\'/g, "'")
    if (!all.has(key)) all.set(key, [])
    all.get(key).push({ file: f, val })

    // 占位符一致性
    const ph = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join(',')
    if (ph(key) !== ph(val)) bad.push(`${f}: 占位符不一致  key=${key}  val=${val}`)
    // 值不应仍是中文
    if (/[\u4e00-\u9fff]/.test(val) && !/^[⚡👌🤔🤯💀📚🔁✅]+\s*$/.test(val) && !/[一-鿿]/.test(key)) {
      bad.push(`${f}: 英文值仍含中文  ${key} -> ${val}`)
    }
  }
}

console.log('字典条目总数:', all.size)
console.log('字典文件数:', files.length)

// 重复 key（值不同则冲突；值相同可接受）
const dup = []
for (const [k, v] of all) if (v.length > 1) {
  const uniq = new Set(v.map((x) => x.val))
  dup.push(`${k}  (${v.map((x) => x.file).join(', ')}) 值${uniq.size === 1 ? '一致' : '冲突!'}`)
}
if (dup.length) {
  console.log('\n=== 重复 key ===')
  dup.forEach((d) => console.log(' ', d))
  if (dup.some((d) => d.includes('冲突'))) { console.log('存在冲突值'); }
} else {
  console.log('无重复 key')
}

console.log('\n=== 问题 ===')
if (bad.length === 0) console.log('无')
else bad.forEach((b) => console.log(' -', b))
