import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "工业设计智能体 · INDUS",
  description: "工业设计智能体 1.7 本地网页版。激活、连接自己的模型，并在浏览器里保存项目与生成结果。",
  applicationName: "工业设计智能体",
  icons: { icon: "/icons/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
