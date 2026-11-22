import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "设置｜追面",
  description: "管理匿名账号与邮箱升级，查看数据存储说明并删除我的面试数据。",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
