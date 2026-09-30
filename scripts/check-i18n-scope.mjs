/**
 * 作用域检查：找出在函数内使用 t()、但该函数作用域（或父作用域）没有声明
 * useI18n() 的位置 —— 这类代码在运行时会抛 "Can't find variable: t"。
 */
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const traverse = _traverse.default || _traverse

const plugins = ['jsx', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread', 'classProperties']

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (p.includes('/i18n')) continue
      walk(p, out)
    } else if (/\.jsx?$/.test(e)) out.push(p)
  }
  return out
}

let problems = 0
for (const file of walk('src')) {
  const code = readFileSync(file, 'utf8')
  if (!/useI18n/.test(code)) continue
  const ast = parse(code, { sourceType: 'module', plugins, errorRecovery: true })

  traverse(ast, {
    // 只看组件/函数作用域
    FunctionDeclaration(path) { check(path) },
    FunctionExpression(path) { check(path) },
    ArrowFunctionExpression(path) { check(path) },
  })

  // 模块顶层（不在任何函数内）使用 t() 会在 import 时直接抛错
  const program = ast.program
  for (const stmt of program.body) {
    const src = code.slice(stmt.start, stmt.end)
    if (/(?<![A-Za-z_.$])t\(/.test(src)) {
      // 排除函数内部（函数体里的 t() 由上面的检查负责）
      if (/(function\s+\w*\s*\(|=>)/.test(src)) continue
      console.log(`✗ ${file}:${stmt.loc.start.line}  模块顶层使用了 t()（import 时即报错）`)
      problems++
    }
  }

  function check(fnPath) {
    // 函数体内是否出现 t( 调用
    let used = false
    fnPath.traverse({
      CallExpression(p) {
        const c = p.node.callee
        if (c && c.type === 'Identifier' && c.name === 't') {
          // 跳过它自己声明的 t（同一函数内 const t = ...）
          const binding = fnPath.scope.getBinding('t')
          if (!binding || binding.path.node !== p.node.callee) used = true
        }
      },
    })
    if (!used) return

    // 沿作用域链向上找 useI18n() 声明
    let scope = fnPath.scope
    let ok = false
    while (scope) {
      for (const b of Object.keys(scope.bindings)) {
        if (b === 't') {
          const init = scope.bindings[b].path.node
          // const { t } = useI18n()  /  const t = useI18n().t
          const okCall = JSON.stringify(init).includes('useI18n')
          if (okCall) ok = true
        }
      }
      if (ok) break
      scope = scope.parent
    }

    if (!ok) {
      const name = fnPath.node.id?.name || (fnPath.parent.type === 'VariableDeclarator' ? 'anon' : 'anon')
      const line = fnPath.node.loc.start.line
      console.log(`✗ ${file}:${line}  function ${name}()  使用了 t() 但作用域内无 useI18n()`)
      problems++
    }
  }
}

console.log(problems === 0 ? '\n✓ 所有使用 t() 的作用域都能拿到 useI18n()' : `\n共 ${problems} 处问题`)
process.exit(problems === 0 ? 0 : 1)
