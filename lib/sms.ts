// 문자앱 딥링크 — 본문을 채운 채로 문자앱을 연다.
// iOS는 구분자가 `&`, 안드로이드는 `?`라 플랫폼을 가려서 붙여야 본문이 들어간다.
export function smsHref(phone: string, message: string, isIOS: boolean) {
  const sep = isIOS ? "&" : "?";
  return `sms:${phone}${sep}body=${encodeURIComponent(message)}`;
}
