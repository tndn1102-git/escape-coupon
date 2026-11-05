// 잘못 발행한 쿠폰 한 장을 지운다. (캠페인은 그대로 둔다)
// 관리자 화면엔 쿠폰 개별 삭제가 없고 캠페인 통삭제만 있어서, 상시 캠페인 소속 쿠폰 1장을
// 지워야 할 때 쓴다. 지운 뒤 고객 링크(/c/<token>)는 "존재하지 않는 쿠폰입니다"가 뜬다.
//
//   curl -X POST https://<도메인>/api/coupon-delete \
//     -H "authorization: Bearer $WEEKLY_SECRET" --data-binary @payload.json
//   payload: {"id":"<token>","dryRun":true}   ← 먼저 dryRun으로 어떤 쿠폰인지 확인
//
// 이미 사용 처리된 쿠폰(status=redeemed)은 force:true 없이는 지우지 않는다.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeSecret } from "@/lib/issue";

export async function POST(request: Request) {
  if (!authorizeSecret(request)) {
    return NextResponse.json({ ok: false, message: "인증 실패" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const dryRun = body?.dryRun === true;
  const force = body?.force === true;
  if (!id) {
    return NextResponse.json({ ok: false, message: "id(쿠폰 토큰)가 필요합니다" }, { status: 400 });
  }

  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      sentName: true,
      sentTo: true,
      expiresAt: true,
      viewCount: true,
      createdAt: true,
      campaign: { select: { id: true, name: true } },
    },
  });
  if (!coupon) {
    return NextResponse.json({ ok: false, message: "쿠폰을 찾을 수 없습니다" }, { status: 404 });
  }
  if (coupon.status === "redeemed" && !force) {
    return NextResponse.json(
      { ok: false, message: "이미 사용 처리된 쿠폰입니다. 정말 지우려면 force:true", coupon },
      { status: 409 },
    );
  }
  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun, coupon });
  }
  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true, dryRun, deleted: coupon });
}
