# 追面

追问式模拟面试 Web 应用：从你的项目经历出发，模拟真实面试中的层层追问，逐题给出评分与反馈，并生成复盘报告与 7 天提升计划。无需安装、无需邮箱即可体验。

- 线上地址：https://zhui-mian.vercel.app
- 无需注册：点击首页「用示例项目 30 秒体验」即可开始
- 隐私说明：部署后访问 `/privacy`，查看数据存储、删除方式与 AI 内容边界

## 技术栈

- Next.js 14（App Router）+ React 18 + TypeScript
- Tailwind CSS
- OpenAI 兼容接口（默认硅基流动：DeepSeek-V3 / SenseVoiceSmall / CosyVoice2）
- Supabase（匿名登录、云端面试归档、RLS 行级隔离）
- 图标来自 [lucide-react](https://lucide.dev)（ISC License）

## 本地运行

要求 Node.js 18.17 及以上。

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
# 编辑 .env.local，填写真实密钥
npm run dev
```

打开 http://localhost:3000 。开发模式的构建产物位于 `.next-dev`，不会覆盖生产构建。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_API_KEY` | 是 | 大模型接口密钥（用于追问、评分、复盘、改写、JD 解析、简历解析） |
| `LLM_BASE_URL` | 是 | OpenAI 兼容接口地址，默认 `https://api.siliconflow.cn/v1` |
| `LLM_MODEL` | 是 | 模型名，默认 `deepseek-ai/DeepSeek-V3` |
| `SF_API_KEY` | 是 | 语音服务密钥（用于语音转写与问题朗读，可与 `LLM_API_KEY` 相同） |
| `ASR_MODEL` | 是 | 语音转写模型，默认 `FunAudioLLM/SenseVoiceSmall` |
| `TTS_MODEL` | 是 | 朗读模型，默认 `FunAudioLLM/CosyVoice2-0.5B` |
| `NEXT_PUBLIC_SUPABASE_URL` | 否 | Supabase 项目地址；不配置则仅使用本地存储 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 否 | Supabase 匿名公开密钥（仅使用 anon key，勿使用 service_role） |

未配置 Supabase 时，应用仍可使用本地存储完成面试与复盘，但不会云端同步，历史记录仅保留在当前浏览器。未配置模型密钥时，相关接口会返回明确的配置错误提示。

## 生产构建

```bash
npm run build
npm start
```

## 部署（Vercel）

当前生产环境部署在 Vercel：

1. 将仓库导入 Vercel，Framework Preset 选择 Next.js，Node.js 18.17 及以上。
2. 在 Project Settings → Environment Variables 中配置上表 8 个变量（Production / Preview 均建议配置）。
3. 在 Supabase SQL Editor 执行 [supabase/migrations/20261121000000_interviews.sql](supabase/migrations/20261121000000_interviews.sql)，创建 `interviews` 表并启用 RLS。
4. 在 Supabase Authentication 的 URL Configuration 中，将 Site URL 设为生产域名，并把 `https://<你的域名>/auth/callback` 加入 Redirect URLs。
5. 部署完成后访问首页与 `/privacy` 自检。

各 API 路由已声明 `maxDuration = 60`，避免模型长耗时请求被函数超时中断；若使用免费版额度，请确认账户允许的最大函数时长。

## 测试

```bash
node --test interview-result-premise.test.cjs
```

覆盖追问引擎的结果预设与事实边界回归。每次改动后建议同时执行 `npm run build` 与上述测试。
