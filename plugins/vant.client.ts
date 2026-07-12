import { Lazyload } from 'vant'
import 'vant/lib/index.css'

// 仅在客户端注册 Vant 插件与全局样式（Lazyload + 组件样式）
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(Lazyload, { lazyComponent: true })
})
