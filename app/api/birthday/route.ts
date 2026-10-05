// 월간 생일축하 쿠폰 발행 API — 생일자 명단을 받아 그 달 캠페인에 1인 1장씩 발급한다.
// 발급만 하고 문자는 보내지 않는다. 실제 발송은 /admin/dispatch/[id] 화면에서 누른다.
//
//   curl -X POST https://<도메인>/api/birthday \
//     -H "authorization: Bearer $WEEKLY_SECRET" \
//     -H "content-type: application/json; charset=utf-8" \
//     --data-binary @people.json
//
// body: {"people":[{"name":"홍길동","phone":"010 1234 5678"}], "month":"2026-08", "dryRun":false}
// month를 생략하면 KST 기준 이번 달. 여러 호점 명단을 나눠 보내도 같은 캠페인에 합쳐진다.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { couponUrl } from "@/lib/coupon";
import { normalizePhones } from "@/lib/phone";
import { fmtKSTDate } from "@/lib/kst";
import { authorizeSecret, ensureCoupon } from "@/lib/issue";
import {
  BIRTHDAY_BENEFIT,
  birthdayCampaignName,
  birthdayNotice,
  birthdayTitle,
  buildBirthdayMessage,
  monthEnd,
  monthKey,
} from "@/lib/birthday";

const MAX_PEOPLE = 500;

type Target = { phone: string; name: string | null };

// 같은 번호가 여러 호점 명단에 겹쳐 나오면 한 명으로 합친다(이름은 먼저 나온 값).
function readTargets(body: Record<string, unknown>): Target[] {
  const byPhone = new Map<string, Target>();
  const list = Array.isArray(body.people) ? body.people : [];
  for (const raw of list) {
    const person = (raw ?? {}) as Record<string, unknown>;
    const [phone] = normalizePhones([String(person.phone ?? "")]);
    if (!phone) continue;
    const name = String(person.name ?? "").trim() || null;
    const found = byPhone.get(phone);
    if (!found) byPhone.set(phone, { phone, name });
    else if (!found.name && name) found.name = name;
  }
  return [...byPhone.values()];
}

export async function POST(request: Request) {
  if (!authorizeSecret(request)) {
    return NextResponse.json({ ok: false, message: "인증에 실패했습니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = body.dryRun === true;
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : monthKey();
  const targets = readTargets(body);

  if (targets.length === 0) {
    return NextResponse.json({ ok: false, message: "유효한 전화번호가 없습니다." }, { status: 400 });
  }
  if (targets.length > MAX_PEOPLE) {
    return NextResponse.json({ ok: false, message: `한 번에 최대 ${MAX_PEOPLE}명까지 가능합니다.` }, { status: 400 });
  }

  const name = birthdayCampaignName(month);
  const title = birthdayTitle(month);
  const notice = birthdayNotice(month);
  const expiresAt = monthEnd(month);

  if (dryRun) {
    const found = await prisma.campaign.findFirst({ where: { name }, select: { id: true } });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      month,
      campaign: {
        name,
        title,
        benefit: BIRTHDAY_BENEFIT,
        status: found ? "기존 캠페인 재사용" : "새로 생성 예정",
        expiresAt: fmtKSTDate(expiresAt),
      },
      people: targets,
    });
  }

  // 그 달 캠페인 확보 — 다시 실행하면 새로 만들지 않고 재사용한다(멱등).
  let campaign = await prisma.campaign.findFirst({ where: { name } });
  const created = !campaign;
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: { name, title, notice, benefit: BIRTHDAY_BENEFIT, kind: "normal", expiresAt },
    });
  } else if (campaign.title !== title || campaign.notice !== notice) {
    // 문구가 바뀌었으면 갱신 — 이미 발급된 쿠폰 화면에도 그대로 반영된다
    campaign = await prisma.campaign.update({ where: { id: campaign.id }, data: { title, notice } });
  }

  const rows = [];
  let issued = 0;
  let reused = 0;
  for (const target of targets) {
    const { coupon, created: isNew } = await ensureCoupon({
      campaignId: campaign.id,
      phone: target.phone,
      name: target.name,
      expiresAt: campaign.expiresAt,
    });
    if (isNew) issued++;
    else reused++;
    const link = couponUrl(coupon.id);
    rows.push({
      name: target.name,
      phone: target.phone,
      message: buildBirthdayMessage(target.name, link, month, campaign.expiresAt),
      link,
      code: coupon.code,
    });
  }

  return NextResponse.json({
    ok: true,
    month,
    campaign: { name, title, created, expiresAt: fmtKSTDate(campaign.expiresAt) },
    sendUrl: `/admin/dispatch/${campaign.id}`,
    issued,
    reused,
    rows,
  });
}
