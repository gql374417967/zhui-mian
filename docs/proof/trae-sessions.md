# TRAE 会话留证日志（报名材料附表）

> 说明：比赛要求"说明 TRAE 参与的任务、解决的问题，并提供关键对话的 Session ID 和截图作为过程记录"。
> 本表逐步记录；截图存于同目录 proof 文件夹 + 手动截取的对话窗口图。

| 步骤 | 日期 | Session ID | 做了什么 | 解决的问题 |
|---|---|---|---|---|
| Step 1 项目骨架 | 2026-11-19 | `6afdde4c688eb37b5ca380cd` | 用 Next.js 14 App Router + TS + Tailwind + shadcn/ui 搭建 4 页面骨架（/、/interview、/report、/history），移动端优先 | 从 0 建站；npm run build 通过；320/390/1280px 三档宽度无横向溢出 |
| Step 2 类型与服务层 | 2026-11-19 | `6afdde4c688eb37b5ca380cd`（与 Step 1 同会话连续完成） | 定义 6 个业务类型；实现 POST /api/chat（OpenAI 兼容 SDK 调用硅基流动 DeepSeek-V3，SSE 流式，30s 限时、失败重试、缺 key 报错、.env.local git 忽略） | 接口实测：29 个流式片段、首字 1499ms、总耗时 2734ms，UTF-8 中文输出正常（见 step2-01 截图） |
| Step 3 追问引擎 | 2026-11-19 | `6afdf44d688eb37b5ca38222` | lib/prompts.ts 录入 5 个提示词（支持岗位变量注入）；lib/engine.ts 实现四题状态机（原文锚点校验、含糊追问≤2层、连答不上给提示换题、逐题评分、第4题后总复盘、JSON 解析多级降级） | TS 检查通过；故障模拟（坏 JSON/断流/追问上限/模型异常）通过；真实模型两段详略对比测试通过，详例走完四题产出 4 份结构化评分+1 份总复盘；ZCode 代码审查：key 零泄漏、锚点强制原文校验、重试带完整上下文 |
| Step 4 面试页 UI | 2026-11-19 | `6afdff26688eb37b5ca382b0` | /interview 接入引擎：主问题卡锚点高亮、追问独立样式（题号保持）、逐题反馈卡（分数+原句vs改写+oneTip）、跳题/提前结束、IME Enter 防误发、localStorage 进度恢复、清理临时自检组件 | npm run build 通过；ZCode 端到端实测（真实模型）：示例项目完整跑通 4 题+2 层追问+跳题+复盘生成+跳转报告+刷新恢复+390px 手机布局，全程 0 控制台报错（截图 step4-01~05） |
| Step 5 语音输入 | 2026-11-19 | `6afecfe9688eb37b5ca3854c` | 面试页接入浏览器录音和硅基流动语音转写，支持计时、取消、草稿回填和手动发送 | 独立验证通过 Windows Chrome 虚拟麦克风录音、WebM 真实转写及 390px 页面交互，MP4 单独通过真实接口转写。实体麦克风口述待实测。 |
| Step 6 问题朗读 | 2026-11-19 | `6afee5f8688eb37b5ca38666` | 主问题与追问支持手动朗读、自动朗读及停止，接入硅基流动 TTS 和浏览器中文语音 | 真实 MP3、Chrome 播放进度、自动播放恢复、录音互斥、旧请求拦截及 390px 布局通过。扬声器未人工听验。 |

## 会话截图
（手动用 Win+Shift+S 截 TRAE 对话窗口，命名如 `screenshot-step1.png` 放本目录）

## 产品截图
- step1-01-首页-桌面.png
- step1-02-首页-手机390.png
- step1-03-面试页.png
- step1-04-报告页.png
- step1-05-历史页.png

## 验证截图
- step2-01-API流式验证通过.png（/api-test 调试页实测：29 片段 / 首字 1499ms / 总 2734ms）
- [Step 4 锚点补丁 TRAE 会话截图](<screenshot-step4-锚点补丁.png>)，Session ID `6afdff26688eb37b5ca382b0`。独立复验通过 TypeScript、同盘隔离生产构建及锚点回归测试。真实模型跑完 4 道主问题和 5 道追问，生成 4 份结构化反馈和 1 份结构化复盘，耗时 164 秒。7 次重试均由单题校验触发，其中 5 道问题最终使用兜底模板。本轮未触发锚点校验重试。

- [Step 4 反馈与单题修复 TRAE 会话截图](<screenshot-step4-反馈与单题修复.png>)，Session ID `6afdff26688eb37b5ca382b0`。独立复验通过 TypeScript、隔离生产构建与模拟回归。模拟覆盖短回答、伪造及跨回答拼接引用、版本号和小数单题、明确多问。真实模型跑完 4 道主问题和 8 道追问，生成 4 份结构化反馈和 1 份结构化复盘，17 次调用，零重试、零兜底，耗时 112 秒，所有反馈引用均可追溯至本题回答。另用一句短回答单独验证真实评分，缺失事实以「待补充」标注。实测仍出现同一题内重复追问和预设未确认数值的问法。

- [Step 4 追问去重与事实依据 TRAE 会话截图](<screenshot-step4-追问去重与事实依据.png>)，Session ID `6afdff26688eb37b5ca382b0`。独立复验通过 TypeScript 和隔离生产构建。模拟确认主问题及已有追问的重复文案会被拦截，重试仍重复时换角度或进入评分，追问最多两层。未提供的 `20%`、`300ms` 会被拦截。真实模型完成 4 道主问题、5 道追问、4 份结构化反馈和 1 份结构化复盘，17 次调用、零重试、零兜底，耗时 100 秒。未出现重复题或预设数值。仍出现未确认结果的提问「你们最终如何解决了看不到状态提示的问题？」。模拟也确认「具体是哪个接口的耗时上升了？」仍可通过校验。

- Step 4 结果预设定点复测：TypeScript 通过。当前代码仍会展示「你们最终如何解决了看不到状态提示的问题？」和「具体是哪个接口的耗时上升了？」。对照组中，未提供的 `20%` 仍会触发重试，开放式问法「整理后有什么进展？」正常通过。该轮确认两处结果预设缺口，后续已修复。

- [Step 4 结果预设修复 TRAE 会话截图](<screenshot-step4-结果预设修复.png>)，Session ID `6afdff26688eb37b5ca382b0`。TRAE 在原会话修复共享校验，主问题和追问都会核对问题或指标对应的对象。独立复跑 14 项回归全部通过，覆盖原反例、否定或未知语境、跨问题与跨接口的证据混用、同对象正例、开放式确认和重试兜底。TypeScript 检查通过，TRAE 的隔离生产构建通过，3000 本地预览返回 HTTP 200。

- Step 4 最终独立复验：当前工作区的 14 项回归、TypeScript 和隔离生产构建全部通过，`/interview` 返回 HTTP 200。使用真实模型和模拟候选人回答完成 4 道主问题、3 道追问、4 份结构化反馈和 1 份结构化复盘。15 次模型调用，零重试、零兜底、零同题重复，反馈引用全部可以在本题回答中找到，耗时 128 秒。状态提示尚未修复、接口耗时未测两个样例未出现预设结果。

- Step 5 TRAE 留证：[真实转写](<screenshot-step5-真实转写.png>)、[边界与回归](<screenshot-step5-边界与回归.png>)、[验收附件](<screenshot-step5-验收附件.png>)。产品截图包括 `step5-01-recording-390.png` 至 `step5-04-permission-denied-390.png`。
- Step 5 独立复验：Windows Chrome 157.0.8103.78 使用本地合成中文 WAV 驱动虚拟麦克风，走浏览器录音、真实 WebM 转写、追加草稿、编辑后手动发送，面试官继续追问。[录音](<step5-independent-recording.png>)、[草稿回填](<step5-independent-transcript.png>)、[手动发送](<step5-independent-sent.png>)。用同一样本生成 MP4 并直测 `/api/stt`，真实接口返回 HTTP 200。两种格式均识别出核心内容，个别「我」被识别为「或」。
- Step 5 边界复验：[权限拒绝后仍可打字](<step5-independent-denied-typed.png>)、[取消录音后刷新恢复草稿](<step5-independent-cancel-audio-refresh.png>)。权限拒绝及取消录音两种场景未上传音频。空文件、格式无效、超过 4 MiB 分别返回 400、415、413。390px 布局无横向溢出，现有 14 项回归、TypeScript 和隔离生产构建通过。浏览器仍请求缺失的 `/favicon.ico` 并返回 404。60 秒自动停止及迟到结果拦截参见 TRAE 实测，实体麦克风和手机真机仍待验证。

## Step 6 问题朗读 TTS

- 计划确认原话「使用计划中核对过的 CosyVoice2-0.5B 和 alex 音色，输出 MP3。」「先保留改动，等独立验收后再提交 Git。」追加验收要求覆盖自动播放拦截后手动重试，以及等待授权、录音中、录音结束后才收到旧音频的三个时点。
- 实际音频输出。Windows Chrome 播放真实硅基流动 MP3 时，主问题手动朗读、新追问自动朗读、追问手动朗读均在浏览器音频管线捕获到非静音 PCM。复现 `NotAllowedError` 后手动重试也捕获到非静音 PCM，使用首次请求返回的音频。强制接口返回 502 后，`speechSynthesis` 使用 `zh-CN` 的 Microsoft Huihui，合成开始至结束期间从 Windows 扬声器回环采集到非静音信号。未人工听验扬声器外放。
- 接口返回。真实 `/api/tts` 样本返回 HTTP 200 和 `audio/mpeg`，共 43,903 字节，经 `ffprobe` 确认为 2.664 秒 MP3。空文本返回 HTTP 400。
- 浏览器状态。新会话默认关闭自动朗读，开启后刷新仍保持开启，恢复历史对话未发起 TTS 请求。原生 Chrome 自动播放拦截使按钮退出「停止朗读」状态并恢复可点击，点击后触发 `playing`。录音用虚拟麦克风，授权时点由测试控制，转写使用模拟响应。开始录音使已播放音频进入暂停状态。故意无视取消信号并在等待授权、录音中、录音结束后各送回一次有效 MP3，三个时点均未触发播放器或浏览器合成。切换到追问、跳题、结束和离页后也逐一验证了迟到响应。面试模型应答使用固定样例，TTS 主路径使用真实接口。
- 390px Chrome 视口无横向溢出。[主问题朗读](<step6-main-playing-390.png>)、[追问朗读](<step6-followup-playing-390.png>)、[拦截后手动入口](<step6-autoplay-blocked-390.png>)、[等待授权](<step6-waiting-permission-390.png>)、[录音中](<step6-recording-390.png>)、[降级测试后](<step6-fallback-390.png>)。
- TRAE 的 `npm run build` 和 14 项面试引擎回归通过。[实际音频输出会话](<screenshot-step6-实际音频输出.png>)、[接口与回归会话](<screenshot-step6-接口与回归.png>)、[验收附件会话](<screenshot-step6-验收附件.png>)。
- 独立复验。真实 `/api/tts` 返回 HTTP 200、`audio/mpeg` 和 95,743 字节，解码为 5.904 秒的非静音 MP3，峰值 -2.2 dB，空文本返回 400。Chrome 使用固定面试题与虚拟麦克风，确认主问题手动、追问自动和手动朗读的播放进度，停止按钮与开始录音均暂停播放器，录音期间两处朗读入口禁用。开关刷新后保持，历史无重播，旧请求在录音取消后送回也不会启动播放器。模拟自动播放拒绝后手动重试可以复用音频并播放。模拟 502 会触发 `zh-CN` 合成调用，独立复验未采集该降级路径的音频。浏览器无页面异常，390px 不横向溢出，TypeScript、隔离生产构建和 14 项回归通过。首轮播放脚本的一次暂停事件等待超时，改用实际 `paused` 属性后通过。由于 3000 的页面报 500、3015 为 Step 5 产物，浏览器使用独立 3026 预览验证。
- 独立截图：[主问题](<step6-independent-main-playing.png>)、[追问自动朗读](<step6-independent-auto-verified.png>)、[录音互斥](<step6-independent-recording-verified.png>)、[自动播放受限](<step6-independent-autoplay-blocked.png>)、[模拟降级](<step6-independent-fallback.png>)。Git 待提交。

## 备注
- `app/api-test/page.tsx` 为临时调试页（验证 /api/chat 用，非 TRAE 生成，验收后可在 Step 12 删除）
- Session ID 查询方法：TRAE 界面不直接展示，存于
  `C:\Users\LEGION\AppData\Roaming\Trae\User\workspaceStorage\<workspace>\state.vscdb` 的
  `ai-chat-v2.lastActiveSessionId` 键

## 待办备忘
- [ ] favicon 404（Step 12 打磨时让 TRAE 补站点图标）
