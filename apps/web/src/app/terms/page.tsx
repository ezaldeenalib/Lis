import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="page-heading mb-4">شروط الخدمة</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
        استخدام نظام LIS يخضع لسياسات المختبر وصلاحيات المستخدم الممنوحة من مسؤول النظام.
        يجب الحفاظ على سرية بيانات الدخول وعدم مشاركتها.
      </p>
      <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
        العودة لتسجيل الدخول
      </Link>
    </div>
  );
}
