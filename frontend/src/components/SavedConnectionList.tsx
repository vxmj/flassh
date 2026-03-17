import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useConnectionsStore } from '../store'
import { Dialog } from './Dialog'
import type { SavedConnection, ConnectionConfig } from '../types'

interface SavedConnectionListProps {
  onSelect: (connection: SavedConnection) => void
  onQuickConnect?: (config: ConnectionConfig) => Promise<void>
}

/**
 * 内联编辑表单组件
 */
function InlineEditForm({
  connection,
  onSave,
  onCancel,
}: {
  connection: SavedConnection
  onSave: (updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(connection.name)
  const [host, setHost] = useState(connection.host)
  const [port, setPort] = useState(connection.port)
  const [username, setUsername] = useState(connection.username)
  const [authType, setAuthType] = useState<'password' | 'key'>(connection.authType)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !host.trim() || !username.trim()) return
    onSave({ name: name.trim(), host: host.trim(), port, username: username.trim(), authType })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <form onSubmit={handleSubmit} className="pt-3 mt-3 border-t border-border space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-text-secondary">连接名称</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="我的服务器" className="input text-sm" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-text-secondary">主机地址</label>
          <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com" className="input text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1 text-text-secondary">端口</label>
            <input type="number" value={port} onChange={(e) => setPort(parseInt(e.target.value) || 22)} min={1} max={65535} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-text-secondary">用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" className="input text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-text-secondary">认证方式</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="radio" checked={authType === 'password'} onChange={() => setAuthType('password')} className="w-3.5 h-3.5 text-primary" />
              <span>密码</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="radio" checked={authType === 'key'} onChange={() => setAuthType('key')} className="w-3.5 h-3.5 text-primary" />
              <span>SSH 密钥</span>
            </label>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors text-sm">取消</button>
          <button type="submit" className="flex-1 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm">保存</button>
        </div>
      </form>
    </motion.div>
  )
}

/**
 * 快速连接弹窗组件
 */
function QuickConnectDialog({
  connection,
  onConnect,
  onCancel,
  isLoading,
}: {
  connection: SavedConnection
  onConnect: (config: ConnectionConfig) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}) {
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [saveCredentials, setSaveCredentials] = useState(false)
  const { getStoredCredentials, updateConnection } = useConnectionsStore()
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(true)
  const hasTriedAutoConnectRef = useRef(false)

  useEffect(() => {
    const tryAutoConnect = async () => {
      if (hasTriedAutoConnectRef.current) return
      hasTriedAutoConnectRef.current = true
      
      if (connection.hasStoredCredentials) {
        setIsLoadingCredentials(true)
        try {
          const creds = await getStoredCredentials(connection.id)
          if (creds && (creds.password || creds.privateKey)) {
            try {
              await onConnect(creds as ConnectionConfig)
              return
            } catch (connectErr) {
              setError(connectErr instanceof Error ? connectErr.message : '连接失败，请重新输入凭据')
              setIsLoadingCredentials(false)
              return
            }
          } else {
            setError('已保存的凭据无效，请重新输入')
          }
        } catch {
          setError('加载凭据失败，请重新输入')
        }
      }
      setIsLoadingCredentials(false)
    }
    tryAutoConnect()
  }, [connection.id, connection.hasStoredCredentials, getStoredCredentials, onConnect])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (connection.authType === 'password' && !password) { setError('请输入密码'); return }
    if (connection.authType === 'key' && !privateKey) { setError('请选择或粘贴私钥'); return }

    const config: ConnectionConfig = {
      host: connection.host, port: connection.port, username: connection.username, authType: connection.authType,
      ...(connection.authType === 'password' ? { password } : { privateKey, passphrase: passphrase || undefined }),
    }

    if (saveCredentials) {
      try {
        await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: connection.id, ...config }) })
        updateConnection(connection.id, { hasStoredCredentials: true })
      } catch { /* ignore save errors */ }
    }

    try { await onConnect(config) } catch (err) { setError(err instanceof Error ? err.message : '连接失败') }
  }

  const handleKeyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => setPrivateKey(event.target?.result as string)
      reader.readAsText(file)
    }
  }

  if (isLoadingCredentials) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-surface rounded-xl shadow-2xl border border-border p-4 md:p-6 w-full max-w-md text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text">正在连接 {connection.name}...</p>
          <button onClick={onCancel} className="mt-4 px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors">取消</button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-surface rounded-xl shadow-2xl border border-border p-4 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">快速连接</h3>
        <div className="mb-4 p-3 bg-background rounded-lg">
          <div className="text-sm font-medium">{connection.name}</div>
          <div className="text-xs text-secondary">{connection.username}@{connection.host}:{connection.port}</div>
        </div>
        <form onSubmit={handleSubmit}>
          {connection.authType === 'password' ? (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5 text-text-secondary">密码</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码" className="input" disabled={isLoading} autoFocus />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5 text-text-secondary">私钥</label>
                <div className="space-y-2">
                  <input type="file" onChange={handleKeyFileChange} className="w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:cursor-pointer file:transition-all file:hover:bg-primary-hover" disabled={isLoading} />
                  <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="或粘贴私钥内容..." rows={3} className="input font-mono text-xs resize-none" disabled={isLoading} />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5 text-text-secondary">私钥密码（可选）</label>
                <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="如果私钥有密码保护，请输入" className="input" disabled={isLoading} />
              </div>
            </>
          )}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={saveCredentials} onChange={(e) => setSaveCredentials(e.target.checked)} className="w-4 h-4 text-primary accent-primary rounded" disabled={isLoading} />
              <span className="text-sm text-text-secondary group-hover:text-text transition-colors">记住凭据（加密存储在服务器）</span>
            </label>
            <p className="mt-1 text-xs text-text-muted ml-6">🔒 凭据将使用 AES-256 加密存储，下次可一键连接</p>
          </div>
          {error && <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">{error}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} disabled={isLoading} className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors">取消</button>
            <button type="submit" disabled={isLoading} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors flex items-center justify-center gap-2">
              {isLoading ? (<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />连接中...</>) : '连接'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/**
 * 已保存连接列表组件
 */
export function SavedConnectionList({ onSelect, onQuickConnect }: SavedConnectionListProps) {
  const { savedConnections, deleteConnection, updateConnection, loadConnections, reorderConnections, isLoading: isLoadingConnections } = useConnectionsStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [quickConnectConnection, setQuickConnectConnection] = useState<SavedConnection | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  // 导入导出
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [importPassword, setImportPassword] = useState('')
  const [importFile, setImportFile] = useState<any>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importError, setImportError] = useState('')
  const [exportError, setExportError] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [duplicates, setDuplicates] = useState<Array<{ imported: SavedConnection; existingId: string; existingName: string }>>([])
  const [importData, setImportData] = useState<any[]>([])
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, 'skip' | 'override'>>({})
  const importFileRef = useRef<HTMLInputElement>(null)

  // 导出连接
  const handleExport = useCallback(async () => {
    if (!exportPassword.trim()) { setExportError('请输入加密密码'); return }
    setIsExporting(true)
    setExportError('')
    try {
      const res = await fetch('/api/credentials/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: exportPassword }),
      })
      if (!res.ok) throw new Error('导出失败')
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `flassh-connections-${new Date().toISOString().slice(0, 10)}.flassh`
      a.click()
      URL.revokeObjectURL(url)
      setShowExportDialog(false)
      setExportPassword('')
    } catch { setExportError('导出失败') }
    finally { setIsExporting(false) }
  }, [exportPassword])

  // 选择导入文件
  const handleImportFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        setImportFile(parsed)
        setImportError('')
      } catch { setImportError('文件格式无效') }
    }
    reader.readAsText(file)
  }, [])

  // 导入第一步：解密并检查重复
  const handleImportDecrypt = useCallback(async () => {
    if (!importFile) { setImportError('请选择文件'); return }
    if (!importPassword.trim()) { setImportError('请输入解密密码'); return }
    setIsImporting(true)
    setImportError('')
    try {
      const res = await fetch('/api/credentials/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: importPassword, file: importFile }),
      })
      const data = await res.json()
      if (!res.ok) { setImportError(data.message || '导入失败'); return }

      setImportData(data._importData)
      if (data.duplicates.length > 0) {
        setDuplicates(data.duplicates)
        const choices: Record<string, 'skip' | 'override'> = {}
        data.duplicates.forEach((d: any) => { choices[d.imported.id] = 'skip' })
        setDuplicateChoices(choices)
        setShowImportDialog(false)
        setShowDuplicateDialog(true)
      } else {
        // 没有重复，直接导入
        await confirmImport(data._importData, {})
      }
    } catch { setImportError('导入失败') }
    finally { setIsImporting(false) }
  }, [importFile, importPassword])

  // 确认导入
  const confirmImport = useCallback(async (allData: any[], choices: Record<string, 'skip' | 'override'>) => {
    const overrideIds: string[] = []
    const items: any[] = []

    for (const item of allData) {
      const dup = duplicates.find(d => d.imported.host === item.connection.host && d.imported.port === item.connection.port && d.imported.username === item.connection.username)
      if (dup) {
        const choice = choices[dup.imported.id]
        if (choice === 'skip') continue
        if (choice === 'override') overrideIds.push(dup.existingId)
      }
      items.push(item)
    }

    try {
      const res = await fetch('/api/credentials/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, overrideIds }),
      })
      if (res.ok) {
        setShowDuplicateDialog(false)
        setShowImportDialog(false)
        setImportPassword('')
        setImportFile(null)
        setImportFileName('')
        setDuplicates([])
        setImportData([])
        // 重新加载连接列表
        useConnectionsStore.setState({ isLoaded: false })
        loadConnections()
      }
    } catch { /* ignore */ }
  }, [duplicates, loadConnections])

  useEffect(() => { loadConnections() }, [loadConnections])

  const handleSaveEdit = (id: string, updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>) => {
    updateConnection(id, updates)
    setEditingId(null)
  }

  const handleDelete = (id: string) => { deleteConnection(id); setDeleteConfirmId(null) }

  const handleQuickConnect = async (config: ConnectionConfig) => {
    if (!onQuickConnect) return
    setIsConnecting(true)
    try { await onQuickConnect(config); setQuickConnectConnection(null) } finally { setIsConnecting(false) }
  }

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent | any, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      reorderConnections(draggedIndex, toIndex)
    }
    setDraggedIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  if (isLoadingConnections) {
    return (
      <div className="text-center py-8 text-secondary">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">加载连接列表...</p>
      </div>
    )
  }

  if (savedConnections.length === 0) {
    return (
      <div className="text-center py-8 text-secondary">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
        <p className="text-sm mb-3">暂无保存的连接</p>
        <button
          onClick={() => { setShowImportDialog(true); setImportError(''); setImportFile(null); setImportFileName(''); setImportPassword('') }}
          className="text-xs text-primary hover:text-primary-hover transition-colors"
        >导入连接</button>

        {/* 导入弹窗 */}
        <Dialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} title="导入连接">
          <div className="space-y-3">
            <div>
              <input ref={importFileRef} type="file" accept=".flassh" onChange={handleImportFileChange} className="hidden" />
              <button
                onClick={() => importFileRef.current?.click()}
                className="w-full px-3 py-2 rounded-lg border border-dashed border-primary/40 text-primary text-sm hover:bg-primary/10 transition-colors"
              >
                {importFileName || '选择 .flassh 文件'}
              </button>
            </div>
            <input
              type="password"
              value={importPassword}
              onChange={e => { setImportPassword(e.target.value); setImportError('') }}
              onKeyDown={e => e.key === 'Enter' && handleImportDecrypt()}
              placeholder="输入解密密码"
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-sm outline-none focus:border-primary"
            />
            {importError && <p className="text-xs text-error">{importError}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowImportDialog(false)} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg transition-colors">取消</button>
            <button onClick={handleImportDecrypt} disabled={isImporting || !importFile} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors">
              {isImporting ? '解密中...' : '导入'}
            </button>
          </div>
        </Dialog>

        {/* 重复连接处理弹窗 */}
        <Dialog isOpen={showDuplicateDialog} onClose={() => setShowDuplicateDialog(false)} title="发现重复连接">
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {duplicates.map(d => (
              <div key={d.imported.id} className="p-2 rounded-lg bg-surface border border-border text-left">
                <div className="text-sm text-text mb-1">{d.imported.name} <span className="text-text-secondary">({d.imported.username}@{d.imported.host})</span></div>
                <div className="text-xs text-text-muted mb-2">已存在: {d.existingName}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDuplicateChoices(prev => ({ ...prev, [d.imported.id]: 'skip' }))}
                    className={`flex-1 py-1 text-xs rounded ${duplicateChoices[d.imported.id] === 'skip' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface border border-border text-text-secondary'}`}
                  >跳过</button>
                  <button
                    onClick={() => setDuplicateChoices(prev => ({ ...prev, [d.imported.id]: 'override' }))}
                    className={`flex-1 py-1 text-xs rounded ${duplicateChoices[d.imported.id] === 'override' ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-surface border border-border text-text-secondary'}`}
                  >覆盖</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowDuplicateDialog(false)} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg transition-colors">取消</button>
            <button onClick={() => confirmImport(importData, duplicateChoices)} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors">确认导入</button>
          </div>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0 h-full" onDragEnd={handleDragEnd}>
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h3 className="text-sm font-medium text-secondary">已保存的连接（可拖动排序）</h3>
        <div className="flex gap-1">
          <button onClick={() => { setShowImportDialog(true); setImportError(''); setImportFile(null); setImportFileName(''); setImportPassword('') }} className="p-1 text-text-secondary hover:text-primary rounded transition-colors" title="导入">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </button>
          <button onClick={() => { setShowExportDialog(true); setExportError(''); setExportPassword('') }} className="p-1 text-text-secondary hover:text-primary rounded transition-colors" title="导出">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
      <AnimatePresence>
        {savedConnections.map((connection, index) => (
          <motion.div
            key={connection.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            layout
            className={`p-3 bg-surface rounded-lg border border-border hover:border-primary transition-colors group cursor-move ${draggedIndex === index ? 'opacity-50' : ''}`}
            draggable={editingId !== connection.id && deleteConfirmId !== connection.id}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
          >
            {deleteConfirmId === connection.id ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-error">确定删除？</span>
                <div className="flex gap-2">
                  <button onClick={() => handleDelete(connection.id)} className="px-3 py-1 bg-error text-white rounded text-sm hover:bg-opacity-90">删除</button>
                  <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1 bg-secondary bg-opacity-20 rounded text-sm hover:bg-opacity-30">取消</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <button onClick={() => onSelect(connection)} className="flex-1 text-left">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {connection.name}
                      {connection.hasStoredCredentials && <span className="text-xs text-success" title="已保存凭据，可一键连接">🔑</span>}
                    </div>
                    <div className="text-xs text-secondary">{connection.username}@{connection.host}:{connection.port}</div>
                  </button>
                  <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {onQuickConnect && (
                      <button onClick={() => setQuickConnectConnection(connection)} className="p-1.5 text-secondary hover:text-success hover:bg-success hover:bg-opacity-10 rounded" title="快速连接">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </button>
                    )}
                    <button onClick={() => setEditingId(editingId === connection.id ? null : connection.id)} className={`p-1.5 rounded ${editingId === connection.id ? 'text-primary bg-primary/10' : 'text-secondary hover:text-primary hover:bg-primary hover:bg-opacity-10'}`} title="编辑">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeleteConfirmId(connection.id)} className="p-1.5 text-secondary hover:text-error hover:bg-error hover:bg-opacity-10 rounded" title="删除">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
                {/* 内联编辑表单 */}
                <AnimatePresence>
                  {editingId === connection.id && (
                    <InlineEditForm
                      connection={connection}
                      onSave={(updates) => handleSaveEdit(connection.id, updates)}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      </div>

      {/* 快速连接弹窗 */}
      <AnimatePresence>
        {quickConnectConnection && (
          <QuickConnectDialog connection={quickConnectConnection} onConnect={handleQuickConnect} onCancel={() => setQuickConnectConnection(null)} isLoading={isConnecting} />
        )}
      </AnimatePresence>

      {/* 导出弹窗 */}
      <Dialog isOpen={showExportDialog} onClose={() => setShowExportDialog(false)} title="导出连接">
        <p className="text-sm text-text-secondary mb-3">所有连接及凭据将使用密码加密导出</p>
        <input
          type="password"
          value={exportPassword}
          onChange={e => { setExportPassword(e.target.value); setExportError('') }}
          onKeyDown={e => e.key === 'Enter' && handleExport()}
          placeholder="设置加密密码"
          className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-sm outline-none focus:border-primary mb-2"
          autoFocus
        />
        {exportError && <p className="text-xs text-error mb-2">{exportError}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={() => setShowExportDialog(false)} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg transition-colors">取消</button>
          <button onClick={handleExport} disabled={isExporting} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors">
            {isExporting ? '导出中...' : '导出'}
          </button>
        </div>
      </Dialog>

      {/* 导入弹窗 */}
      <Dialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} title="导入连接">
        <div className="space-y-3">
          <div>
            <input ref={importFileRef} type="file" accept=".flassh" onChange={handleImportFileChange} className="hidden" />
            <button
              onClick={() => importFileRef.current?.click()}
              className="w-full px-3 py-2 rounded-lg border border-dashed border-primary/40 text-primary text-sm hover:bg-primary/10 transition-colors"
            >
              {importFileName || '选择 .flassh 文件'}
            </button>
          </div>
          <input
            type="password"
            value={importPassword}
            onChange={e => { setImportPassword(e.target.value); setImportError('') }}
            onKeyDown={e => e.key === 'Enter' && handleImportDecrypt()}
            placeholder="输入解密密码"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-sm outline-none focus:border-primary"
          />
          {importError && <p className="text-xs text-error">{importError}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowImportDialog(false)} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg transition-colors">取消</button>
          <button onClick={handleImportDecrypt} disabled={isImporting || !importFile} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors">
            {isImporting ? '解密中...' : '导入'}
          </button>
        </div>
      </Dialog>

      {/* 重复连接处理弹窗 */}
      <Dialog isOpen={showDuplicateDialog} onClose={() => setShowDuplicateDialog(false)} title="发现重复连接">
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {duplicates.map(d => (
            <div key={d.imported.id} className="p-2 rounded-lg bg-surface border border-border">
              <div className="text-sm text-text mb-1">{d.imported.name} <span className="text-text-secondary">({d.imported.username}@{d.imported.host})</span></div>
              <div className="text-xs text-text-muted mb-2">已存在: {d.existingName}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDuplicateChoices(prev => ({ ...prev, [d.imported.id]: 'skip' }))}
                  className={`flex-1 py-1 text-xs rounded ${duplicateChoices[d.imported.id] === 'skip' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface border border-border text-text-secondary'}`}
                >跳过</button>
                <button
                  onClick={() => setDuplicateChoices(prev => ({ ...prev, [d.imported.id]: 'override' }))}
                  className={`flex-1 py-1 text-xs rounded ${duplicateChoices[d.imported.id] === 'override' ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-surface border border-border text-text-secondary'}`}
                >覆盖</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowDuplicateDialog(false)} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text rounded-lg transition-colors">取消</button>
          <button onClick={() => confirmImport(importData, duplicateChoices)} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors">确认导入</button>
        </div>
      </Dialog>
    </div>
  )
}
