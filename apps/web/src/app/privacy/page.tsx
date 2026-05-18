import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="page-heading mb-4">سياسة الخصوصية</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
        يحمي نظام إدارة المختبر (LIS) بيانات المرضى والطلبات وفق سياسات المختبر المعتمدة.
        يُستخدم الوصول إلى النظام للأغراض التشغيلية فقط.
      </p>
      <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
        العودة لتسجيل الدخول
      </Link>
    </div>
  );
}
