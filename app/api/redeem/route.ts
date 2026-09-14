import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthed, getStaffStore, touchStaffSession } from "@/lib/auth";
import { extractToken } from "@/lib/coupon";
import { checkTimeRule } from "@/lib/restrict";

export async function POST(request: Request) {
  if (!(await isAuthed("staff"))) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  const storeId = await getStaffStore();
  if (!storeId) {
    return NextResponse.json({ ok: false, message: "호점 정보가 없습니다." }, { status: 400 });
  }
  await touchStaffSession();

  const body = await request.json().catch(() => ({}));
  const raw = String(body.token ?? "");
  const token = extractToken(raw);
  const people: number | null = body.people != null ? Number(body.people) : null;
  const theme: string | null = body.theme ? String(body.theme) : null;

  if (!token) {
    return NextResponse.json({ ok: false, message: "잘못된 코드입니다." }, { status: 400 });
  }

  // QR/링크면 토큰(id)으로, 직원이 손으로 친 짧은 코드면 code로 조회
  let coupon = await prisma.coupon.findUnique({
    where: { id: token },
    include: { campaign: true, store: true },
  });
  if (!coupon) {
    const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code) {
      coupon = await prisma.coupon.findUnique({
        where: { code },
        include: { campaign: true, store: true },
      });
    }
  }

  if (!coupon) {
    return NextResponse.json({ ok: false, message: "존재하지 않는 쿠폰입니다." });
  }
  const benefit = coupon.benefitOverride ?? coupon.campaign.benefit;

  // 이미 사용된 쿠폰 — 직원이 "방금 처리된 건지, 예전에 쓴 건지" 구분할 수 있게 시각·호점을 같이 준다
  const alreadyUsed = (c: { redeemedAt: Date | null; store: { name: string } | null }) =>
    NextResponse.json({
      ok: false,
      used: true,
      message: "이미 사용된 쿠폰입니다",
      redeemedAt: c.redeemedAt?.toISOString() ?? null,
      redeemedStore: c.store?.name ?? null,
      benefit,
    });

  if (coupon.status === "redeemed") {
    return alreadyUsed(coupon);
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, message: "유효기간이 만료된 쿠폰입니다." });
  }

  // 기능7: 시간·요일 제한
  const timeError = checkTimeRule(coupon.campaign);
  if (timeError) return NextResponse.json({ ok: false, message: timeError, benefit });

  // 추가 입력이 필요한지 판단 (기능8 인원, 기능5 사용 테마)
  const needPeople = coupon.campaign.minPeople > 1 && people == null;
  const needTheme = !!coupon.excludeTheme && !theme;
  if (needPeople || needTheme) {
    const themes = needTheme
      ? (await prisma.theme.findMany({ orderBy: { name: "asc" } }))
          .map((t) => t.name)
          .filter((n) => n !== coupon.excludeTheme)
      : undefined;
    return NextResponse.json({
      ok: false,
      need: { people: needPeople, theme: needTheme },
      minPeople: coupon.campaign.minPeople,
      excludeTheme: coupon.excludeTheme,
      themes,
      benefit,
      message: "사용 정보를 입력하세요.",
    });
  }

  // 기능8: 인원 검증
  if (coupon.campaign.minPeople > 1 && (people ?? 0) < coupon.campaign.minPeople) {
    return NextResponse.json({
      ok: false,
      message: `${coupon.campaign.minPeople}인 이상부터 사용 가능합니다. (입력: ${people}인)`,
      benefit,
    });
  }
  // 기능5: 이미 플레이한 테마에는 사용 불가
  if (coupon.excludeTheme && theme === coupon.excludeTheme) {
    return NextResponse.json({
      ok: false,
      message: `'${coupon.excludeTheme}' 테마는 이미 플레이하셔서 이 쿠폰을 쓸 수 없습니다.`,
      benefit,
    });
  }

  // 원자적 사용 처리 — status가 'issued'인 경우에만 갱신(동시 스캔 방어)
  const result = await prisma.coupon.updateMany({
    where: { id: coupon.id, status: "issued" },
    data: {
      status: "redeemed",
      redeemedAt: new Date(),
      storeId,
      redeemedTheme: theme,
      redeemedPeople: people,
    },
  });
  if (result.count === 0) {
    // 동시 스캔에서 한발 늦은 요청 — 먼저 처리된 기록을 다시 읽어 시각을 보여준다
    const used = await prisma.coupon.findUnique({
      where: { id: coupon.id },
      select: { redeemedAt: true, store: { select: { name: true } } },
    });
    return alreadyUsed(used ?? { redeemedAt: null, store: null });
  }

  // 기능10: 활동 로그
  await prisma.log.create({
    data: {
      type: "redeem",
      storeId,
      detail: `${benefit}${theme ? ` · ${theme}` : ""}${people ? ` · ${people}인` : ""}`,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "사용 처리 완료",
    benefit,
    campaign: coupon.campaign.name,
  });
}
