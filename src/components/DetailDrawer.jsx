import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'
import hljs from 'highlight.js'
import {
  X,
  ExternalLink,
  Trash2,
  FileText,
  StickyNote,
  Terminal,
  Quote,
  BrainCircuit,
  History,
  Plus,
  Star,
  Link2,
  Check,
  Copy,
  ImagePlus,
  PenLine,
  Eye,
  Layers,
  Loader2,
  Sparkles,
  Undo2,
  Square,
} from 'lucide-react'
import { FrequencyBars } from './FrequencyBars'
import { CodeEditor, HLJS_LANGS } from './CodeEditor'
import { SolutionSchemesTab } from './SolutionSchemesTab'
import { EmbeddedBrowser } from './EmbeddedBrowser'
import { uploadImageFile, uploadImageFromUrl } from '../api/images'
import { chatStream, cancelChat } from '../api/ai'
import { getBrowserOpenMode, openInSystemBrowser } from '../utils/browserOpen'
import {
  getProblem,
  updateUserProblem,
  getReviews,
  updateReview,
  deleteProblem,
} from '../api/leetcode'
import { useI18n } from '../i18n'

const OFFICIAL_DIFFICULTIES = {
  Easy: { color: 'text-emerald-500 bg-emerald-50 border-emerald-100', label: '简单' },
  Medium: { color: 'text-amber-500 bg-amber-50 border-amber-100', label: '中等' },
  Hard: { color: 'text-rose-500 bg-rose-50 border-rose-100', label: '困难' },
}

const PERSONAL_RATINGS = {
  1: { label: '秒杀', color: 'text-primary-500', icon: '⚡' },
  2: { label: '拿捏', color: 'text-blue-500', icon: '👌' },
  3: { label: '纠结', color: 'text-amber-500', icon: '🤔' },
  4: { label: '烧脑', color: 'text-orange-500', icon: '🤯' },
  5: { label: '地狱', color: 'text-rose-600', icon: '💀' },
}

// AI 优化笔记：剥离 HTML 标签，仅保留纯文本用于拼 prompt
const stripHtml = (html) => {
  if (!html) return ''
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

const AI_OPTIMIZE_SYSTEM_PROMPT =
  '你是一位资深算法教练，擅长为 LeetCode 题目撰写清晰、结构化的中文核心笔记。请严格只输出 Markdown 格式的笔记正文，不要输出任何解释、前言或寒暄。'

const STATUS_MAP = {
  Unpracticed: {
    label: '未练习',
    light: 'bg-slate-50 text-slate-600',
    comment: '还没开始呢，我就是个小菜鸡🐔',
  },
  Confused: {
    label: '一脸懵逼😳',
    light: 'bg-red-50 text-red-600',
    comment: '这题是什么鬼？我的脑子呢？🤯',
  },
  New: {
    label: '未掌握',
    light: 'bg-blue-50 text-blue-600',
    comment: '刚接触，还在摸索中...慢慢来吧😅',
  },
  Struggling: {
    label: '半生不熟',
    light: 'bg-orange-50 text-orange-600',
    comment: '有点会，但又不太会，就这样吧🤷',
  },
  Relearning: {
    label: '需重练',
    light: 'bg-yellow-50 text-yellow-700',
    comment: '思路生疏了，得从头再练一遍🔁',
  },
  Stable: {
    label: '很稳',
    light: 'bg-cyan-50 text-cyan-700',
    comment: '这题目前非常稳，偶尔回顾即可✅',
  },
  Reviewing: {
    label: '复习中',
    light: 'bg-purple-50 text-purple-600',
    comment: '反复琢磨中，争取早日成仙✨',
  },
  Mastered: {
    label: '已精通',
    light: 'bg-emerald-50 text-emerald-700',
    comment: '我就是这道题的主人！👑',
  },
}

// 「训练打卡」抽屉回显用：掌握程度 / 完成状态选项（与插件、后端字段对齐）
const MASTERY_OPTIONS = [
  { value: 'Confused', label: '一脸懵逼😳', icon: '😳' },
  { value: 'New', label: '未掌握', icon: '📚' },
  { value: 'Struggling', label: '半生不熟', icon: '🤷' },
  { value: 'Relearning', label: '需重练', icon: '🔁' },
  { value: 'Stable', label: '很稳', icon: '✅' },
  { value: 'Mastered', label: '已精通', icon: '👑' },
]

const PROGRESS_STATUS_OPTIONS = [
  { value: 'Unpracticed', label: '未开始', icon: '⏳' },
  { value: 'Reviewing', label: '复习中', icon: '🔄' },
  { value: 'Mastered', label: '已完成', icon: '🏁' },
]

// 代码快照语言选项：slug 与 LeetCode / highlight.js 映射保持一致
const REVIEW_LANGUAGE_OPTIONS = [
  { value: 'java', label: 'Java' },
  { value: 'python3', label: 'Python3' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'scala', label: 'Scala' },
  { value: 'dart', label: 'Dart' },
  { value: 'mysql', label: 'MySQL' },
]

export function DetailDrawer({ activeProblem, updateProblem, onDeleted, onClose, loading }) {
  const { t } = useI18n()
  const [detailTab, setDetailTab] = useState('desc')
  const [reviews, setReviews] = useState([])
  const [isLoadingReviews, setIsLoadingReviews] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [embeddedUrl, setEmbeddedUrl] = useState(null) // null = 内嵌浏览器关闭
  const [embeddedToolMode, setEmbeddedToolMode] = useState('notes')

  useEffect(() => {
    setDetailTab('desc')
    setConfirmingDelete(false)
    setEmbeddedUrl(null) // 切题时关闭内嵌浏览器
    if (activeProblem?.id) {
      loadReviews()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProblem?.id])

  // Drawer 关闭时同步关闭内嵌浏览器窗口
  const handleClose = () => {
    setEmbeddedUrl(null)
    onClose?.()
  }

  const handleEmbeddedClose = async () => {
    setEmbeddedUrl(null)
    if (!activeProblem?.id || !updateProblem) return
    try {
      const res = await getProblem(activeProblem.id)
      const latest = res?.data || res
      if (latest?.id === activeProblem.id) {
        updateProblem(latest)
        await loadReviews(latest.userProblemId || latest.user_problem_id || activeProblem.userProblemId)
      }
    } catch (error) {
      console.error(t('刷新内置浏览器同步的题目数据失败:'), error)
    }
  }

  // VIEW_LEETCODE：按「设置 → 复习偏好 → 题目页打开方式」决定打开方式
  const handleViewLeetcode = async () => {
    if (!activeProblem?.id) return
    const url = `https://leetcode.cn/problems/${activeProblem.titleSlug || activeProblem.title}`
    const mode = await getBrowserOpenMode()
    if (mode === 'system') {
      const target = new URL(url)
      target.searchParams.set('__lcn_tool_mode', 'notes')
      openInSystemBrowser(target.toString())
      return
    }
    setEmbeddedToolMode('notes')
    setEmbeddedUrl(url)
  }

  const handleOpenTraining = async () => {
    if (!activeProblem?.id) return
    const url = `https://leetcode.cn/problems/${activeProblem.titleSlug || activeProblem.title}`
    const mode = await getBrowserOpenMode()
    if (mode === 'system') {
      const target = new URL(url)
      target.searchParams.set('__lcn_tool_mode', 'training')
      openInSystemBrowser(target.toString())
      return
    }
    setEmbeddedToolMode('training')
    setEmbeddedUrl(url)
  }

  const loadReviews = async (userProblemId = activeProblem?.userProblemId) => {
    if (!userProblemId) {
      setReviews([])
      return
    }
    setIsLoadingReviews(true)
    try {
      const res = await getReviews(userProblemId)
      setReviews(res?.data || res || [])
    } catch (error) {
      console.error(t('加载复习记录失败:'), error)
      setReviews([])
    } finally {
      setIsLoadingReviews(false)
    }
  }

  const handleDelete = async () => {
    if (!activeProblem?.id || deleting) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    setDeleting(true)
    try {
      await deleteProblem(activeProblem.id)
      onDeleted?.(activeProblem.id)
    } catch (error) {
      console.error(t('删除题目失败:'), error)
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  // 挂载到 body，避免被页面内 animate-in 等祖先的 stacking context 困住，
  // 同时 z-[60] 盖过顶部 macOS 拖拽条，消除遮罩顶部的留白
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end overflow-hidden antialiased">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-in fade-in duration-300"
        onClick={handleClose}
      ></div>
      <div className="relative w-full max-w-[80%] h-full bg-white shadow-2xl flex flex-col">
        {loading || !activeProblem ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="animate-spin h-12 w-12 text-primary-600 mx-auto mb-4" />
              <p className="text-slate-600 text-sm">{t('加载题目详情中...')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* 头部 */}
            <div className="px-8 py-5 border-b border-slate-100 bg-gradient-to-br from-primary-50/60 via-white to-white flex items-center justify-between gap-4 shrink-0 sticky top-0 z-10">
              <div className="flex items-center gap-4 min-w-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 font-mono text-sm font-bold text-white shadow-lg shadow-primary-200">
                  #{activeProblem.lcId}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-bold text-lg text-slate-800 tracking-tight leading-none truncate">
                      {activeProblem.translatedTitle || activeProblem.title}
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider border shadow-sm shrink-0 ${
                        STATUS_MAP[activeProblem.status]?.light ||
                        'bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {t(STATUS_MAP[activeProblem.status]?.label ||
                        activeProblem.status ||
                        '未知')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 min-w-0">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow-sm ${
                        OFFICIAL_DIFFICULTIES[activeProblem.difficulty]?.color ||
                        'text-slate-400 bg-slate-50 border-slate-100'
                      }`}
                    >
                      {activeProblem.difficulty || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-2 py-0.5 shadow-sm">
                      <span className="text-[10px] font-bold text-slate-300 tracking-widest">
                        通过率
                      </span>
                      <span className="text-xs font-semibold text-slate-600 font-mono tracking-tighter">
                        {activeProblem.passRate}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-2 py-0.5 shadow-sm">
                      <span className="text-[10px] font-bold text-slate-300 tracking-widest">
                        出题频率
                      </span>
                      <FrequencyBars score={activeProblem.frequency} />
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleViewLeetcode}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-[11px] font-semibold rounded-full hover:bg-primary-700 active:scale-95 transition-all shadow-lg shadow-primary-200"
                >
                  VIEW_LEETCODE <ExternalLink size={14} />
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  title={confirmingDelete ? t('再点一次确认删除') : t('删除此题目')}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-all active:scale-90 ${
                    confirmingDelete
                      ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                      : 'border-slate-100 bg-white text-slate-300 hover:border-rose-100 hover:bg-rose-50 hover:text-rose-500'
                  }`}
                >
                  {confirmingDelete ? (deleting ? t('删除中…') : t('确认删除？')) : <Trash2 size={16} />}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex min-w-0">
              {/* 左侧工作区 */}
              <div className="flex-1 overflow-hidden flex flex-col bg-[#FAFAFA] min-w-0">
                <div className="px-10 py-3 bg-white border-b border-slate-100 flex items-center gap-2 shrink-0 overflow-x-auto">
                  {[
                    { id: 'desc', label: '题目内容', icon: <FileText size={15} /> },
                    { id: 'notes', label: '核心笔记', icon: <StickyNote size={15} /> },
                    { id: 'code', label: '代码实现', icon: <Terminal size={15} /> },
                    { id: 'demo', label: '演示', icon: <Eye size={15} /> },
                    { id: 'solutionSchemes', label: '解题方案', icon: <Layers size={15} /> },
                  ].map((tab) => {
                    const active = detailTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setDetailTab(tab.id)}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all shrink-0 active:scale-95 ${
                          active
                            ? 'bg-primary-600 text-white shadow-lg shadow-primary-100'
                            : 'text-slate-400 bg-transparent hover:bg-slate-50 hover:text-slate-600'
                        }`}
                      >
                        <span className={active ? 'text-white/90' : 'text-slate-300 transition-colors group-hover:text-slate-400'}>
                          {tab.icon}
                        </span>
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                  {detailTab === 'desc' && (
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar scroll-smooth min-w-0">
                      <DescriptionTab activeProblem={activeProblem} />
                    </div>
                  )}
                  {detailTab === 'notes' && (
                    <div className="flex-1 overflow-hidden p-6 custom-scrollbar scroll-smooth min-w-0">
                      <NotesTab activeProblem={activeProblem} updateProblem={updateProblem} />
                    </div>
                  )}
                  {detailTab === 'code' && (
                    <div className="flex-1 overflow-hidden p-6 custom-scrollbar scroll-smooth min-w-0">
                      <CodeEditor activeProblem={activeProblem} updateProblem={updateProblem} />
                    </div>
                  )}
                  {detailTab === 'demo' && (
                    <div id="detail-demo-host" className="relative flex-1 overflow-hidden min-w-0">
                      <SolutionSchemesTab
                        activeProblem={activeProblem}
                        updateProblem={updateProblem}
                        defaultOnly
                      />
                    </div>
                  )}
                  {detailTab === 'solutionSchemes' && (
                    <div className="flex-1 overflow-hidden p-6 custom-scrollbar scroll-smooth min-w-0">
                      <SolutionSchemesTab
                        activeProblem={activeProblem}
                        updateProblem={updateProblem}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧边栏 */}
              <aside className="w-96 bg-white border-l border-slate-50 overflow-y-auto p-8 space-y-10 custom-scrollbar shrink-0">
                <ProgressStatusSection
                  activeProblem={activeProblem}
                  updateProblem={updateProblem}
                />
                <PersonalRatingSection
                  activeProblem={activeProblem}
                  updateProblem={updateProblem}
                />
                <TagsSection activeProblem={activeProblem} />
                <div className="h-px bg-slate-50"></div>
                <ReviewSection
                  activeProblem={activeProblem}
                  onOpenTraining={handleOpenTraining}
                  reviews={reviews}
                  isLoadingReviews={isLoadingReviews}
                />
                <div className="h-px bg-slate-50"></div>
              </aside>
            </div>
          </>
        )}
        {/* 内嵌 LeetCode 浏览器（独立 Tauri 窗口 + 工具栏） */}
        {embeddedUrl && (
          <EmbeddedBrowser
            url={embeddedUrl}
            toolMode={embeddedToolMode}
            onClose={handleEmbeddedClose}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

function DescriptionTab({ activeProblem }) {
  const { t } = useI18n()
  const constraints = activeProblem.constraints || []
  return (
    <div className="max-w-3xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${
              OFFICIAL_DIFFICULTIES[activeProblem.difficulty]?.color ||
              'text-slate-500 bg-slate-50 border-slate-100'
            }`}
          >
            {t(OFFICIAL_DIFFICULTIES[activeProblem.difficulty]?.label ||
              activeProblem.difficulty ||
              '—')}
          </span>
        </div>
      </div>

      <div className="text-[12px] text-slate-600 leading-[1.5] font-medium antialiased space-y-2 border-l-4 border-primary-500/20 pl-4 prose prose-sm max-w-none">
        {activeProblem.translatedContent ? (
          <div dangerouslySetInnerHTML={{ __html: activeProblem.translatedContent }} />
        ) : activeProblem.content ? (
          <div dangerouslySetInnerHTML={{ __html: activeProblem.content }} />
        ) : (
          <p>{t('暂无题目描述')}</p>
        )}
      </div>

      <div className="space-y-3">
        {(activeProblem.examples || []).map((ex, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-800 tracking-tight">{t('示例')} {i + 1}:</p>
            <div className="bg-slate-100/60 border border-slate-100 rounded-lg p-3 font-mono text-[11px] space-y-1 text-slate-700 shadow-inner">
              <p>
                <span className="font-bold text-slate-400">{t('输入:')}</span> {ex.input}
              </p>
              <p>
                <span className="font-bold text-slate-400">{t('输出:')}</span> {ex.output}
              </p>
              {ex.explanation && (
                <p>
                  <span className="font-bold text-slate-400">{t('解释:')}</span> {ex.explanation}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {(constraints || []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-800 tracking-tight">{t('提示：')}</p>
          <div className="border-l-4 border-primary-500/20 pl-4 space-y-1">
            {constraints.map((c, i) => (
              <p key={i} className="font-mono text-[11px] text-slate-500">
                {c}
              </p>
            ))}
          </div>
        </div>
      )}

      <SimilarQuestionsSection activeProblem={activeProblem} />
    </div>
  )
}

function NotesTab({ activeProblem, updateProblem }) {
  const { t } = useI18n()
  const [notes, setNotes] = useState(activeProblem.notes || '')
  const [notesMode, setNotesMode] = useState(() =>
    (activeProblem.notes || '').trim() ? 'preview' : 'edit'
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageModalOpen, setImageModalOpen] = useState(false)
  const [imageSourceTab, setImageSourceTab] = useState('file') // 'file' | 'url'
  const fileInputRef = useRef(null)

  // ===== AI 优化笔记 =====
  const [aiState, setAiState] = useState('idle') // idle | streaming | done | error
  const [aiError, setAiError] = useState('')
  const [aiSnapshot, setAiSnapshot] = useState(null) // AI 生成前的笔记快照，用于撤销
  const [aiStreamText, setAiStreamText] = useState('')
  const aiAbortRef = useRef(false)

  useEffect(() => {
    const next = activeProblem.notes || ''
    setNotes(next)
    setSaveStatus('')
    setImageUrlInput('')
    setImageModalOpen(false)
    setImageSourceTab('file')
    setNotesMode(next.trim() ? 'preview' : 'edit')
    // 切换题目时重置 AI 状态与撤销快照
    setAiState('idle')
    setAiError('')
    setAiSnapshot(null)
    setAiStreamText('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProblem.id, activeProblem.notes])

  useEffect(() => {
    if (!(notes || '').trim()) {
      setNotesMode('edit')
    }
  }, [notes])

  const insertImageMarkdown = (url) => {
    setNotesMode('edit')
    const snippet = `\n\n![](${url})\n\n`
    const newNotes = (notes || '') + snippet
    setNotes(newNotes)
    updateProblem({ ...activeProblem, notes: newNotes })
  }

  const handlePickImageFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || imageUploading) return
    setImageUploading(true)
    try {
      const url = await uploadImageFile(file)
      insertImageMarkdown(url)
      setImageModalOpen(false)
    } catch (err) {
      console.error(err)
      alert(err.message || t('图片上传失败'))
    } finally {
      setImageUploading(false)
    }
  }

  const handleUploadFromUrlField = async () => {
    if (!imageUrlInput.trim() || imageUploading) return
    setImageUploading(true)
    try {
      const url = await uploadImageFromUrl(imageUrlInput)
      insertImageMarkdown(url)
      setImageUrlInput('')
      setImageModalOpen(false)
    } catch (err) {
      console.error(err)
      alert(err.message || t('URL 图片上传失败'))
    } finally {
      setImageUploading(false)
    }
  }

  const handleNotesChange = (e) => {
    const newNotes = e.target.value
    setNotes(newNotes)
    updateProblem({ ...activeProblem, notes: newNotes })
  }

  const handleSaveNotes = async () => {
    if (!activeProblem.id) return

    setIsSaving(true)
    setSaveStatus('保存中...')

    try {
      await updateUserProblem(activeProblem.userProblemId || activeProblem.id, {
        personalDifficulty: activeProblem.personalDifficulty,
        status: activeProblem.status,
        progressStatus: activeProblem.progressStatus,
        notes: notes,
        code: activeProblem.code || '',
      })
      setSaveStatus('已保存')
      // 保存落库后，清除 AI 撤销快照（不可再撤销）
      setAiSnapshot(null)
      setAiState('idle')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch (error) {
      console.error(t('保存笔记失败:'), error)
      setSaveStatus(t('保存失败'))
      setTimeout(() => setSaveStatus(''), 2000)
    } finally {
      setIsSaving(false)
    }
  }

  // ===== AI 优化笔记 =====
  const buildAIOptimizePrompt = () => {
    const title = activeProblem.translatedTitle || activeProblem.title || ''
    const content = stripHtml(
      activeProblem.translatedContent || activeProblem.content || '',
    ).slice(0, 8000)
    const code = (activeProblem.code || '').trim().slice(0, 6000)
    const currentNotes = (notes || '').trim().slice(0, 8000)

    let task
    if (!currentNotes) {
      task =
        '当前核心笔记内容为空。请根据题目内容和代码实现，自动总结生成一篇结构清晰的「核心笔记」，建议包含：解题思路、关键步骤、代码讲解、复杂度分析、易错点等。'
    } else if (!code) {
      task =
        '当前没有代码实现。请先为这道题设计一个合适、可读性强的代码实现方案（附完整代码块）并进行讲解，再结合现有笔记内容，生成一篇优化后的「核心笔记」。'
    } else {
      task =
        '题目内容、代码实现和核心笔记三者俱全。请着重基于当前核心笔记的内容做优化：保留笔记中已有的个人思路与重点，修正错误、补全逻辑、让表达与结构更清晰，并结合代码实现适当补充讲解。'
    }

    return [
      `# 题目：${title}`,
      `## 题目内容\n${content || '（暂无）'}`,
      `## 代码实现\n${code ? '```' + '\n' + code + '\n```' : '（暂无）'}`,
      `## 当前核心笔记\n${currentNotes || '（暂无）'}`,
      `## 任务\n${task}`,
      '## 输出要求\n直接输出 Markdown 格式的笔记正文（可使用标题、列表、代码块等），不要输出任何额外解释、前后缀或寒暄。',
    ].join('\n\n')
  }

  const handleStopAI = () => {
    if (!aiAbortRef.current) return
    aiAbortRef.current = true
    cancelChat().catch(() => {})
  }

  const handleAIOptimize = async () => {
    if (aiState === 'streaming') return
    const content = stripHtml(
      activeProblem.translatedContent || activeProblem.content || '',
    )
    const currentNotes = (notes || '').trim()
    if (!content && !currentNotes) {
      setAiError(t('暂无题目内容，无法进行 AI 优化'))
      return
    }

    setAiSnapshot(notes || '') // 记录生成前快照，供撤销
    setAiState('streaming')
    setAiError('')
    setAiStreamText('')
    setNotesMode('preview')
    aiAbortRef.current = false

    let buffer = ''
    let errText = ''
    try {
      await chatStream(
        {
          message: buildAIOptimizePrompt(),
          systemPrompt: AI_OPTIMIZE_SYSTEM_PROMPT,
          // 不指定 provider/model，走设置中的「默认模型链」（含 failover）
        },
        ({ event, data }) => {
          if (event === 'delta') {
            buffer += data
            setAiStreamText(buffer)
          } else if (event === 'error') {
            errText = String(data)
            setAiError(errText)
          }
        },
      )

      if (buffer.trim()) {
        setNotes(buffer)
        updateProblem({ ...activeProblem, notes: buffer })
        setAiState(errText ? 'error' : 'done')
      } else {
        setAiSnapshot(null)
        setAiState('error')
        if (!errText) setAiError(t('AI 未返回内容'))
      }
    } catch (e) {
      console.error(t('AI 优化失败:'), e)
      setAiError(e.message || t('AI 优化失败'))
      setAiState('error')
      if (!buffer.trim()) {
        setAiSnapshot(null)
      }
    }
  }

  const handleUndoAI = () => {
    if (aiSnapshot === null) return
    const prev = aiSnapshot
    setNotes(prev)
    updateProblem({ ...activeProblem, notes: prev })
    setAiSnapshot(null)
    setAiStreamText('')
    setAiError('')
    setAiState('idle')
    setNotesMode(prev.trim() ? 'preview' : 'edit')
  }

  return (
    <div className="space-y-4 h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between px-2 mb-2 flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-3 text-primary-600">
          <Quote size={16} />
          <label className="text-[10px] font-semibold text-primary-600 tracking-tight">
            核心算法笔记
          </label>
        </div>
        <div className="flex items-center gap-2 flex-nowrap justify-end shrink-0 min-w-0">
          <div
            className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50/90 shrink-0"
            role="tablist"
            aria-label={t('笔记编辑或预览')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={notesMode === 'edit'}
              onClick={() => setNotesMode('edit')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                notesMode === 'edit'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <PenLine size={12} />{t('编辑')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={notesMode === 'preview'}
              onClick={() => (notes || '').trim() && setNotesMode('preview')}
              disabled={!(notes || '').trim()}
              title={!(notes || '').trim() ? t('有内容后可预览 Markdown') : t('预览 Markdown')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                notesMode === 'preview'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Eye size={12} />{t('预览')}
            </button>
          </div>
          {notesMode === 'edit' && (
            <button
              type="button"
              disabled={imageUploading}
              onClick={() => {
                setImageModalOpen(true)
                setImageSourceTab('file')
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0"
              title={t('插入图片（图床）')}
            >
              <ImagePlus size={12} />{t('插入图片')}
            </button>
          )}
          {/* AI 优化 / 停止 */}
          {aiState === 'streaming' ? (
            <button
              type="button"
              onClick={handleStopAI}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-300 shrink-0"
              title={t('停止生成')}
            >
              <Square size={10} fill="currentColor" />{t('停止')}
            </button>
          ) : (
            <button
              type="button"
              disabled={imageUploading}
              onClick={handleAIOptimize}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-primary-600 text-white text-[10px] font-bold hover:from-violet-700 hover:to-primary-700 transition-all disabled:opacity-50 shrink-0 shadow-sm"
              title={t('让 AI 根据题目内容、代码实现和当前笔记优化核心笔记')}
            >
              <Sparkles size={12} />{t('AI解析')}
            </button>
          )}
          {/* 撤销：AI 生成后可回滚，保存落库后消失 */}
          {aiSnapshot !== null && (
            <button
              type="button"
              disabled={aiState === 'streaming'}
              onClick={handleUndoAI}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-600 hover:bg-amber-100 disabled:opacity-50 shrink-0"
              title={t('撤销 AI 生成的结果，恢复到优化前的笔记')}
            >
              <Undo2 size={12} />{t('撤销')}
            </button>
          )}
          {aiError && (
            <span
              className="text-[10px] font-bold flex items-center gap-1 text-rose-600 max-w-[180px] truncate"
              title={aiError}
            >
              ⚠ {aiError}
            </span>
          )}
          {saveStatus && (
            <span
              className={`text-[10px] font-bold flex items-center gap-1 ${
                saveStatus === '已保存' ? 'text-primary-600' : 'text-slate-500'
              }`}
            >
              {saveStatus === '已保存' && <Check size={12} />}
              {saveStatus}
            </span>
          )}
          <button
            onClick={handleSaveNotes}
            disabled={isSaving || aiState === 'streaming'}
            className="px-3 py-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-lg hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '保存中...' : t('保存')}
          </button>
        </div>
      </div>
      {notesMode === 'edit' ? (
        <textarea
          className="flex-1 w-full min-h-[12rem] p-6 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-4 ring-primary-50 outline-none transition-all shadow-xl leading-relaxed font-medium custom-scrollbar resize-none"
          placeholder={t('在此记录你的解题心法…（支持 Markdown：标题、列表、代码块、图片等）')}
          value={notes}
          onChange={handleNotesChange}
        />
      ) : (
        <div className="flex-1 w-full min-h-[12rem] p-6 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-y-auto custom-scrollbar text-sm relative">
          <div className="notes-md-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {aiState === 'streaming' ? aiStreamText || ' ' : notes}
            </ReactMarkdown>
          </div>
          {aiState === 'streaming' && (
            <span className="sticky bottom-0 right-0 flex justify-end px-1 py-1 text-[10px] font-bold text-violet-600 items-center gap-1 bg-gradient-to-t from-white via-white/80 to-transparent">
              <Loader2 size={11} className="animate-spin" />{t('AI 生成中…')}
            </span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePickImageFile}
      />

      {imageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            aria-hidden="true"
            onClick={() => !imageUploading && setImageModalOpen(false)}
          />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-image-modal-title"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3
                id="notes-image-modal-title"
                className="text-sm font-semibold text-slate-800 tracking-tight"
              >{t('插入图片')}
              </h3>
              <button
                type="button"
                disabled={imageUploading}
                onClick={() => setImageModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label={t('关闭')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex rounded-xl border border-slate-200 p-1 bg-slate-50/80 mb-4">
              <button
                type="button"
                onClick={() => setImageSourceTab('file')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${
                  imageSourceTab === 'file'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ImagePlus size={14} />{t('本地上传')}
              </button>
              <button
                type="button"
                onClick={() => setImageSourceTab('url')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${
                  imageSourceTab === 'url'
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Link2 size={14} />{t('图片 URL')}
              </button>
            </div>

            {imageSourceTab === 'file' ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">{t('从本机选择图片，上传到图床后将自动在笔记中插入 Markdown 图片。')}
                </p>
                <button
                  type="button"
                  disabled={imageUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-[11px] font-bold text-slate-600 hover:border-primary-300 hover:bg-primary-50/50 transition-all disabled:opacity-50"
                >
                  {imageUploading ? t('上传中…') : t('选择本地图片')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">{t('粘贴可直链访问的图片地址，服务端转存图床后插入笔记。')}
                </p>
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 ring-primary-100"
                  disabled={imageUploading}
                />
                <button
                  type="button"
                  disabled={imageUploading || !imageUrlInput.trim()}
                  onClick={handleUploadFromUrlField}
                  className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-[11px] font-bold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {imageUploading ? t('处理中…') : t('上传并插入')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PersonalRatingSection({ activeProblem, updateProblem }) {
  const { t } = useI18n()
  const updateRating = async (val) => {
    const next = { ...activeProblem, personalDifficulty: val }
    updateProblem(next)
    try {
      await updateUserProblem(activeProblem.userProblemId || activeProblem.id, {
        personalDifficulty: val,
        status: activeProblem.status,
        progressStatus: activeProblem.progressStatus,
        notes: activeProblem.notes || '',
        code: activeProblem.code || '',
      })
    } catch (e) {
      console.error(t('更新个人手感失败:'), e)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <BrainCircuit size={12} />{t('个人手感难度自评')}
      </label>
      <div className="grid grid-cols-5 gap-1 p-0.5 bg-slate-50 rounded-xl border border-slate-100">
        {Object.entries(PERSONAL_RATINGS).map(([val, config]) => (
          <button
            key={val}
            onClick={() => updateRating(parseInt(val))}
            className={`py-1.5 px-1 rounded-lg flex flex-col items-center justify-center transition-all text-xs ${
              (activeProblem.personalDifficulty || 0) === parseInt(val)
                ? 'bg-white shadow-md scale-105 ring-2 ring-primary-50'
                : 'opacity-30 hover:opacity-100'
            }`}
          >
            <span className="text-sm">{config.icon}</span>
            <span className="text-[10px] font-semibold uppercase mt-0.5">{t(config.label)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ProgressStatusSection({ activeProblem, updateProblem }) {
  const { t } = useI18n()
  const current = activeProblem.progressStatus || 'Unpracticed'

  const options = [
    { key: 'Unpracticed', label: '未练习' },
    { key: 'Reviewing', label: '复习中' },
    { key: 'Mastered', label: '已掌握' },
  ]

  const updateProgress = async (key) => {
    if (!activeProblem?.userProblemId && !activeProblem?.id) return
    const next = { ...activeProblem, progressStatus: key }
    updateProblem(next)
    try {
      await updateUserProblem(activeProblem.userProblemId || activeProblem.id, {
        personalDifficulty: activeProblem.personalDifficulty,
        status: activeProblem.status,
        progressStatus: key,
        notes: activeProblem.notes || '',
        code: activeProblem.code || '',
      })
    } catch (e) {
      console.error(t('更新完成状态失败:'), e)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">{t('完成状态')}
      </label>
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-50 rounded-xl border border-slate-100">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => updateProgress(opt.key)}
            className={`py-2 rounded-lg text-[10px] font-semibold transition-all ${
              current === opt.key
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(opt.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

function TagsSection({ activeProblem }) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">{t('知识标签映射')}
      </label>
      <div className="flex flex-wrap gap-2">
        {(activeProblem.tags || []).map((t) => (
          <span
            key={t}
            className="px-3 py-1 bg-slate-50 text-slate-400 text-[10px] font-bold rounded-lg border border-slate-100 uppercase tracking-tighter"
          >
            #{t}
          </span>
        ))}
      </div>
    </div>
  )
}

function ReviewSection({
  activeProblem,
  onOpenTraining,
  reviews,
  isLoadingReviews,
}) {
  const { t } = useI18n()
  const progressOptions = [
    { key: 'Unpracticed', label: '未开始' },
    { key: 'Reviewing', label: '复习中' },
    { key: 'Mastered', label: '已完成' },
  ]
  const [selectedReview, setSelectedReview] = useState(null)
  const [copied, setCopied] = useState(false)
  // 编辑草稿：打开记录时初始化，保存成功后才回写列表，避免输入过程污染时间线
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // 代码编辑区：透明 textarea 叠在高亮层之上，滚动时同步位移保持对齐
  const codeAreaRef = useRef(null)
  const highlightLayerRef = useRef(null)

  const syncCodeScroll = () => {
    const area = codeAreaRef.current
    const layer = highlightLayerRef.current
    if (!area || !layer) return
    layer.scrollTop = area.scrollTop
    layer.scrollLeft = area.scrollLeft
  }

  const handleSelectReview = (review) => {
    setSelectedReview(review)
    setDraft({
      status: review.status || 'New',
      progress_status: review.progress_status || 'Reviewing',
      personal_difficulty: review.personal_difficulty || 0,
      comment: review.comment || '',
      code: review.code || '',
      code_language: review.code_language || 'java',
    })
    setSaveError('')
  }

  const handleCloseReview = () => {
    setSelectedReview(null)
    setDraft(null)
    setSaveError('')
  }

  // 只更新内容字段；后端不写 created_at，统计口径（按创建时间）保持不变
  const handleSaveReview = async () => {
    if (!selectedReview?.id || !draft) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await updateReview(selectedReview.id, {
        status: draft.status,
        progress_status: draft.progress_status,
        personal_difficulty: Number(draft.personal_difficulty) || 0,
        comment: draft.comment,
        code: draft.code,
        code_language: draft.code_language,
      })
      const updated = res?.data || res
      if (!updated?.id) throw new Error(t('保存成功但未返回记录'))
      setReviews((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      )
      setSelectedReview((current) => (current?.id === updated.id ? { ...current, ...updated } : current))
    } catch (error) {
      console.error(t('保存打卡记录失败:'), error)
      setSaveError(error.message || t('保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    setCopied(false)
  }, [selectedReview])

  const handleCopyCode = async () => {
    const code = draft?.code
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      console.error(t('复制代码快照失败:'), error)
    }
  }

  // 代码快照高亮：复用 CodeEditor 的 highlight.js 语言映射与 atom-one-dark 主题
  const highlightedSnapshot = useMemo(() => {
    const code = draft?.code
    if (!code) return ''
    const language = HLJS_LANGS[(draft.code_language || '').toLowerCase()]
    try {
      if (language) return hljs.highlight(code, { language, ignoreIllegals: true }).value
      return hljs.highlightAuto(code).value
    } catch (error) {
      console.error(t('代码快照高亮失败:'), error)
      return code.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch])
    }
  }, [draft])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest flex items-center gap-2">
          <History size={16} className="text-primary-500" />{t('训练打卡')}
        </label>
        <button
          type="button"
          onClick={onOpenTraining}
          title={t('打开题目进行练习和测试')}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-md active:scale-95 bg-primary-600 text-white shadow-primary-50"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="space-y-5 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-100">
        {isLoadingReviews ? (
          <div className="text-center py-4 text-slate-400 text-[12px]">{t('加载中...')}</div>
        ) : reviews && reviews.length > 0 ? (
          reviews.map((rev, idx) => (
            <button type="button" key={rev.id || idx} onClick={() => handleSelectReview(rev)} className="relative block w-full pl-8 text-left group">
              <div className="absolute left-0 top-1.5 w-6 h-6 bg-white border-2 border-primary-500 rounded-full flex items-center justify-center z-10 shadow-sm transition-transform group-hover:scale-110">
                <Star size={10} className="text-primary-500" fill="currentColor" />
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-50 shadow-sm group-hover:border-primary-100 transition-all">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase font-mono">
                    {new Date(rev.review_date).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      STATUS_MAP[rev.status]?.light || 'bg-slate-50 text-slate-600'
                    }`}
                  >
                    {t(STATUS_MAP[rev.status]?.label || rev.status)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium italic opacity-80">{rev.comment || t('未填写训练记录')}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                  {rev.progress_status && <span>{t(progressOptions.find((option) => option.key === rev.progress_status)?.label || rev.progress_status)}</span>}
                  {rev.personal_difficulty > 0 && <span>{'★'.repeat(rev.personal_difficulty)} 手感</span>}
                  {rev.code && <span>{t('含代码快照')}</span>}
                  <span className="text-slate-300">·</span>
                  <span>{t('点击查看 / 编辑')}</span>
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="text-center py-4 text-slate-400 text-[12px]">{t('暂无复习记录')}</div>
        )}
      </div>

      {selectedReview && draft && createPortal(
        <div className="fixed inset-0 z-[10000] flex justify-end overflow-hidden antialiased">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-300"
            onClick={handleCloseReview}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-detail-title"
            className="relative flex h-full w-[1000px] max-w-[92vw] flex-col overflow-hidden bg-white shadow-2xl animate-in slide-in-from-right-10 fade-in duration-300 sm:flex-row"
          >
            {/* 左侧：代码快照（可编辑） */}
            <div className="flex flex-1 min-w-0 flex-col p-6 min-h-0">
              <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="review-detail-title" className="truncate text-base font-bold text-slate-800">
                    {activeProblem?.translatedTitle || activeProblem?.title || t('代码快照')}
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-400">{t('代码快照')}
                    <span className="ml-1.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {new Date(selectedReview.created_at || selectedReview.review_date).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      · 创建后编辑不计入统计
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={draft.code_language}
                    onChange={(e) => setDraft((current) => ({ ...current, code_language: e.target.value }))}
                    aria-label={t('代码语言')}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none transition-all hover:border-primary-200 focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  >
                    {REVIEW_LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {draft.code && (
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-500 transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 active:scale-95"
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? t('已复制') : t('复制代码')}
                    </button>
                  )}
                </div>
              </header>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-700/40 bg-[#282c34]">
                {/* 语法高亮层：置于透明 textarea 之下，随滚动同步 */}
                <pre
                  aria-hidden="true"
                  ref={highlightLayerRef}
                  className="custom-scrollbar pointer-events-none absolute inset-0 overflow-hidden p-4 font-mono text-xs leading-5 text-[#abb2bf]">
                  <code
                    className="hljs !bg-transparent !p-0 block min-w-0 whitespace-pre"
                    dangerouslySetInnerHTML={{ __html: highlightedSnapshot }}
                  />
                </pre>
                <textarea
                  ref={codeAreaRef}
                  value={draft.code}
                  onChange={(e) => setDraft((current) => ({ ...current, code: e.target.value }))}
                  onScroll={syncCodeScroll}
                  spellCheck={false}
                  aria-label={t('代码快照内容')}
                  placeholder={draft.code ? '' : t('此记录没有代码快照，可在打卡面板中重新记录')}
                  className="custom-scrollbar relative z-10 min-h-0 w-full flex-1 resize-none overflow-auto bg-transparent p-4 font-mono text-xs leading-5 text-transparent caret-[#f8fafc] outline-none"
                  style={{ WebkitTextFillColor: 'transparent' }}
                />
              </div>
            </div>

            {/* 右侧：训练打卡（可编辑） */}
            <aside className="flex w-[300px] shrink-0 flex-col border-l border-slate-100 bg-slate-50">
              <header className="flex items-center justify-between gap-2.5 px-4 pt-4 pb-1">
                <div className="text-[15px] font-bold text-slate-800">{t('训练打卡')}</div>
                <button
                  type="button"
                  onClick={handleCloseReview}
                  aria-label={t('关闭')}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-400 transition-all hover:bg-slate-200 hover:text-slate-700"
                >
                  <X size={16} />
                </button>
              </header>

              <div className="flex-1 overflow-auto custom-scrollbar px-4 pt-1.5 pb-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  创建于 {new Date(selectedReview.created_at || selectedReview.review_date).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>

                <section className="mt-3.5 flex flex-col gap-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400">{t('掌握程度')}</span>
                  <div className="flex flex-col gap-1.5">
                    {MASTERY_OPTIONS.map((opt) => {
                      const active = opt.value === draft.status
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          onClick={() => setDraft((current) => ({ ...current, status: opt.value }))}
                          aria-pressed={active}
                          className={`rounded-md border px-2 py-2 text-center text-[11px] transition-all active:scale-[.98] ${
                            active
                              ? 'border-primary-600 bg-primary-600 font-semibold text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300'
                          }`}
                        >
                          {opt.icon} {t(opt.label)}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="mt-4 flex flex-col gap-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400">{t('完成状态')}</span>
                  <div className="flex flex-col gap-1.5">
                    {PROGRESS_STATUS_OPTIONS.map((opt) => {
                      const active = opt.value === draft.progress_status
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          onClick={() => setDraft((current) => ({ ...current, progress_status: opt.value }))}
                          aria-pressed={active}
                          className={`rounded-md border px-2 py-2 text-center text-[11px] transition-all active:scale-[.98] ${
                            active
                              ? 'border-primary-600 bg-primary-600 font-semibold text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300'
                          }`}
                        >
                          {opt.icon} {t(opt.label)}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="mt-4 flex flex-col gap-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400">{t('手感自评')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(PERSONAL_RATINGS).map(([value, rating]) => {
                      const active = Number(value) === Number(draft.personal_difficulty)
                      return (
                        <button
                          type="button"
                          key={value}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              personal_difficulty: active ? 0 : Number(value),
                            }))
                          }
                          aria-pressed={active}
                          className={`flex flex-1 basis-[calc(50%-0.375rem)] flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-center transition-all active:scale-[.98] ${
                            active
                              ? 'border-primary-600 bg-primary-50'
                              : 'border-slate-200 bg-white hover:border-primary-300'
                          }`}
                        >
                            <span className="text-[14px] leading-none">{rating.icon}</span>
                            <span className={`text-[10px] ${active ? 'font-semibold text-primary-700' : 'text-slate-400'}`}>
                              {rating.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>

                <section className="mt-4 flex flex-col gap-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-400">{t('训练记录')}</span>
                  <textarea
                    value={draft.comment}
                    onChange={(e) => setDraft((current) => ({ ...current, comment: e.target.value }))}
                    placeholder={t('记录本次遇到的坑点或突破...')}
                    aria-label={t('训练记录内容')}
                    className="min-h-[120px] w-full resize-y rounded-lg border border-slate-200 bg-white p-2.5 text-[12px] leading-6 text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-primary-400"
                  />
                </section>
              </div>

              <div className="border-t border-slate-100 px-4 pt-3.5 pb-4">
                {saveError && (
                  <p role="alert" className="mb-2 text-[11px] font-medium text-rose-600">
                    {saveError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseReview}
                    className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-[13px] font-semibold text-slate-500 transition-all hover:bg-slate-100 active:scale-95"
                  >{t('取消')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveReview}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-primary-600 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-primary-200 transition-all hover:bg-primary-700 active:scale-95 disabled:cursor-wait disabled:opacity-60"
                  >
                    {saving ? t('保存中…') : t('保存修改')}
                  </button>
                </div>
              </div>
            </aside>
          </section>
        </div>,
        document.body
      )}
    </div>
  )
}

function SimilarQuestionsSection({ activeProblem }) {
  const { t } = useI18n()
  let similarQuestions = []

  if (activeProblem.similarQuestions) {
    try {
      if (typeof activeProblem.similarQuestions === 'string') {
        similarQuestions = JSON.parse(activeProblem.similarQuestions)
      } else {
        similarQuestions = activeProblem.similarQuestions
      }
    } catch (e) {
      console.error(t('解析相似题目失败:'), e)
    }
  }

  if (!similarQuestions || similarQuestions.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <label className="mt-[25px] text-[10px] font-semibold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
        <Link2 size={12} className="text-primary-500" />{t('相似题目')}
      </label>
      <div className="space-y-1.5">
        {similarQuestions.slice(0, 5).map((q, idx) => (
          <a
            key={idx}
            href={`https://leetcode.cn/problems/${q.titleSlug}/`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-slate-100 bg-slate-50 hover:bg-primary-50 hover:border-primary-200 transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-700 group-hover:text-primary-700 truncate">
                {q.translatedTitle || q.title}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{q.title}</p>
            </div>
            <span
              className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                q.difficulty === 'Easy'
                  ? 'bg-emerald-100 text-emerald-700'
                  : q.difficulty === 'Medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
              }`}
            >
              {q.difficulty}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
