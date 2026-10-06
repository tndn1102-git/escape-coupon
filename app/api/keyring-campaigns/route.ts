// 키링 상시 캠페인 2종(5,000원 할인 + 키링)을 만든다 — 주차별이 아니라 계속 쓰는 캠페인.
// 손님이 생기면 관리자 화면 캠페인 상세의 "명단으로 추가"에 이름·번호만 넣고 보내면 된다.
// 추가 발행분은 발행일부터 1개월 유효(addCoupons), 문자 문구는 캠페인명 끝의 키링 이름으로 정해진다.
//
//   curl -X POST https://<도메인>/api/keyring-campaigns \
//     -H "authorization: Bearer $WEEKLY_SECRET" -d '{"dryRun":true}'
//
// 같은 이름이 이미 있으면 새로 만들지 않는다(멱등).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeSecret } from "@/lib/issue";
import { WEEKLY_PRESETS, WEEKLY_TITLE, WEEKLY_NOTICE, standingCampaignName } from "@/lib/weekly";

export async function POST(request: Request) {
  if (!authorizeSecret(request)) {
    return NextResponse.json({ ok: false, message: "인증 실패" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const result = [];
  for (const preset of WEEKLY_PRESETS) {
    const name = standingCampaignName(preset);
    let campaign = await prisma.campaign.findFirst({ where: { name } });
    const created = !campaign;
    if (!campaign && !dryRun) {
      campaign = await prisma.campaign.create({
        data: { name, title: WEEKLY_TITLE, notice: WEEKLY_NOTICE, benefit: preset.benefit, kind: "normal", expiresAt: null },
      });
    }
    result.push({
      name,
      benefit: preset.benefit,
      status: created ? (dryRun ? "새로 생성 예정" : "생성") : "이미 있음",
      adminUrl: campaign ? `/admin/campaign/${campaign.id}` : null,
    });
  }
  return NextResponse.json({ ok: true, dryRun, campaigns: result });
}
