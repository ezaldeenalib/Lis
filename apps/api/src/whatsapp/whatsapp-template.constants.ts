/** Key inside `Laboratory.settings` JSON. */
export const WHATSAPP_RESULTS_TEMPLATE_SETTINGS_KEY = 'whatsappResultsTemplate';

export const DEFAULT_WHATSAPP_RESULTS_TEMPLATE =
  `مرحباً {firstName} {lastName},\n\n` +
  `نتائج تحاليلك لطلب رقم {orderNumber} جاهزة.\n` +
  `يرجى مراجعة الملف المرفق لعرض النتائج.\n\n` +
  `مع تحيات {labName}`;

export const WHATSAPP_TEMPLATE_PLACEHOLDERS: { key: string; descriptionAr: string }[] = [
  { key: '{firstName}', descriptionAr: 'الاسم الأول للمريض' },
  { key: '{lastName}', descriptionAr: 'اسم العائلة' },
  { key: '{patientName}', descriptionAr: 'الاسم الكامل (يُستبدل تلقائياً)' },
  { key: '{orderNumber}', descriptionAr: 'رقم الطلب' },
  { key: '{mrn}', descriptionAr: 'الرقم الطبي للمريض' },
  { key: '{labName}', descriptionAr: 'اسم المختبر' },
];
