import { getConfig } from '~/server/utils/config'

/** 公开端点：返回当前后台登录方式与访问路径，供前端渲染对应登录界面（不暴露任何凭据） */
export default defineEventHandler(async () => {
  const cfg = getConfig()
  return { authMethod: cfg.admin.authMethod, enabled: cfg.admin.enabled, path: cfg.admin.path }
})
