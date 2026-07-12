import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'
import { getConfig } from './server/utils/config'

// 后台管理页访问路径（构建期由 config.toml 的 [admin].path 决定，默认 admin）
const ADMIN_PATH = getConfig().admin.path

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },
  // 启用 SSR：首屏由服务端渲染，协同数据在客户端经 API/SSE 拉取。
  ssr: true,
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: '谋定三国天下 · 协同作战安排',
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
        },
        { name: 'theme-color', content: '#f7f8fa' }
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },
  // 根据 config.toml 的 [admin].path 动态注册后台页面路由，替换默认的 /admin。
  hooks: {
    'pages:extend'(pages) {
      const idx = pages.findIndex((p) => p.path === '/admin')
      if (idx !== -1) pages.splice(idx, 1)
      pages.push({
        name: 'admin',
        path: `/${ADMIN_PATH}`,
        file: fileURLToPath(new URL('./pages/admin.vue', import.meta.url))
      })
    }
  },
  nitro: {
    // SSE 依赖 Node 服务端的 response 流，默认 node 预设即可。
    preset: 'node-server',
    // @libsql/client 内含预编译原生模块，构建时保持外部依赖，避免被打包破坏。
    externals: {
      external: ['@libsql/client']
    }
  }
})
