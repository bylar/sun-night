/**
 * 后台配置文件加载器（类似 OpenClaw 的 config.toml）。
 *
 * 读取顺序：
 *   1. 环境变量 SUN_NIGHT_CONFIG 指定的路径
 *   2. 项目根目录下的 config.toml
 * 缺失时回退到内置默认值（默认 token 方式，注册开启）。
 *
 * 配置结构（后台登录三选一）：
 *   [admin]
 *   enabled = true
 *   # 后台登录方式，三选一：
 *   #   "password" —— 账号密码（account 列表，唯一）
 *   #   "token"    —— 固定 token（默认方式，凭 token 直接登录）
 *   #   "url"      —— 自定义 URL（访问该 URL 即免密进入后台）
 *   auth_method = "token"
 *   [[admin.accounts]]            # 仅 auth_method="password" 时使用
 *   username = "admin"
 *   password = "admin123"         # 明文或 "scrypt:" 哈希
 *   token = "change-me-token"     # 仅 auth_method="token" 时使用
 *   url_key = "secret-key"        # 仅 auth_method="url" 时使用，自定义链接形如 /admin?key=secret-key
 *   [registration]
 *   enabled = true                # 盟主自助注册开关
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'smol-toml'

export type AdminAuthMethod = 'password' | 'token' | 'url'

export interface AdminAccount {
  username: string
  password: string
}

export interface AdminConfig {
  enabled: boolean
  authMethod: AdminAuthMethod
  accounts: AdminAccount[]
  token: string
  urlKey: string
  /** 后台管理页面的访问路径（不含前导斜杠），默认 "admin" */
  path: string
}

export interface AppConfig {
  admin: AdminConfig
  registration: {
    enabled: boolean
  }
}

function normalizeAuthMethod(v: any): AdminAuthMethod {
  if (v === 'password' || v === 'token' || v === 'url') return v
  return 'token'
}

/** 归一化后台访问路径：去首尾斜杠，仅允许字母数字/_/-，并避开与现有页面冲突的保留名 */
function normalizePath(v: any): string {
  if (typeof v !== 'string') return 'admin'
  const p = v.trim().replace(/^\/+|\/+$/g, '')
  if (!/^[a-zA-Z0-9_-]+$/.test(p)) return 'admin'
  // 避免覆盖根路径或房间页 /r
  if (p === '' || p === 'r' || p === 'index') return 'admin'
  return p
}

const DEFAULT_CONFIG: AppConfig = {
  admin: {
    enabled: true,
    authMethod: 'token',
    accounts: [],
    token: 'change-me-token',
    urlKey: 'change-me-url-key',
    path: 'admin'
  },
  registration: {
    enabled: true
  }
}

let cached: AppConfig | null = null

function configPath(): string {
  if (process.env.SUN_NIGHT_CONFIG) return resolve(process.env.SUN_NIGHT_CONFIG)
  return resolve(process.cwd(), 'config.toml')
}

function normalizeAdmin(raw: any): AdminConfig {
  const admin = raw || {}
  const authMethod = normalizeAuthMethod(admin.auth_method)
  const accounts = Array.isArray(admin.accounts)
    ? admin.accounts
        .filter((a: any) => a && a.username)
        .map((a: any) => ({ username: String(a.username), password: String(a.password ?? '') }))
    : []
  const token = typeof admin.token === 'string' && admin.token ? admin.token : 'change-me-token'
  const urlKey = typeof admin.url_key === 'string' && admin.url_key ? admin.url_key : 'change-me-url-key'
  const path = normalizePath(admin.path)
  return {
    enabled: admin.enabled !== false,
    authMethod,
    accounts,
    token,
    urlKey,
    path
  }
}

/** 返回归一化后的配置（带缓存，进程内只读一次） */
export function getConfig(): AppConfig {
  if (cached) return cached
  const p = configPath()
  if (!existsSync(p)) {
    cached = DEFAULT_CONFIG
    return cached
  }
  try {
    const raw = parse(readFileSync(p, 'utf-8')) as any
    const registration = raw.registration || {}
    cached = {
      admin: normalizeAdmin(raw.admin),
      registration: {
        enabled: registration.enabled !== false
      }
    }
    return cached
  } catch {
    cached = DEFAULT_CONFIG
    return cached
  }
}

/** 重置缓存（仅供测试用） */
export function resetConfigCache(): void {
  cached = null
}
