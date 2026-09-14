// 운영 검증 뒷정리 API — 검증 스크립트가 남긴 활동 로그(Log)를 지운다.
// 캠페인을 삭제해도 Log는 캠페인과 연결이 없어 남기 때문에 따로 지워야 한다.
// 혜택명이 "zz_검증"으로 시작하는 로그만 대상이라 실제 운영 기록은 건드리지 않는다.
//
//   curl -X POST https://<도메인>/api/cleanup-test \
//     -H "authorization: Bearer $WEEKLY_SECRET" \
//     -H "content-type: application/json" \
//     -d '{"dryRun":true}'
//
// dryRun: true 면 지우지 않고 대상 목록만 돌려준다.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeSecret } from "@/lib/issue";

const TEST_PREFIX = "zz_검증";

export async function POST(request: Request) {
  if (!authorizeSecret(request)) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  const where = { detail: { startsWith: TEST_PREFIX } };
  const targets = await prisma.log.findMany({ where, orderBy: { id: "asc" } });

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, count: targets.length, targets });
  }
  const { count } = await prisma.log.deleteMany({ where: { id: { in: targets.map((t) => t.id) } } });
  return NextResponse.json({ ok: true, deleted: count, targets });
}
