import { useState } from 'react'
import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  BookOpen,
  History,
  CalendarDays,
  Settings,
} from 'lucide-react'
import Dashboard from './pages/Dashboard.jsx'
import Problems from './pages/Problems.jsx'
import ProblemDetail from './pages/ProblemDetail.jsx'
import CalendarStats from './pages/CalendarStats.jsx'
import AIChat from './pages/AIChat.jsx'
import SettingsPage from './pages/Settings.jsx'

const navItems = [
  { to: '/', label: '数据看板', icon: LayoutDashboard, end: true },
  { to: '/problems', label: '题库', icon: BookOpen, end: true },
  { to: '/problems/review', label: '复习', icon: History, end: true },
  { to: '/calendar', label: '日历统计', icon: CalendarDays, end: true },
  { to: '/settings', label: '设置', icon: Settings },
]

const COLLAPSED_KEY = 'sidebar.collapsed'

export default function App() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1'
  )

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSED_KEY, v ? '0' : '1')
      return !v
    })
  }

  return (
    <div className="relative flex h-full">
      {/* macOS 标题栏拖拽区（Overlay 模式，覆盖在内容顶部） */}
      <div
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 z-50 h-7"
      />
      {/* 侧边栏 */}
      <aside
        className={`flex shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-300 ${
          collapsed ? 'w-[84px]' : 'w-56'
        }`}
      >
        {/* macOS 红绿灯悬浮在左上角，顶部留出安全区 */}
        <div
          className={`flex items-center pb-5 pt-12 ${
            collapsed ? 'flex-col justify-center gap-2 px-0' : 'gap-2 px-5'
          }`}
        >
          <img src="/logo.png" alt="LeetCode 笔记" className="h-8 w-8 shrink-0 rounded-lg" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">LeetCode 笔记</div>
              <div className="text-[11px] text-slate-400">本地学习助手</div>
            </div>
          )}
        </div>
        <nav className={`flex-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm transition-colors ${
                  collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
                } ${
                  isActive
                    ? 'bg-primary-50 font-medium text-primary-600'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className={collapsed ? 'py-4 text-center' : 'px-5 py-4'}>
          {collapsed ? (
            <div className="text-[10px] text-neutral-300">v0.1.0</div>
          ) : (
            <div className="text-[11px] text-neutral-400">v0.1.0 · Tauri2 + Go</div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? '展开菜单' : '收起菜单'}
          aria-label={collapsed ? '展开菜单' : '收起菜单'}
          className="group relative -mt-1 mb-3 flex h-7 w-full items-center justify-center border-t border-neutral-100 text-neutral-300 transition-colors hover:bg-neutral-50 hover:text-primary-600"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </aside>

      {/* 内容区 */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Outlet />}>
            <Route index element={<Dashboard />} />
            <Route path="problems" element={<Problems key="list" />} />
            <Route path="problems/review" element={<Problems key="review" reviewMode />} />
            <Route path="problems/:id" element={<ProblemDetail />} />
            <Route path="calendar" element={<CalendarStats />} />
            <Route path="ai" element={<AIChat />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </main>
    </div>
  )
}
