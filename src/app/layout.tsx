import type { Metadata, Viewport } from 'next';
import { Shell } from '@/components/shell';
import './globals.css';

export const metadata: Metadata = { title: 'WINTERLIGHT CLOUD OPS', description: 'WINTERLIGHT 인프라 운영 상태 모니터링 (읽기 전용)' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#080D1C' };

const themeInit = `try{var t=localStorage.getItem('wl-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
