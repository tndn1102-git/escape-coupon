// 매달 발행하는 생일축하 쿠폰 설정.
// 주간 쿠폰과 만료 규칙이 다르다 — 발급일+1개월이 아니라 "해당월 마지막 날"까지.

import { fmtKSTDate, kstEndOfDay, toKST } from "@/lib/kst";

// 고객 쿠폰 화면에 뜨는 혜택 문구 (직원이 보고 처리하는 기준)
export const BIRTHDAY_BENEFIT = "FANTASTRICK 테마 중 택1 (5,000원) 할인쿠폰";

// 생일 캠페인 이름은 "2026-08 생일축하 쿠폰" 꼴. 이 접두사로 월을 되찾는다.
const NAME_RE = /^(\d{4}-\d{2}) 생일축하 쿠폰$/;

// KST 기준 이번 달 "YYYY-MM"
export function monthKey(now = new Date()) {
  const k = toKST(now);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parts(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { y, m: m - 1 };
}

// 해당월 마지막 날 23:59:59(KST)
export function monthEnd(month: string) {
  const { y, m } = parts(month);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return kstEndOfDay(y, m, lastDay);
}

// "2026-08" → "8"
export function monthLabel(month: string) {
  return String(parts(month).m + 1);
}

export function birthdayCampaignName(month: string) {
  return `${month} 생일축하 쿠폰`;
}

// 캠페인명이 생일 캠페인이면 해당 월("2026-08")을, 아니면 null
export function monthFromCampaignName(name: string) {
  return name.match(NAME_RE)?.[1] ?? null;
}

// 고객 쿠폰 화면 상단 제목
export function birthdayTitle(month: string) {
  return `FANTASTRICK ${monthLabel(month)}월달 생일축하 쿠폰을 보내드립니다!`;
}

// 안내 3줄. 쿠폰 화면엔 유효기간이 따로 표시되므로 여기엔 날짜를 넣지 않는다.
export function birthdayNoticeLines(month: string) {
  return [
    `본 쿠폰은 FANTASTRICK 동의서 작성 시 마케팅 동의를 하신 분들 중 ${monthLabel(month)}월달 생일자 대상으로 발송된 쿠폰입니다.`,
    "판타스트릭1,2,TGC점에서 원하시는 테마 1개 선택하여 사용 가능합니다.",
    "매장에서 쿠폰을 직원에게 보여주시면 사용 가능합니다.",
    "해당월 마지막 날까지 사용 가능하시니 기한을 꼭 확인해주시기 바랍니다.",
  ];
}

export function birthdayNotice(month: string) {
  return birthdayNoticeLines(month).join("\n");
}

// 받는 사람 한 명에게 나갈 문자 한 통.
// ⚠️ 200자 안쪽으로 유지할 것(2026-10-03 사용자 결정). 한글 문자는 67자마다 한 통으로 쪼개져 통신사 일 한도(500통)를
// 먹는다 — 옛 문구 421자 = 7통/명이라 62명에 434통을 써 "일 400건 소진" 경고가 왔다. 200자 = 3통/명 → 하루 160명.
// 긴 안내문은 쿠폰 화면(birthdayNoticeLines)에 그대로 있으니 문자는 링크로 보내는 역할만 한다.
export const BIRTHDAY_SMS_MAX = 200;

export function buildBirthdayMessage(
  name: string | null | undefined,
  link: string,
  month: string,
  expiresAt: Date | string | null | undefined,
) {
  const who = name ? `${name}님` : "고객님";
  const m = monthLabel(month);
  // "2026. 10. 31." → "10/31"
  const until = fmtKSTDate(expiresAt).replace(/^\d{4}\. (\d{1,2})\. (\d{1,2})\.$/, "$1/$2");

  return [
    `[FANTASTRICK] ${m}월 생일축하 쿠폰`,
    `${who}, 생일 축하드립니다! 테마 택1 5,000원 할인쿠폰을 드려요.`,
    link,
    `판타스트릭1·2·TGC점 사용 · 매장에서 직원에게 제시 · ~${until}까지`,
    `* 마케팅 동의 고객 중 ${m}월 생일자 대상`,
  ].join("\n");
}
