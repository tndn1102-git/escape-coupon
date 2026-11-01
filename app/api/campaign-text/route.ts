// 이미 만든 캠페인의 고객용 문구(제목·혜택·안내)를 고친다.
// 관리자 발행 폼엔 제목·안내 칸이 없어서, 폼으로 만든 캠페인에 문구를 채울 때 쓴다.
// 고객 쿠폰 화면은 캠페인 값을 그대로 읽으므로 이미 발행한 쿠폰 링크에도 바로 반영된다.
//
//   curl -X POST https://<도메인>/api/campaign-text \
//     -H "authorization: Bearer $WEEKLY_SECRET" --data-binary @payload.json
//   payload: {"id":"...","title":"...","benefit":"...","notice":"줄1\n줄2","dryRun":true}
//
// 보낸 항목만 바꾼다. 쿠폰·유효기간은 건드리지 않는다.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeSecret } from "@/lib/issue";

export async function POST(request: Request) {
  if (!authorizeSecret(request)) {
    return NextResponse.json({ ok: false, message: "인증 실패" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const dryRun = body?.dryRun === true;

  const data: { title?: string; benefit?: string; notice?: string } = {};
  for (const key of ["title", "benefit", "notice"] as const) {
    const value = body?.[key];
    if (typeof value === "string" && value.trim()) data[key] = value.trim();
  }
  if (!id || Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, message: "id와 바꿀 문구가 필요합니다" }, { status: 400 });
  }

  const select = { id: true, name: true, title: true, benefit: true, notice: true };
  const before = await prisma.campaign.findUnique({ where: { id }, select });
  if (!before) {
    return NextResponse.json({ ok: false, message: "캠페인을 찾을 수 없습니다" }, { status: 404 });
  }
  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun, before, after: { ...before, ...data } });
  }
  const after = await prisma.campaign.update({ where: { id }, data, select });
  return NextResponse.json({ ok: true, dryRun, before, after });
}
