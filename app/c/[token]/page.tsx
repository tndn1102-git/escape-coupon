import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { couponUrl } from "@/lib/coupon";
import { restrictionText, fmtKSTFull } from "@/lib/restrict";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CouponPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const coupon = await prisma.coupon.findUnique({
    where: { id: token },
    include: { campaign: true, store: true },
  });

  if (!coupon) {
    return (
      <Centered>
        <p className="font-bold text-black">존재하지 않는 쿠폰입니다.</p>
      </Centered>
    );
  }

  // 열람 기록 — 받는 사람이 링크를 열었을 때만(관리자/직원 본인 미리보기는 제외)
  const internal = (await isAuthed("admin")) || (await isAuthed("staff"));
  if (!internal) {
    await prisma.coupon
      .update({
        where: { id: coupon.id },
        data: { viewCount: { increment: 1 }, viewedAt: coupon.viewedAt ?? new Date() },
      })
      .catch(() => {});
  }

  const expired = coupon.expiresAt != null && new Date(coupon.expiresAt) < new Date();
  const used = coupon.status === "redeemed";
  const valid = !used && !expired;
  const benefit = coupon.benefitOverride ?? coupon.campaign.benefit;
  const restriction = restrictionText(coupon.campaign);
  const isReview = coupon.campaign.kind === "review" && coupon.campaign.reviewUrl;

  const qr = valid ? await QRCode.toDataURL(couponUrl(coupon.id), { width: 320, margin: 1 }) : null;

  return (
    <Centered>
      <div className="w-full max-w-sm nb-card overflow-hidden">
        <div className="nb-banner text-center py-6 px-6">
          {/* 고객에겐 title(브랜드 문구)을 보여준다. 없으면 관리용 이름으로 대체 */}
          <p className="text-sm font-bold">{coupon.campaign.title ?? coupon.campaign.name}</p>
          <h1 className="text-2xl font-extrabold mt-1">{benefit}</h1>
          {restriction && <p className="text-xs font-bold mt-2">{restriction} 사용 가능</p>}
          {coupon.excludeTheme && (
            <p className="text-xs font-bold mt-1">‘{coupon.excludeTheme}’ 테마 외 다른 테마에서 사용</p>
          )}
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          {isReview && valid && (
            <div className="w-full nb-card-sm p-4 text-center space-y-2">
              <p className="text-sm text-black font-bold">리뷰를 남기고 직원에게 보여주세요!</p>
              <a
                href={coupon.campaign.reviewUrl!}
                target="_blank"
                className="nb-btn nb-btn-yellow nb-btn-sm inline-block"
              >
                ⭐ 리뷰 작성하러 가기
              </a>
            </div>
          )}

          {valid && qr && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="쿠폰 QR" className="w-56 h-56" />
              <p className="text-sm font-bold text-black text-center">매장 직원에게 이 QR을 보여주세요.</p>
              {coupon.code && (
                <div className="w-full nb-card-sm py-3 text-center">
                  <p className="text-xs font-bold text-slate-500">QR이 안 될 때 직원에게 코드를 불러주세요</p>
                  <p className="mt-1 text-3xl font-extrabold tracking-[0.3em] text-black font-mono">
                    {coupon.code}
                  </p>
                </div>
              )}
            </>
          )}

          {used && (
            <div className="w-full space-y-2">
              <Badge color="bg-[#4ad7d4] text-black">
                이미 사용된 쿠폰입니다{coupon.store ? ` (${coupon.store.name})` : ""}
              </Badge>
              {/* 언제 사용 처리됐는지 — 문의가 오면 이 한 줄로 확인된다 */}
              <p className="text-center text-sm font-bold text-slate-600">
                {coupon.redeemedAt ? `${fmtKSTFull(coupon.redeemedAt)} 사용 처리` : "사용 처리 시각 미기록"}
                {coupon.redeemedTheme ? ` · ${coupon.redeemedTheme}` : ""}
                {coupon.redeemedPeople ? ` · ${coupon.redeemedPeople}인` : ""}
              </p>
            </div>
          )}
          {!used && expired && <Badge color="bg-[#ff5d8f] text-black">유효기간이 만료되었습니다</Badge>}

          {/* 캠페인별 안내 — 수령처·기한 주의 등. 문자에만 있으면 링크를 다시 연 고객이 못 본다. */}
          {coupon.campaign.notice && (
            <div className="w-full nb-card-sm p-3 space-y-1">
              {coupon.campaign.notice.split("\n").map((line, i) => (
                <p key={i} className="text-xs font-bold text-slate-700 leading-relaxed">
                  ※ {line}
                </p>
              ))}
            </div>
          )}

          <div className="w-full border-t-2 border-dashed border-black pt-4 text-center">
            <p className="text-xs font-bold text-black">
              {coupon.expiresAt
                ? `유효기간 ~ ${new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}`
                : "유효기간 무기한"}
            </p>
          </div>
        </div>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#fff7e0] p-6">{children}</main>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className={`w-full text-center border-2 border-black rounded-full py-4 font-extrabold ${color}`}>
      {children}
    </div>
  );
}
