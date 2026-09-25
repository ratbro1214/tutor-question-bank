import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "家教题库",
  description: "上传数学题、确认知识点分类并查看学生提问统计。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
