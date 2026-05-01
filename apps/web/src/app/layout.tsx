import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cairo',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'نظام معلومات المختبر (LIS)',
  description: 'منصة نظام معلومات المختبر الاحترافية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${cairo.variable} font-cairo`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
