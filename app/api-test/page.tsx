'use client';

// ⚠️ 临时调试页（Step 2 验收用）：手动访问 /api-test
// 用途：验证 /api/chat 的 SSE 流式输出是否正常。正式功能上线后可删除或保留为调试页。

import { useState } from 'react';

export default function ApiTestPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [text, setText] = useState('');
  const [info, setInfo] = useState('');

  async function runTest() {
    setStatus('loading');
    setText('');
    setInfo('');
    const t0 = performance.now();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '用一句话介绍你自己' }],
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      let firstTokenMs = -1;
      let chunks = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const m = line.match(/^data: (.+)$/);
          if (!m) continue;
          try {
            const j = JSON.parse(m[1]);
            if (typeof j.content === 'string') {
              chunks += 1;
              if (firstTokenMs < 0) firstTokenMs = Math.round(performance.now() - t0);
              setText((prev) => prev + j.content);
            }
            if (j.error) throw new Error(j.error);
          } catch {
            /* 非 JSON 行跳过 */
          }
        }
      }
      const totalMs = Math.round(performance.now() - t0);
      setInfo(`✅ 流式正常：${chunks} 个片段，首字 ${firstTokenMs}ms，总耗时 ${totalMs}ms`);
      setStatus('done');
    } catch (e) {
      setInfo(`❌ 失败：${e instanceof Error ? e.message : String(e)}`);
      setStatus('error');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-xl font-bold">API 流式验证（临时调试页）</h1>
      <p className="mb-6 text-sm text-gray-500">POST /api/chat → 硅基流动 DeepSeek-V3，观察是否逐段输出</p>
      <button
        onClick={runTest}
        disabled={status === 'loading'}
        className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {status === 'loading' ? '请求中…' : '开始验证'}
      </button>
      <div className="mt-6 rounded-lg border p-4">
        <p className="text-sm text-gray-600">{status === 'idle' ? '点击按钮开始' : info || '等待首字…'}</p>
        <pre className="mt-3 min-h-16 whitespace-pre-wrap font-sans text-base leading-7">{text}</pre>
      </div>
    </main>
  );
}
