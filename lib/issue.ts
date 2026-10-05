// 발행 API(/api/weekly, /api/birthday)가 공유하는 인증·쿠폰 발급 로직.
// 만료 캠페인 자동 삭제(보관정리)는 2026-10-06 사용자 지시로 없앴다 — 캠페인 삭제는 사용자가 요청할 때만 한다.

import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { newToken, uniqueCode } from "@/lib/coupon";

// 시크릿 미설정이면 무조건 거부한다(기본값을 두면 공개 엔드포인트가 되므로).
export function authorizeSecret(request: Request) {
  const secret = process.env.WEEKLY_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// 같은 캠페인에 같은 번호의 미사용 쿠폰이 있으면 재사용한다(중복 발급 방지).
// 재실행으로 이름이 새로 들어오면 채워 넣는다(이름 없이 먼저 발급한 경우 보정).
export async function ensureCoupon(opts: {
  campaignId: string;
  phone: string;
  name: string | null;
  expiresAt: Date | null;
}) {
  const found = await prisma.coupon.findFirst({
    where: { campaignId: opts.campaignId, sentTo: opts.phone, status: "issued" },
  });
  if (found) {
    if (opts.name && found.sentName !== opts.name) {
      const updated = await prisma.coupon.update({
        where: { id: found.id },
        data: { sentName: opts.name },
      });
      return { coupon: updated, created: false };
    }
    return { coupon: found, created: false };
  }
  const coupon = await prisma.coupon.create({
    data: {
      id: newToken(),
      code: await uniqueCode(),
      campaignId: opts.campaignId,
      expiresAt: opts.expiresAt,
      sentTo: opts.phone,
      sentName: opts.name,
    },
  });
  return { coupon, created: true };
}
