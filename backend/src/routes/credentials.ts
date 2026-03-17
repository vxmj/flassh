import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { credentialStore, SavedConnectionInfo } from '../services/credential-store.js'
import type { ApiError } from '../types/index.js'

const router = Router()

// ========== 连接列表 API ==========

/**
 * 获取所有保存的连接
 * GET /api/credentials/connections
 */
router.get('/connections', (_req: Request, res: Response) => {
  const connections = credentialStore.getConnections()
  res.json({ connections })
})

/**
 * 保存新连接
 * POST /api/credentials/connections
 */
router.post('/connections', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, name, host, port, username, authType, hasStoredCredentials } = req.body

    if (!id || !name || !host || !port || !username || !authType) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少必填字段',
      }
      return res.status(400).json(error)
    }

    const connection: SavedConnectionInfo = {
      id,
      name,
      host,
      port,
      username,
      authType,
      hasStoredCredentials: hasStoredCredentials || false,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    credentialStore.saveConnection(connection)
    res.status(201).json({ success: true, connection })
  } catch (err) {
    next(err)
  }
})

/**
 * 更新连接信息
 * PUT /api/credentials/connections/:id
 */
router.put('/connections/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const updates = req.body

  const success = credentialStore.updateConnection(id, {
    ...updates,
    lastUsedAt: new Date().toISOString(),
  })

  if (!success) {
    const error: ApiError = {
      code: 'CONNECTION_NOT_FOUND',
      message: '连接不存在',
    }
    return res.status(404).json(error)
  }

  res.json({ success: true })
})

/**
 * 删除连接
 * DELETE /api/credentials/connections/:id
 */
router.delete('/connections/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const success = credentialStore.deleteConnection(id)

  if (!success) {
    const error: ApiError = {
      code: 'CONNECTION_NOT_FOUND',
      message: '连接不存在',
    }
    return res.status(404).json(error)
  }

  res.status(204).send()
})

/**
 * 重新排序连接
 * POST /api/credentials/connections/reorder
 */
router.post('/connections/reorder', (req: Request, res: Response) => {
  const { ids } = req.body

  if (!Array.isArray(ids)) {
    const error: ApiError = {
      code: 'INVALID_REQUEST',
      message: '无效的排序数据',
    }
    return res.status(400).json(error)
  }

  credentialStore.reorderConnections(ids)
  res.json({ success: true })
})

// ========== 凭据 API ==========

/**
 * 保存凭据
 * POST /api/credentials
 */
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, host, port, username, authType, password, privateKey, passphrase } = req.body

    if (!id || !host || !port || !username || !authType) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少必填字段',
      }
      return res.status(400).json(error)
    }

    credentialStore.save(id, {
      host,
      port,
      username,
      authType,
      password,
      privateKey,
      passphrase,
    })

    res.status(201).json({ success: true, id })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取凭据（用于快速连接）
 * GET /api/credentials/:id
 */
router.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const credential = credentialStore.get(id)

  if (!credential) {
    const error: ApiError = {
      code: 'CREDENTIAL_NOT_FOUND',
      message: '凭据不存在',
    }
    return res.status(404).json(error)
  }

  res.json(credential)
})

/**
 * 检查凭据是否存在
 * GET /api/credentials/:id/exists
 */
router.get('/:id/exists', (req: Request, res: Response) => {
  const id = req.params.id as string
  const exists = credentialStore.has(id)
  res.json({ exists })
})

/**
 * 删除凭据
 * DELETE /api/credentials/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const success = credentialStore.delete(id)

  if (!success) {
    const error: ApiError = {
      code: 'CREDENTIAL_NOT_FOUND',
      message: '凭据不存在',
    }
    return res.status(404).json(error)
  }

  res.status(204).send()
})

/**
 * 列出所有已保存的凭据（不含敏感信息）
 * GET /api/credentials
 */
router.get('/', (_req: Request, res: Response) => {
  const list = credentialStore.list()
  res.json({ credentials: list })
})

// ========== 导入导出 API ==========

/**
 * 导出所有连接（含凭据），用用户提供的密码 AES-256-GCM 加密
 * POST /api/credentials/export
 */
router.post('/export', (req: Request, res: Response) => {
  const { password } = req.body
  if (!password || typeof password !== 'string' || password.length < 1) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: '请提供加密密码' })
  }

  const connections = credentialStore.getConnections()
  const exportData: Array<{
    connection: SavedConnectionInfo
    credentials?: { host: string; port: number; username: string; authType: string; password?: string; privateKey?: string; passphrase?: string }
  }> = []

  for (const conn of connections) {
    const item: typeof exportData[0] = { connection: conn }
    if (conn.hasStoredCredentials) {
      const cred = credentialStore.get(conn.id)
      if (cred) {
        item.credentials = cred
      }
    }
    exportData.push(item)
  }

  // 用用户密码派生密钥
  const salt = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const plaintext = JSON.stringify(exportData)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')

  res.json({
    version: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag,
    data: encrypted,
  })
})

/**
 * 导入连接（含凭据），用用户提供的密码解密
 * POST /api/credentials/import
 */
router.post('/import', (req: Request, res: Response) => {
  const { password, file } = req.body
  if (!password || !file) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: '请提供密码和文件内容' })
  }

  const { version, salt, iv, tag, data } = file
  if (version !== 1 || !salt || !iv || !tag || !data) {
    return res.status(400).json({ code: 'INVALID_FILE', message: '无效的导入文件' })
  }

  // 解密
  let plaintext: string
  try {
    const key = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
    decipher.setAuthTag(Buffer.from(tag, 'hex'))
    plaintext = decipher.update(data, 'hex', 'utf8')
    plaintext += decipher.final('utf8')
  } catch {
    return res.status(400).json({ code: 'DECRYPT_FAILED', message: '密码错误或文件损坏' })
  }

  let importData: Array<{
    connection: SavedConnectionInfo
    credentials?: { host: string; port: number; username: string; authType: string; password?: string; privateKey?: string; passphrase?: string }
  }>
  try {
    importData = JSON.parse(plaintext)
  } catch {
    return res.status(400).json({ code: 'INVALID_DATA', message: '文件内容格式错误' })
  }

  // 检查重复
  const existing = credentialStore.getConnections()
  const duplicates: Array<{ imported: SavedConnectionInfo; existingId: string; existingName: string }> = []
  const newItems: typeof importData = []

  for (const item of importData) {
    const dup = existing.find(e => e.host === item.connection.host && e.port === item.connection.port && e.username === item.connection.username)
    if (dup) {
      duplicates.push({ imported: item.connection, existingId: dup.id, existingName: dup.name })
    } else {
      newItems.push(item)
    }
  }

  // 返回解密后的数据和重复信息，让前端决定如何处理
  res.json({
    newItems: newItems.map(i => ({ connection: i.connection, hasCredentials: !!i.credentials })),
    duplicates,
    // 把完整数据暂存在响应里，前端确认后再调用 confirm 接口
    _importData: importData,
  })
})

/**
 * 确认导入（处理完重复后）
 * POST /api/credentials/import/confirm
 */
router.post('/import/confirm', (req: Request, res: Response) => {
  const { items, overrideIds } = req.body as {
    items: Array<{
      connection: SavedConnectionInfo
      credentials?: { host: string; port: number; username: string; authType: string; password?: string; privateKey?: string; passphrase?: string }
    }>
    overrideIds: string[] // 要覆盖的现有连接 ID
  }

  if (!Array.isArray(items)) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: '无效的导入数据' })
  }

  // 删除要覆盖的连接
  for (const id of (overrideIds || [])) {
    credentialStore.deleteConnection(id)
    credentialStore.delete(id)
  }

  let imported = 0
  for (const item of items) {
    const conn = item.connection
    // 生成新 ID 避免冲突
    const newId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const newConn: SavedConnectionInfo = {
      ...conn,
      id: newId,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }
    credentialStore.saveConnection(newConn)

    if (item.credentials) {
      credentialStore.save(newId, {
        host: item.credentials.host,
        port: item.credentials.port,
        username: item.credentials.username,
        authType: item.credentials.authType as 'password' | 'key',
        password: item.credentials.password,
        privateKey: item.credentials.privateKey,
        passphrase: item.credentials.passphrase,
      })
      // 更新 hasStoredCredentials
      credentialStore.updateConnection(newId, { hasStoredCredentials: true })
    }
    imported++
  }

  res.json({ success: true, imported })
})

export default router
