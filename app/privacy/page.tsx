import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隐私与数据说明｜追面",
  description: "追面保存哪些面试数据、如何删除，匿名身份说明，以及 AI 生成内容的使用边界。",
};

const card = "space-y-3 rounded-xl border border-slate-200 p-5";
const prose = "text-sm leading-7 text-slate-700";

export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-8 sm:px-8">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">隐私与数据说明</h1>
      <p className={prose}>追面是一款模拟面试练习工具，无需填写邮箱即可开始。以下是我们在云端和本浏览器保存的内容，以及你管理、删除数据的方式。</p>
    </header>

    <section className={card} aria-labelledby="cloud-heading">
      <h2 id="cloud-heading" className="font-semibold">云端保存什么</h2>
      <p className={prose}>启用云同步时，已完成的面试会保存到当前账号，包括：</p>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-7 text-slate-700">
        <li>项目经历与所选岗位</li>
        <li>岗位 JD 分析结果</li>
        <li>面试题目、你的回答与追问记录</li>
        <li>逐题评分、反馈与复盘报告</li>
        <li>7 天提升计划的勾选状态</li>
      </ul>
      <p className={prose}>这些记录存储在 Supabase 云端数据库，与你的账号绑定，仅当前账号可读取、修改和删除。</p>
    </section>

    <section className={card} aria-labelledby="local-heading">
      <h2 id="local-heading" className="font-semibold">本浏览器保存什么</h2>
      <p className={prose}>以下内容只保存在当前浏览器的本地存储中，不会上传：未完成的面试进度、重练草稿、待同步数据，以及自动朗读等朗读设置。清除浏览器站点数据后，这些内容会丢失。</p>
    </section>

    <section className={card} aria-labelledby="delete-heading">
      <h2 id="delete-heading" className="font-semibold">如何删除我的数据</h2>
      <p className={prose}>进入设置页的「我的数据」，点击「删除我的全部数据」并二次确认，即可删除当前账号的云端面试记录，并清除此浏览器中对应的记录、草稿和待同步数据。</p>
      <p className={prose}>设备离线时，本地数据会立即清除，云端删除会在该账号恢复连接后重试。删除后不可恢复。</p>
      <p className={prose}><Link href="/settings#my-data" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">前往设置页删除我的数据</Link></p>
    </section>

    <section className={card} aria-labelledby="anonymous-heading">
      <h2 id="anonymous-heading" className="font-semibold">匿名身份说明</h2>
      <p className={prose}>你无需邮箱即可体验。启用云同步时，系统会为访客自动创建一个匿名账号，该身份与当前浏览器的会话绑定。清除浏览器站点数据或更换浏览器后，可能无法再找回这个匿名账号及其云端记录。</p>
      <p className={prose}>你可以在设置页将匿名账号升级为正式邮箱账号，升级后已有面试记录会保留并归属到该邮箱账号。</p>
      <p className={prose}><Link href="/settings" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">前往设置页管理账号</Link></p>
    </section>

    <section className={card} aria-labelledby="ai-heading">
      <h2 id="ai-heading" className="font-semibold">AI 生成内容仅供参考</h2>
      <p className={prose}>面试追问、逐题评分、反馈、复盘报告和项目经历改写均由 AI 模型自动生成，可能存在不准确或不完整之处。这些内容仅用于模拟练习和自我复盘，不代表真实面试结果、招聘方评价或任何专业建议，请结合自身判断使用。</p>
    </section>

    <section className={card} aria-labelledby="training-heading">
      <h2 id="training-heading" className="font-semibold">数据不用于模型训练</h2>
      <p className={prose}>你提交的简历内容、项目经历、面试回答和生成的报告，仅用于向你提供模拟面试与复盘功能，不会用于训练 AI 模型。</p>
    </section>

    <p className="text-xs text-slate-500">本说明最后更新于 2026 年 11 月 22 日。</p>
  </main>;
}
