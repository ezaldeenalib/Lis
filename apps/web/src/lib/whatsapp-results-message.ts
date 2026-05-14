/** Keep in sync with `apps/api/src/whatsapp/whatsapp-template.constants.ts` */
export const DEFAULT_WHATSAPP_RESULTS_TEMPLATE =
  `مرحباً {firstName} {lastName},\n\n` +
  `نتائج تحاليلك لطلب رقم {orderNumber} جاهزة.\n` +
  `يرجى مراجعة الملف المرفق لعرض النتائج.\n\n` +
  `مع تحيات {labName}`;

export interface WhatsAppResultsMessageVars {
  firstName: string;
  lastName: string;
  orderNumber: string;
  mrn: string;
  labName: string;
}

export function applyWhatsAppResultsTemplate(
  template: string,
  vars: WhatsAppResultsMessageVars,
): string {
  const patientName = `${vars.firstName} ${vars.lastName}`.trim();
  return template
    .replaceAll('{firstName}', vars.firstName)
    .replaceAll('{lastName}', vars.lastName)
    .replaceAll('{patientName}', patientName)
    .replaceAll('{orderNumber}', vars.orderNumber)
    .replaceAll('{mrn}', vars.mrn)
    .replaceAll('{labName}', vars.labName);
}

export function buildDefaultWhatsAppResultsMessage(vars: WhatsAppResultsMessageVars): string {
  return applyWhatsAppResultsTemplate(DEFAULT_WHATSAPP_RESULTS_TEMPLATE, vars);
}
