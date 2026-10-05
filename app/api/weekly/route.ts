// 주간 정기 발행 API — 명단(이름·번호·키링 종류)을 받아 이번 주 쿠폰을 발급한다.
// 발급만 하고 문자는 보내지 않는다. 실제 발송은 /admin/weekly 화면에서 누른다.
//
//   curl -X POST https://<도메인>/api/weekly \
//     -H "authorization: Bearer $WEEKLY_SECRET" \
//     -H "content-type: application/json" \
//     -d '{"people":[{"name":"남궁연","phone":"010 9897 6928","kinds":["eternity"]}]}'
//
// people 원소의 kinds를 생략하면 2종 모두 발급된다.
// 구형 입력({"phones":[...],"kinds":[...]})도 그대로 받는다.
// dryRun: true 면 아무것도 만들지 않고 계획만 돌려준다.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { couponUrl } from "@/lib/coupon";
import { normalizePhones } from "@/lib/phone";
import { fmtKSTDate } from "@/lib/kst";
import { authorizeSecret, ensureCoupon } from "@/lib/issue";
import {
  WEEKLY_PRESETS,
  WEEKLY_TITLE,
  WEEKLY_NOTICE,
  buildMessage,
  campaignName,
  expiryFrom,
  weekKey,
  type WeeklyPreset,
} from "@/lib/weekly";

const MAX_PEOPLE = 200;

type Target = { phone: string; name: string | null; presets: WeeklyPreset[] };

function pickPresets(kinds: unknown): WeeklyPreset[] {
  if (!Array.isArray(kinds) || kinds.length === 0) return WEEKLY_PRESETS;
  const wanted = kinds.map(String);
  return WEEKLY_PRESETS.filter((p) => wanted.includes(p.key));
}

// people(이름 포함) 또는 phones(번호만) 중 들어온 쪽을 하나의 명단으로 정리한다.
// 같은 번호가 여러 줄에 나오면 종류를 합치고 이름은 먼저 나온 값을 쓴다.
function readTargets(body: Record<string, unknown>): Target[] {
  const topPresets = pickPresets(body.kinds);
  const byPhone = new Map<string, Target>();

  const add = (rawPhone: string, name: string | null, presets: WeeklyPreset[]) => {
    const [phone] = normalizePhones([rawPhone]);
    if (!phone) return;
    const found = byPhone.get(phone);
    if (!found) {
      byPhone.set(phone, { phone, name, presets: [...presets] });
      return;
    }
    if (!found.name && name) found.name = name;
    for (const p of presets) if (!found.presets.some((x) => x.key === p.key)) found.presets.push(p);
  };

  if (Array.isArray(body.people)) {
    for (const raw of body.people) {
      const person = (raw ?? {}) as Record<string, unknown>;
      const name = String(person.name ?? "").trim() || null;
      const presets = person.kinds === undefined ? topPresets : pickPresets(person.kinds);
      add(String(person.phone ?? ""), name, presets);
    }
  } else if (Array.isArray(body.phones)) {
    for (const raw of body.phones) add(String(raw), null, topPresets);
  } else if (typeof body.phones === "string") {
    for (const raw of body.phones.split(/[\s,;]+/)) add(raw, null, topPresets);
  }

  // 발급 순서를 프리셋 정의 순서로 맞춘다(문자 ①②가 항상 같은 순서로 나오도록)
  for (const t of byPhone.values()) {
    t.presets.sort((a, b) => WEEKLY_PRESETS.indexOf(a) - WEEKLY_PRESETS.indexOf(b));
  }
  return [...byPhone.values()];
}

export async function POST(request: Request) {
  if (!authorizeSecret(request)) {
    return NextResponse.json({ ok: false, message: "인증에 실패했습니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = body.dryRun === true;
  const targets = readTargets(body);

  if (targets.length === 0) {
    return NextResponse.json({ ok: false, message: "유효한 전화번호가 없습니다." }, { status: 400 });
  }
  if (targets.length > MAX_PEOPLE) {
    return NextResponse.json({ ok: false, message: `한 번에 최대 ${MAX_PEOPLE}명까지 가능합니다.` }, { status: 400 });
  }
  const noKind = targets.filter((t) => t.presets.length === 0);
  if (noKind.length > 0) {
    const valid = WEEKLY_PRESETS.map((p) => p.key).join(", ");
    return NextResponse.json(
      { ok: false, message: `kinds 값이 올바르지 않습니다: ${noKind.map((t) => t.phone).join(", ")} (가능: ${valid})` },
      { status: 400 },
    );
  }

  const now = new Date();
  const week = weekKey(now);

  // 이번 주 명단에 실제로 등장한 종류만 캠페인을 만든다
  const used = WEEKLY_PRESETS.filter((p) => targets.some((t) => t.presets.some((x) => x.key === p.key)));

  if (dryRun) {
    const existing = await prisma.campaign.findMany({
      where: { name: { in: used.map((p) => campaignName(p, week)) } },
      select: { name: true, expiresAt: true },
    });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      week,
      people: targets.map((t) => ({ name: t.name, phone: t.phone, kinds: t.presets.map((p) => p.key) })),
      campaigns: used.map((p) => {
        const name = campaignName(p, week);
        const found = existing.find((e) => e.name === name);
        return {
          name,
          title: WEEKLY_TITLE,
          benefit: p.benefit,
          status: found ? "기존 캠페인 재사용" : "새로 생성 예정",
          expiresAt: fmtKSTDate(found?.expiresAt ?? expiryFrom(now)),
        };
      }),
    });
  }

  // 이번 주 캠페인 확보 — 같은 주에 다시 실행하면 새로 만들지 않고 재사용한다(멱등).
  const campaigns = new Map<string, { preset: WeeklyPreset; id: string; name: string; expiresAt: Date | null; created: boolean }>();
  for (const preset of used) {
    const name = campaignName(preset, week);
    const found = await prisma.campaign.findFirst({ where: { name } });
    if (found) {
      // 예전에 만들어져 제목·안내가 비었거나 문구가 바뀌었으면 갱신한다
      // (고객 화면에 관리용 이름이 노출되거나 옛 안내가 남지 않도록)
      if (found.title !== WEEKLY_TITLE || found.notice !== WEEKLY_NOTICE) {
        await prisma.campaign.update({
          where: { id: found.id },
          data: { title: WEEKLY_TITLE, notice: WEEKLY_NOTICE },
        });
      }
      campaigns.set(preset.key, { preset, id: found.id, name, expiresAt: found.expiresAt, created: false });
      continue;
    }
    const made = await prisma.campaign.create({
      data: {
        name,
        title: WEEKLY_TITLE,
        notice: WEEKLY_NOTICE,
        benefit: preset.benefit,
        kind: "normal",
        expiresAt: expiryFrom(now),
      },
    });
    campaigns.set(preset.key, { preset, id: made.id, name, expiresAt: made.expiresAt, created: true });
  }

  // 명단별 발급 — 같은 캠페인에 미사용 쿠폰이 이미 있으면 재사용해 중복 발급을 막는다.
  const rows = [];
  let issued = 0;
  let reused = 0;
  for (const target of targets) {
    const items = [];
    for (const preset of target.presets) {
      const campaign = campaigns.get(preset.key)!;
      const { coupon, created } = await ensureCoupon({
        campaignId: campaign.id,
        phone: target.phone,
        name: target.name,
        expiresAt: campaign.expiresAt,
      });
      if (created) issued++;
      else reused++;
      items.push({ kind: preset.key, keyring: preset.keyring, link: couponUrl(coupon.id), code: coupon.code });
    }
    const expiresAt = campaigns.get(target.presets[0].key)!.expiresAt;
    rows.push({
      name: target.name,
      phone: target.phone,
      message: buildMessage(target.name, items, expiresAt),
      items,
    });
  }

  return NextResponse.json({
    ok: true,
    week,
    sendUrl: "/admin/weekly",
    campaigns: [...campaigns.values()].map((c) => ({
      name: c.name,
      title: WEEKLY_TITLE,
      created: c.created,
      expiresAt: fmtKSTDate(c.expiresAt),
      adminUrl: `/admin/campaign/${c.id}`,
    })),
    issued,
    reused,
    rows,
  });
}
