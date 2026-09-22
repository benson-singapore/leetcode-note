import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Sparkles, Settings } from 'lucide-react'
import Dashboard from './pages/Dashboard.jsx'
import Problems from './pages/Problems.jsx'
import ProblemDetail from './pages/ProblemDetail.jsx'
import AIChat from './pages/AIChat.jsx'
import SettingsPage from './pages/Settings.jsx'

const navItems = [
  { to: '/', label: '复习看板', icon: LayoutDashboard, end: true },
  { to: '/problems', label: '题库', icon: BookOpen },
  { to: '/ai', label: 'AI 问答', icon: Sparkles },
  { to: '/settings', label: '设置', icon: Settings },
]

export default function App() {
  return (
    <div className="flex h-full">
      {/* 侧边栏 */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-600" />
          <div>
            <div className="text-sm font-semibold text-neutral-900">LeetCode 笔记</div>
            <div className="text-[11px] text-neutral-400">本地学习助手</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-50 font-medium text-primary-600'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-[11px] text-neutral-400">v0.1.0 · Tauri2 + Go</div>
      </aside>

      {/* 内容区 */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Outlet />}>
            <Route index element={<Dashboard />} />
            <Route path="problems" element={<Problems />} />
            <Route path="problems/:id" element={<ProblemDetail />} />
            <Route path="ai" element={<AIChat />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </main>
    </div>
  )
}
