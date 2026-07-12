import { getConfig } from '~/server/utils/config'

/** 公开配置：无需鉴权，供前端决定是否展示注册入口 */
export default defineEventHandler(async () => {
  const cfg = getConfig()
  return { registrationEnabled: cfg.registration.enabled }
})
