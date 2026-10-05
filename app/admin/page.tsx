import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { STORES } from "@/lib/coupon";
import { fmtKSTDateTime } from "@/lib/restrict";
import { birthdayCampaignName, monthKey, monthLabel } from "@/lib/birthday";
import { adminLogout, cancelRedemption } from "./actions";
import CampaignForm from "./CampaignForm";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireAuth("admin");

  const month = monthKey();
  const [total, redeemed, byStore, campaigns, recent, birthday] = await Promise.all([
    prisma.coupon.count(),
    prisma.coupon.count({ where: { status: "redeemed" } }),
    prisma.coupon.groupBy({
      by: ["storeId"],
      where: { status: "redeemed" },
      _count: true,
    }),
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      // 캠페인은 자동 삭제하지 않으므로 상한 없이 전부 보여준다(목록에서 사라지면 안 된다는 사용자 지시).
      include: {
        _count: { select: { coupons: true } },
        coupons: {
          where: { OR: [{ status: "redeemed" }, { NOT: { viewedAt: null } }] },
          select: { status: true, viewedAt: true },
        },
      },
    }),
    prisma.coupon.findMany({
      where: { status: "redeemed" },
      orderBy: { redeemedAt: "desc" },
      take: 8,
      include: { campaign: { select: { name: true, benefit: true } }, store: true },
    }),
    // 이번 달 생일 캠페인이 있으면 발송 화면으로 바로 갈 수 있게 한다
    prisma.campaign.findFirst({
      where: { name: birthdayCampaignName(month) },
      select: { id: true, _count: { select: { coupons: true } } },
    }),
  ]);

  const storeCount = (id: number) =>
    byStore.find((s) => s.storeId === id)?._count ?? 0;

  const timeFmt = fmtKSTDateTime;

  return (
    <main className="min-h-screen bg-[#fff7e0] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-[#111]">관리자 대시보드</h1>
          <form action={adminLogout}>
            <button className="nb-btn nb-btn-sm nb-btn-white">로그아웃</button>
          </form>
        </header>

        {/* 전체 현황 */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="총 발급" value={total} />
          <Stat label="사용 완료" value={redeemed} accent="text-[#ff5d8f]" />
          <Stat label="미사용" value={total - redeemed} accent="text-[#111]" />
        </section>

        {/* 호점별 사용 */}
        <section className="nb-card p-6">
          <h2 className="font-extrabold text-[#111] mb-3">호점별 사용 현황</h2>
          <div className="grid grid-cols-3 gap-4">
            {STORES.map((s) => (
              <div key={s.id} className="nb-card-sm p-3 text-center">
                <div className="text-2xl font-extrabold text-[#111]">{storeCount(s.id)}</div>
                <div className="text-sm text-slate-600">{s.name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 실시간 최근 사용 (기능10) */}
        <section className="nb-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-[#111]">최근 사용 내역</h2>
            <AutoRefresh />
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">아직 사용된 쿠폰이 없습니다.</p>
          ) : (
            <div className="divide-y-2 divide-black/10">
              {recent.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-bold text-[#111] truncate">
                      {c.benefitOverride ?? c.campaign.benefit}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.store?.name ?? "-"}
                      {c.redeemedTheme ? ` · ${c.redeemedTheme}` : ""}
                      {c.redeemedPeople ? ` · ${c.redeemedPeople}인` : ""} · {timeFmt(c.redeemedAt)}
                    </div>
                  </div>
                  <form action={cancelRedemption}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="nb-btn nb-btn-sm nb-btn-white font-bold text-red-600 shrink-0 ml-2">사용 취소</button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 정기 발행분 발송 — 번호 입력 없이 바로 보내는 화면 */}
        <section className={`grid gap-3 ${birthday ? "sm:grid-cols-2" : ""}`}>
          <Link href="/admin/weekly" className="nb-btn nb-btn-primary w-full text-center text-lg py-5">
            📨 이번 주 발송
          </Link>
          {birthday && (
            <Link
              href={`/admin/dispatch/${birthday.id}`}
              className="nb-btn nb-btn-yellow w-full text-center text-lg py-5"
            >
              🎂 {monthLabel(month)}월 생일 발송 ({birthday._count.coupons})
            </Link>
          )}
        </section>

        {/* 빠른 메뉴 */}
        <section className="grid grid-cols-2 gap-3">
          <Link href="/admin/send" className="nb-btn nb-btn-secondary w-full text-center">
            📩 문자로 쿠폰 보내기
          </Link>
          <Link href="/admin/refer" className="nb-btn nb-btn-primary w-full text-center">
            🤝 친구 추천 관리
          </Link>
          <Link href="/admin/themes" className="nb-btn nb-btn-dark w-full text-center">
            🚪 테마(방) 관리
          </Link>
          <span className="nb-card-sm flex items-center justify-center text-center py-4 font-extrabold text-slate-500">
            매장 3곳 운영 중
          </span>
        </section>

        <CampaignForm />

        {/* 캠페인 목록 */}
        <section className="space-y-3">
          <h2 className="font-extrabold text-[#111]">캠페인 목록</h2>
          {campaigns.length === 0 && (
            <p className="text-sm text-slate-500">아직 발행한 캠페인이 없습니다.</p>
          )}
          {campaigns.map((c) => {
            const viewedCount = c.coupons.filter((x) => x.viewedAt).length;
            const redeemedCount = c.coupons.filter((x) => x.status === "redeemed").length;
            return (
              <Link
                key={c.id}
                href={`/admin/campaign/${c.id}`}
                className="nb-card-sm block p-4 transition hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-[#111]">{c.name}</div>
                    <div className="text-sm text-slate-600">{c.benefit}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-[#111] font-bold">
                      👁 {viewedCount} · 사용 {redeemedCount}/{c._count.coupons}
                    </div>
                    <div className="text-slate-500">
                      {c.expiresAt
                        ? `~${new Date(c.expiresAt).toLocaleDateString("ko-KR")}`
                        : "무기한"}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, accent = "text-[#111]" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="nb-card-sm p-5 text-center">
      <div className={`text-3xl font-extrabold ${accent}`}>{value}</div>
      <div className="text-sm text-slate-600 mt-1">{label}</div>
    </div>
  );
}
