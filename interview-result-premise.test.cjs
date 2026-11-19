const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(outputText, filename);
};
const { createInterviewEngine } = require('./lib/engine.ts');

const resolution = {
  anchor: '整理上架投诉',
  unknown: '我整理上架投诉，定位到用户在哪一步看不到状态提示。',
  confirmed: '整理上架投诉后，我们已经解决了看不到状态提示的问题。',
  closed: '你们最终如何解决了看不到状态提示的问题？',
  open: '整理后有什么进展？',
  reason: /预设了问题已经解决/,
  unconfirmed: [
    '我们还没有解决看不到状态提示的问题。',
    '我不知道看不到状态提示的问题是否已经解决。',
    '我们只考虑过怎么解决的方案。',
    '如果方案上线，问题就解决了。',
    '没有状态提示的问题是否已经解决？',
  ],
};
const direction = {
  anchor: '查看了接口日志',
  unknown: '我查看了接口日志，但没有记录具体耗时，也不知道耗时有没有变化。',
  confirmed: '我查看了接口日志，确认订单接口的耗时上升了。',
  closed: '具体是哪个接口的耗时上升了？',
  open: '当时你如何了解接口耗时情况？',
  reason: /预设了指标变化方向/,
  unconfirmed: [
    '接口耗时没有上升。',
    '我不知道接口耗时是否上升。',
    '我只考虑过接口耗时可能上升。',
    '假设订单变多，接口耗时会上升。',
    '接口耗时上升了吗？',
    '确认接口耗时下降了。',
    '吞吐量上升了。',
  ],
};
const track = { id: 'general', name: '通用', capabilities: [], seedQuestions: [] };

async function generate(type, fixture, evidence, question, retryQuestion) {
  const requests = [];
  const engine = createInterviewEngine(async (messages) => {
    const context = JSON.parse(messages[1].content);
    if (type === 'followup' && context.questionNumber) {
      return JSON.stringify({ type: 'question', anchor: fixture.anchor, question: '你在这项工作中负责什么？' });
    }
    requests.push(messages[2]?.content);
    return JSON.stringify({ type, anchor: fixture.anchor, question: messages[2] ? retryQuestion : question });
  });
  const input = { projectText: type === 'question' ? `${fixture.anchor}。${evidence}` : fixture.anchor, track: track.id, source: 'paste' };
  const started = await engine.start(input, track);
  const state = type === 'question' ? started : await engine.submitAnswer(started, evidence);
  assert.equal(state.phase, type);
  return { question: state.current.question, requests };
}

for (const type of ['question', 'followup']) {
  for (const [name, fixture] of Object.entries({ resolution, direction })) {
    test(`${type} ${name} 原反例和未确认语境均带原因重试`, async () => {
      for (const evidence of [fixture.unknown, ...fixture.unconfirmed]) {
        const result = await generate(type, fixture, evidence, fixture.closed, fixture.open);
        assert.equal(result.requests.length, 2, evidence);
        assert.match(result.requests[1], fixture.reason, evidence);
        assert.equal(result.question, fixture.open, evidence);
      }
    });
    test(`${type} ${name} 开放式问题和已确认结果首轮通过`, async () => {
      const confirmationQuestion = name === 'resolution' ? '这个问题已经解决了吗？' : '接口耗时是否上升了？';
      for (const [evidence, question] of [[fixture.unknown, fixture.open], [fixture.unknown, confirmationQuestion], [fixture.confirmed, fixture.closed]]) {
        assert.deepEqual(await generate(type, fixture, evidence, question), { question, requests: [undefined] });
      }
    });
    test(`${type} ${name} 两次无依据时使用开放式兜底`, async () => {
      const result = await generate(type, fixture, fixture.unknown, fixture.closed, fixture.closed);
      assert.equal(result.requests.length, 2);
      assert.match(result.requests[1], fixture.reason);
      assert.notEqual(result.question, fixture.closed);
      assert.match(result.question, /关键动作是什么/);
    });
  }

  test(`${type} 混合结果只采纳同一对象的证据`, async () => {
    const issues = '交易接口限流故障修好了，状态提示问题还未修复。';
    const metrics = '交易接口的耗时上升了，搜索接口的耗时没测。';
    const rejected = [
      [resolution, issues, resolution.closed],
      [resolution, issues, '你们是怎么解决的？'],
      [resolution, resolution.unknown, '你们是怎么解决的？'],
      [direction, metrics, '搜索接口的耗时为什么上升了？'],
      [direction, '搜索接口的耗时上升了，后来确认搜索接口的耗时没测。', '搜索接口的耗时为什么上升了？'],
    ];
    for (const [fixture, evidence, question] of rejected) {
      const result = await generate(type, fixture, evidence, question, fixture.open);
      assert.equal(result.requests.length, 2, question);
      assert.match(result.requests[1], fixture.reason);
      assert.equal(result.question, fixture.open);
    }
    const accepted = [
      [resolution, issues, '交易接口限流故障是怎么修好的？'],
      [resolution, '交易接口限流故障还未修复，状态提示问题已经解决了。', resolution.closed],
      [resolution, issues, '这个问题后来解决了吗？'],
      [direction, metrics, '交易接口的耗时为什么上升了？'],
      [direction, '交易接口的耗时没测，搜索接口的耗时上升了。', '搜索接口的耗时为什么上升了？'],
    ];
    for (const [fixture, evidence, question] of accepted) {
      assert.deepEqual(await generate(type, fixture, evidence, question), { question, requests: [undefined] });
    }
  });
}
