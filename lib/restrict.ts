// 쿠폰 사용 제약(시간·요일) 검증 + 표시 텍스트
export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 화면 표시용 KST 날짜·시각 포맷 (서버가 UTC여도 한국시간으로 표시)
export function fmtKSTDateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 연도·요일까지 포함한 KST 전체 표기 (툴팁 등 정확한 시각이 필요한 곳)
export function fmtKSTFull(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 서버 타임존과 무관하게 한국시간(KST) 기준 요일·시각
export function kstNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  return { day: kst.getDay(), hour: kst.getHours() };
}

type TimeRule = {
  validDays: string | null;
  validFromHour: number | null;
  validToHour: number | null;
};

// 사용 가능하면 null, 불가하면 사유 메시지 반환
export function checkTimeRule(rule: TimeRule): string | null {
  const { day, hour } = kstNow();
  if (rule.validDays) {
    const days = rule.validDays.split(",").map(Number);
    if (!days.includes(day)) return `${describeDays(rule.validDays)}에만 사용 가능한 쿠폰입니다.`;
  }
  if (rule.validFromHour != null && rule.validToHour != null) {
    if (!(hour >= rule.validFromHour && hour < rule.validToHour)) {
      return `${rule.validFromHour}시~${rule.validToHour}시에만 사용 가능한 쿠폰입니다.`;
    }
  }
  return null;
}

export function describeDays(csv: string) {
  const days = csv.split(",").map(Number).sort();
  // 평일/주말 축약
  if (days.join() === "1,2,3,4,5") return "평일";
  if (days.join() === "0,6") return "주말";
  return days.map((d) => DAY_LABELS[d]).join("·") + "요일";
}

// 고객/직원 화면용 제약 표시 문구 (없으면 빈 문자열)
export function restrictionText(rule: TimeRule & { minPeople?: number }) {
  const parts: string[] = [];
  if (rule.validDays) parts.push(describeDays(rule.validDays));
  if (rule.validFromHour != null && rule.validToHour != null)
    parts.push(`${rule.validFromHour}시~${rule.validToHour}시`);
  if (rule.minPeople && rule.minPeople > 1) parts.push(`${rule.minPeople}인 이상`);
  return parts.join(" · ");
}
