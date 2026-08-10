import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { couponUrl } from "@/lib/coupon";
import { fmtKSTDateTime, fmtKSTFull } from "@/lib/restrict";
import { messageForCampaign } from "@/lib/message";
import { presetByCampaignName } from "@/lib/weekly";
import { deleteCampaign, updateExpiry, updateCouponExpiry } from "../../actions";
import AddCoupons from "./AddCoupons";
import CouponSend from "./CouponSend";
import CopyBox from "./CopyBox";
import RefreshButton from "./RefreshButton";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth("admin");
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    // 한 번에 발행한 쿠폰은 createdAt이 같아 정렬이 매번 뒤바뀐다 → id로 동점을 끊어
    // 순서를 고정한다. 그래야 "#2의 기간을 바꿨다"가 새로고침 후에도 같은 줄을 가리킨다.
    include: {
      coupons: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { store: true } },
    },
  });
  if (!campaign) notFound();

  const links = campaign.coupons.map((c) => couponUrl(c.id));
  const total = campaign.coupons.length;
  const sent = campaign.coupons.filter((c) => c.sentTo).length;
  const viewed = campaign.coupons.filter((c) => c.viewedAt).length;
  const redeemed = campaign.coupons.filter((c) => c.status === "redeemed").length;

  // 개별 발송용 문자 본문 — 번호가 이미 있는 쿠폰만 미리 만들어 둔다(누르면 바로 열리게).
  // 번호 없는 쿠폰은 번호를 받은 뒤에야 "○○님" 인사를 넣을 수 있어 서버 액션에서 만든다.
  const preset = presetByCampaignName(campaign.name);
  const sendLabel = preset?.keyring ?? campaign.benefit;
  const messages = new Map(
    campaign.coupons
      .filter((c) => c.sentTo)
      .map((c) => [
        c.id,
        messageForCampaign(campaign, c.sentName, [{ label: sendLabel, link: couponUrl(c.id) }], c.expiresAt),
      ]),
  );

  return (
    <main className="min-h-screen bg-[#fff7e0] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/admin" className="nb-btn nb-btn-sm nb-btn-white">
          ← 대시보드
        </Link>

        <header className="nb-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-[#111]">{campaign.name}</h1>
              <p className="text-slate-600 mt-1">{campaign.benefit}</p>
              <p className="text-sm text-slate-500 mt-2">
                {campaign.expiresAt
                  ? `유효기간 ~ ${new Date(campaign.expiresAt).toLocaleDateString("ko-KR")}`
                  : "유효기간 무기한"}{" "}
                · {redeemed}/{campaign.coupons.length} 사용
              </p>
            </div>
            <form action={deleteCampaign}>
              <input type="hidden" name="id" value={campaign.id} />
              <button className="nb-btn nb-btn-sm nb-btn-white font-bold text-red-600">캠페인 삭제</button>
            </form>
          </div>

          {/* 발행된 쿠폰 전체의 유효기간 일괄 변경 — 한 장만 바꾸는 건 아래 쿠폰 목록에서 */}
          <form action={updateExpiry} className="mt-4 flex flex-wrap items-center gap-2 border-t-2 border-black/10 pt-4">
            <input type="hidden" name="id" value={campaign.id} />
            <label className="text-sm font-bold text-slate-600">전체 일괄 변경</label>
            <input
              type="date"
              name="expiresAt"
              defaultValue={toDateInput(campaign.expiresAt)}
              className="nb-input px-3 py-1.5 text-sm"
            />
            <button className="nb-btn nb-btn-sm nb-btn-white font-bold">적용</button>
            <span className="w-full text-xs text-slate-400">
              비우고 적용하면 무기한 · 발행된 쿠폰 {total}장에 모두 반영됩니다.
              <br />
              <strong className="text-[#ff5d8f]">⚠️ 아래에서 한 장씩 따로 지정한 기간도 전부 덮어씁니다</strong> — 한 명만
              연장하려면 쿠폰 목록에서 그 쿠폰의 기간 칩을 누르세요.
            </span>
          </form>
        </header>

        {/* 발송 → 열람 → 사용 현황 한눈에 */}
        <section className="nb-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-[#111]">발송·열람 현황</h2>
            <RefreshButton />
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Funnel label="발급" value={total} />
            <Funnel label="번호지정" value={sent} sub="발송 대상" />
            <Funnel label="열람" value={viewed} sub="링크 확인" accent="text-[#4ad7d4]" />
            <Funnel label="사용" value={redeemed} accent="text-[#ff5d8f]" />
          </div>
          <p className="text-xs text-slate-500">
            ※ ‘번호지정’은 받는 사람이 정해진 쿠폰 수일 뿐, <strong>전송 여부가 아닙니다</strong> — 문자는 사장님 폰에서 직접 보내는 방식이라 실제 전달은 ‘열람’으로 확인하세요. ‘열람’은 받는 분이 쿠폰 링크를 연 횟수 기준입니다(관리자 미리보기는 제외).
          </p>
        </section>

        {/* 이 화면엔 발송 기능이 없다 — 어디서 보내는지 길을 열어둔다 */}
        <section className="nb-card-sm p-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-600">문자 보내기 →</span>
          {sent > 0 ? (
            <Link href={`/admin/dispatch/${campaign.id}`} className="nb-btn nb-btn-sm nb-btn-primary">
              📨 이 캠페인 발송 ({sent}장)
            </Link>
          ) : (
            <Link href="/admin/send" className="nb-btn nb-btn-sm nb-btn-secondary">
              📩 번호 입력해서 보내기
            </Link>
          )}
        </section>

        <AddCoupons id={campaign.id} />

        <section className="nb-card p-6">
          <CopyBox links={links} />
        </section>

        <section className="nb-card p-6">
          <h2 className="font-extrabold text-[#111] mb-1">쿠폰 목록</h2>
          <p className="text-xs text-slate-400 mb-3">
            기간 칩(🗓)을 누르면 <strong>그 쿠폰 한 장의 유효기간만</strong> 바꿀 수 있어요.
          </p>
          <div className="divide-y-2 divide-black/10">
            {campaign.coupons.map((c, i) => (
              <div key={c.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/c/${c.id}`}
                    target="_blank"
                    className="text-slate-700 hover:underline truncate min-w-0 flex-1"
                  >
                    #{i + 1} {c.sentTo ? `→ ${c.sentTo}` : <span className="font-mono">{c.id}</span>}
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* 열람 여부 */}
                    {c.viewedAt ? (
                      <span className="nb-tag bg-[#4ad7d4]" title={`${c.viewCount}회 열람`}>
                        👁 열람 {fmtKSTDateTime(c.viewedAt)}
                      </span>
                    ) : (
                      <span className="nb-tag bg-white text-slate-400">미열람</span>
                    )}
                    {/* 사용 여부 — 언제·어디서 처리됐는지 바로 보이게 */}
                    {c.status === "redeemed" ? (
                      <span
                        className="nb-tag bg-[#ff5d8f] text-white"
                        title={redeemDetail(c.redeemedAt, c.redeemedTheme, c.redeemedPeople)}
                      >
                        사용됨 · {c.redeemedAt ? fmtKSTDateTime(c.redeemedAt) : "시각 미기록"}
                        {c.store?.name ? ` · ${c.store.name}` : ""}
                      </span>
                    ) : (
                      <span className="nb-tag bg-[#ffd23f]">미사용</span>
                    )}
                  </div>
                </div>

                {/* 이 쿠폰만의 유효기간 — 칩을 누르면 그 자리에서 날짜 입력이 열린다(JS 없이 details로) */}
                <ExpiryCell coupon={c} />

                {/* 이 쿠폰 한 장만 문자로 보내기 */}
                <CouponSend couponId={c.id} phone={c.sentTo} message={messages.get(c.id) ?? null} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

// 쿠폰 한 장의 유효기간 칩 + 펼치면 나오는 개별 변경 폼.
// 클라이언트 JS 없이 <details>로 접었다 펴서, 목록이 길어져도 화면이 안 무너지게 한다.
function ExpiryCell({ coupon }: { coupon: { id: string; expiresAt: Date | null } }) {
  const exp = coupon.expiresAt;
  const now = new Date();
  const expired = exp != null && new Date(exp) < now;
  // 만료 임박(7일 이내)이면 노랑으로 눈에 띄게 — 연장 대상 쿠폰을 목록에서 바로 골라낼 수 있다
  const soon =
    exp != null && !expired && new Date(exp).getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;

  // ⚠️ 색은 inline style로 준다. globals.css의 .nb-tag가 레이어 밖(unlayered)이라
  // Tailwind의 bg-* 유틸(@layer utilities)이 절대 못 이긴다 — className으로 주면 전부 민트색이 된다.
  const chip = expired
    ? { background: "#ff5d8f", color: "#fff" }
    : soon
      ? { background: "#ffd23f" }
      : exp
        ? { background: "#fff" }
        : { background: "#fff", color: "#94a3b8" };

  return (
    <details className="mt-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-bold text-slate-500">유효기간</span>
        <span className="nb-tag" style={chip} title="눌러서 이 쿠폰만 기간 변경">
          🗓 {expiryLabel(exp, expired)} ▾
        </span>
      </summary>
      <form
        action={updateCouponExpiry}
        className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-[10px] border-2 border-dashed border-black/25 bg-[#fff7e0] p-2"
      >
        <input type="hidden" name="couponId" value={coupon.id} />
        <input
          type="date"
          name="expiresAt"
          defaultValue={toDateInput(exp)}
          className="nb-input w-auto px-2 py-1 text-xs"
        />
        <button className="nb-btn nb-btn-sm nb-btn-dark">저장</button>
        <button name="clear" value="1" className="nb-btn nb-btn-sm nb-btn-white">
          무기한
        </button>
      </form>
    </details>
  );
}

// 만료일 칩 문구. 저장값이 서버 UTC 23:59:59라 toDateInput과 같은 UTC 파트로 뽑아야
// 관리자가 입력한 날짜와 화면에 보이는 날짜가 어긋나지 않는다.
function expiryLabel(d: Date | null, expired: boolean) {
  if (!d) return "무기한";
  const dt = new Date(d);
  const text = `${dt.getUTCMonth() + 1}. ${dt.getUTCDate()}.`;
  return expired ? `만료됨 ${text}` : `~ ${text}`;
}

// 사용 처리 배지의 마우스오버 설명 — 연도·요일까지 정확한 시각과 사용 상황
function redeemDetail(at: Date | null, theme: string | null, people: number | null) {
  const parts = [at ? `사용 처리 ${fmtKSTFull(at)}` : "사용 처리 시각이 기록되지 않은 쿠폰입니다"];
  if (theme) parts.push(`테마: ${theme}`);
  if (people) parts.push(`인원: ${people}명`);
  return parts.join(" / ");
}

// 저장된 만료일(서버 UTC 기준 23:59:59)을 date input용 YYYY-MM-DD로 되돌린다.
// updateExpiry/createCampaign이 `raw + "T23:59:59"`로 만들므로 UTC 파트로 뽑아야 값이 왕복 일치한다.
function toDateInput(d: Date | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Funnel({
  label,
  value,
  sub,
  accent = "text-[#111]",
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="nb-card-sm p-3">
      <div className={`text-2xl font-extrabold ${accent}`}>{value}</div>
      <div className="text-xs font-bold text-slate-600">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
