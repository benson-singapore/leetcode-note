import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'
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
  ImagePlus,
  PenLine,
  Eye,
  MonitorPlay,
  Loader2,
  Sparkles,
  Undo2,
  Square,
} from 'lucide-react'
import { FrequencyBars } from './FrequencyBars'
import { CodeEditor } from './CodeEditor'
import { SolutionDemoTab } from './SolutionDemoTab'
import { uploadImageFile, uploadImageFromUrl } from '../api/images'
import { chatStream, cancelChat } from '../api/ai'
import {
  updateUserProblem,
  createReview,
  getReviews,
  deleteProblem,
} from '../api/leetcode'

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

export function DetailDrawer({ activeProblem, updateProblem, onDeleted, onClose, loading }) {
  const [detailTab, setDetailTab] = useState('desc')
  const [newReview, setNewReview] = useState({ comment: '', status: 'Reviewing', showForm: false })
  const [reviews, setReviews] = useState([])
  const [isLoadingReviews, setIsLoadingReviews] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setDetailTab('desc')
    setConfirmingDelete(false)
    if (activeProblem?.id) {
      loadReviews()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProblem?.id])

  const loadReviews = async () => {
    if (!activeProblem?.userProblemId) {
      setReviews([])
      return
    }
    setIsLoadingReviews(true)
    try {
      const res = await getReviews(activeProblem.userProblemId)
      setReviews(res?.data || res || [])
    } catch (error) {
      console.error('加载复习记录失败:', error)
      setReviews([])
    } finally {
      setIsLoadingReviews(false)
    }
  }

  const handleAddReview = async () => {
    if (!newReview.comment.trim()) return

    try {
      let userProblemId = activeProblem.userProblemId
      if (!userProblemId) {
        // 该题还没有用户记录，先通过 upsert 创建（以题目 ID 作为键）
        const created = await updateUserProblem(activeProblem.id, {
          personalDifficulty: activeProblem.personalDifficulty,
          status: newReview.status,
          progressStatus: activeProblem.progressStatus,
          notes: activeProblem.notes || '',
          code: activeProblem.code || '',
        })
        userProblemId = created?.data?.id || created?.id
        if (userProblemId) {
          updateProblem({ ...activeProblem, userProblemId })
        }
      }

      await createReview({
        user_problem_id: userProblemId,
        status: newReview.status,
        comment: newReview.comment,
      })

      // 更新用户题目状态
      await updateUserProblem(userProblemId || activeProblem.id, {
        personalDifficulty: activeProblem.personalDifficulty,
        status: newReview.status,
        progressStatus: activeProblem.progressStatus,
        notes: activeProblem.notes || '',
        code: activeProblem.code || '',
      })

      // 重新加载复习记录
      await loadReviews()

      // 更新本地状态
      updateProblem({
        ...activeProblem,
        status: newReview.status,
      })

      setNewReview({ comment: '', status: newReview.status, showForm: false })
    } catch (error) {
      console.error('创建复习记录失败:', error)
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
      console.error('删除题目失败:', error)
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
        onClick={onClose}
      ></div>
      <div className="relative w-full max-w-[80%] h-full bg-white shadow-2xl flex flex-col">
        {loading || !activeProblem ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="animate-spin h-12 w-12 text-primary-600 mx-auto mb-4" />
              <p className="text-slate-600 text-sm">加载题目详情中...</p>
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
                      {STATUS_MAP[activeProblem.status]?.label ||
                        activeProblem.status ||
                        '未知'}
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
                <a
                  href={`https://leetcode.cn/problems/${activeProblem.titleSlug || activeProblem.title}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-[11px] font-semibold rounded-full hover:bg-primary-700 active:scale-95 transition-all shadow-lg shadow-primary-200"
                >
                  VIEW_LEETCODE <ExternalLink size={14} />
                </a>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  title={confirmingDelete ? '再点一次确认删除' : '删除此题目'}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-all active:scale-90 ${
                    confirmingDelete
                      ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                      : 'border-slate-100 bg-white text-slate-300 hover:border-rose-100 hover:bg-rose-50 hover:text-rose-500'
                  }`}
                >
                  {confirmingDelete ? (deleting ? '删除中…' : '确认删除？') : <Trash2 size={16} />}
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
                    { id: 'solutionDemo', label: '解题演示', icon: <MonitorPlay size={15} /> },
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
                  {detailTab === 'solutionDemo' && (
                    <div className="flex-1 overflow-hidden p-6 custom-scrollbar scroll-smooth min-w-0">
                      <SolutionDemoTab
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
                  newReview={newReview}
                  setNewReview={setNewReview}
                  handleAddReview={handleAddReview}
                  reviews={reviews}
                  isLoadingReviews={isLoadingReviews}
                />
                <div className="h-px bg-slate-50"></div>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

function DescriptionTab({ activeProblem }) {
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
            {OFFICIAL_DIFFICULTIES[activeProblem.difficulty]?.label ||
              activeProblem.difficulty ||
              '—'}
          </span>
        </div>
      </div>

      <div className="text-[12px] text-slate-600 leading-[1.5] font-medium antialiased space-y-2 border-l-4 border-primary-500/20 pl-4 prose prose-sm max-w-none">
        {activeProblem.translatedContent ? (
          <div dangerouslySetInnerHTML={{ __html: activeProblem.translatedContent }} />
        ) : activeProblem.content ? (
          <div dangerouslySetInnerHTML={{ __html: activeProblem.content }} />
        ) : (
          <p>暂无题目描述</p>
        )}
      </div>

      <div className="space-y-3">
        {(activeProblem.examples || []).map((ex, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-800 tracking-tight">示例 {i + 1}:</p>
            <div className="bg-slate-100/60 border border-slate-100 rounded-lg p-3 font-mono text-[11px] space-y-1 text-slate-700 shadow-inner">
              <p>
                <span className="font-bold text-slate-400">输入:</span> {ex.input}
              </p>
              <p>
                <span className="font-bold text-slate-400">输出:</span> {ex.output}
              </p>
              {ex.explanation && (
                <p>
                  <span className="font-bold text-slate-400">解释:</span> {ex.explanation}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {(constraints || []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-800 tracking-tight">提示：</p>
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
  }, [activeProblem.id])

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
      alert(err.message || '图片上传失败')
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
      alert(err.message || 'URL 图片上传失败')
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
      console.error('保存笔记失败:', error)
      setSaveStatus('保存失败')
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
      setAiError('暂无题目内容，无法进行 AI 优化')
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
        if (!errText) setAiError('AI 未返回内容')
      }
    } catch (e) {
      console.error('AI 优化失败:', e)
      setAiError(e.message || 'AI 优化失败')
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
            aria-label="笔记编辑或预览"
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
              <PenLine size={12} />
              编辑
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={notesMode === 'preview'}
              onClick={() => (notes || '').trim() && setNotesMode('preview')}
              disabled={!(notes || '').trim()}
              title={!(notes || '').trim() ? '有内容后可预览 Markdown' : '预览 Markdown'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                notesMode === 'preview'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Eye size={12} />
              预览
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
              title="插入图片（图床）"
            >
              <ImagePlus size={12} />
              插入图片
            </button>
          )}
          {/* AI 优化 / 停止 */}
          {aiState === 'streaming' ? (
            <button
              type="button"
              onClick={handleStopAI}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-300 shrink-0"
              title="停止生成"
            >
              <Square size={10} fill="currentColor" />
              停止
            </button>
          ) : (
            <button
              type="button"
              disabled={imageUploading}
              onClick={handleAIOptimize}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-primary-600 text-white text-[10px] font-bold hover:from-violet-700 hover:to-primary-700 transition-all disabled:opacity-50 shrink-0 shadow-sm"
              title="让 AI 根据题目内容、代码实现和当前笔记优化核心笔记"
            >
              <Sparkles size={12} />
              AI 优化
            </button>
          )}
          {/* 撤销：AI 生成后可回滚，保存落库后消失 */}
          {aiSnapshot !== null && (
            <button
              type="button"
              disabled={aiState === 'streaming'}
              onClick={handleUndoAI}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-600 hover:bg-amber-100 disabled:opacity-50 shrink-0"
              title="撤销 AI 生成的结果，恢复到优化前的笔记"
            >
              <Undo2 size={12} />
              撤销
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
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      {notesMode === 'edit' ? (
        <textarea
          className="flex-1 w-full min-h-[12rem] p-6 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-4 ring-primary-50 outline-none transition-all shadow-xl leading-relaxed font-medium custom-scrollbar resize-none"
          placeholder="在此记录你的解题心法…（支持 Markdown：标题、列表、代码块、图片等）"
          value={notes}
          onChange={handleNotesChange}
        />
      ) : (
        <div className="flex-1 w-full min-h-[12rem] p-6 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-y-auto custom-scrollbar text-sm relative">
          <div className="notes-md-preview">
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {aiState === 'streaming' ? aiStreamText || ' ' : notes}
            </ReactMarkdown>
          </div>
          {aiState === 'streaming' && (
            <span className="sticky bottom-0 right-0 flex justify-end px-1 py-1 text-[10px] font-bold text-violet-600 items-center gap-1 bg-gradient-to-t from-white via-white/80 to-transparent">
              <Loader2 size={11} className="animate-spin" />
              AI 生成中…
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
              >
                插入图片
              </h3>
              <button
                type="button"
                disabled={imageUploading}
                onClick={() => setImageModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="关闭"
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
                <ImagePlus size={14} />
                本地上传
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
                <Link2 size={14} />
                图片 URL
              </button>
            </div>

            {imageSourceTab === 'file' ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  从本机选择图片，上传到图床后将自动在笔记中插入 Markdown 图片。
                </p>
                <button
                  type="button"
                  disabled={imageUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-[11px] font-bold text-slate-600 hover:border-primary-300 hover:bg-primary-50/50 transition-all disabled:opacity-50"
                >
                  {imageUploading ? '上传中…' : '选择本地图片'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  粘贴可直链访问的图片地址，服务端转存图床后插入笔记。
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
                  {imageUploading ? '处理中…' : '上传并插入'}
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
      console.error('更新个人手感失败:', e)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
        <BrainCircuit size={12} /> 个人手感难度自评
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
            <span className="text-[10px] font-semibold uppercase mt-0.5">{config.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ProgressStatusSection({ activeProblem, updateProblem }) {
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
      console.error('更新完成状态失败:', e)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">
        完成状态
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
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TagsSection({ activeProblem }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">
        知识标签映射
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
  newReview,
  setNewReview,
  handleAddReview,
  reviews,
  isLoadingReviews,
}) {
  const reviewStatusOptions = ['Confused', 'New', 'Struggling', 'Relearning', 'Stable', 'Mastered']

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest flex items-center gap-2">
          <History size={16} className="text-primary-500" /> 复习训练打卡
        </label>
        <button
          onClick={() => setNewReview({ ...newReview, showForm: !newReview.showForm })}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-md active:scale-95 ${
            newReview.showForm
              ? 'bg-slate-200 text-slate-600'
              : 'bg-primary-600 text-white shadow-primary-50'
          }`}
        >
          {newReview.showForm ? <X size={16} /> : <Plus size={18} />}
        </button>
      </div>

      {newReview.showForm && (
        <div className="bg-primary-50/50 p-5 rounded-2xl border-2 border-primary-100 space-y-4 animate-in zoom-in-95 duration-200">
          <label className="text-[10px] font-semibold text-primary-700 uppercase block tracking-tight">
            本次训练后的掌握度
          </label>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-white rounded-xl">
            {reviewStatusOptions.map((k) => {
              const v = STATUS_MAP[k]
              if (!v) return null
              return (
                <button
                  key={k}
                  onClick={() => {
                    setNewReview({
                      ...newReview,
                      status: k,
                      comment: v.comment,
                    })
                  }}
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                    newReview.status === k
                      ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                      : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'
                  }`}
                >
                  {v.label}
                </button>
              )
            })}
          </div>
          <textarea
            className="w-full h-24 p-3 bg-white border border-primary-100 rounded-xl text-xs focus:ring-2 ring-primary-100 outline-none placeholder:italic"
            placeholder="记录本次遇到的坑点或突破..."
            value={newReview.comment}
            onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
          />
          <button
            onClick={handleAddReview}
            className="w-full bg-primary-600 text-white py-2.5 rounded-xl text-[10px] font-semibold uppercase hover:bg-primary-700 transition-all shadow-lg tracking-widest"
          >
            RECORD_JOURNEY
          </button>
        </div>
      )}

      <div className="space-y-5 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-100">
        {isLoadingReviews ? (
          <div className="text-center py-4 text-slate-400 text-[12px]">加载中...</div>
        ) : reviews && reviews.length > 0 ? (
          reviews.map((rev, idx) => (
            <div key={rev.id || idx} className="relative pl-8 group">
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
                    {STATUS_MAP[rev.status]?.label || rev.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium italic opacity-80">
                  "{rev.comment}"
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-slate-400 text-[12px]">暂无复习记录</div>
        )}
      </div>
    </div>
  )
}

function SimilarQuestionsSection({ activeProblem }) {
  let similarQuestions = []

  if (activeProblem.similarQuestions) {
    try {
      if (typeof activeProblem.similarQuestions === 'string') {
        similarQuestions = JSON.parse(activeProblem.similarQuestions)
      } else {
        similarQuestions = activeProblem.similarQuestions
      }
    } catch (e) {
      console.error('解析相似题目失败:', e)
    }
  }

  if (!similarQuestions || similarQuestions.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <label className="mt-[25px] text-[10px] font-semibold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
        <Link2 size={12} className="text-primary-500" /> 相似题目
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
