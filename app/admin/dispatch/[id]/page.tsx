import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { couponUrl } from "@/lib/coupon";
import { fmtKSTDate, toKST } from "@/lib/kst";
import { messageForCampaign } from "@/lib/message";
import { gatewayConfigured } from "@/lib/smsgate";
import { presetByCampaignName } from "@/lib/weekly";
import SendList, { type SendRow } from "../../SendList";

export const dynamic = "force-dynamic";

// 캠페인 하나의 발급분을 사람별로 묶어 보내는 화면.
// 번호를 다시 입력하지 않는다 — 발행 때 지정된 번호를 그대로 쓴다.
export default async function DispatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth("admin");
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      title: true,
      benefit: true,
      expiresAt: true,
      coupons: {
        where: { sentTo: { not: null } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          viewedAt: true,
          sentTo: true,
          sentName: true,
          expiresAt: true,
          gwSentAt: true,
        },
      },
    },
  });
  if (!campaign) notFound();

  const preset = presetByCampaignName(campaign.name);

  // "9/2 14:32" — 자동발송 배지용 짧은 시각
  const fmtShort = (d: Date) => {
    const k = toKST(d);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(
      k.getUTCMinutes(),
    ).padStart(2, "0")}`;
  };

  const grouped = new Map<string, SendRow>();
  for (const c of campaign.coupons) {
    const phone = c.sentTo!;
    const row =
      grouped.get(phone) ??
      ({ phone, name: c.sentName, message: "", items: [], redeemed: 0, viewed: 0, autoSent: null } as SendRow);
    row.items.push({ label: preset?.keyring ?? campaign.benefit, link: couponUrl(c.id), code: c.code });
    if (!row.name && c.sentName) row.name = c.sentName;
    if (c.status === "redeemed") row.redeemed++;
    if (c.viewedAt) row.viewed++;
    if (c.gwSentAt) row.autoSent = fmtShort(c.gwSentAt);
    row.message = messageForCampaign(campaign, row.name, row.items, c.expiresAt);
    grouped.set(phone, row);
  }
  const rows = [...grouped.values()];

  return (
    <main className="min-h-screen bg-[#fff7e0] p-6">
      <div className="max-w-xl mx-auto space-y-5">
        <Link href={`/admin/campaign/${campaign.id}`} className="text-sm font-bold text-slate-700 hover:text-black">
          ← 캠페인
        </Link>

        <header>
          <h1 className="text-2xl font-extrabold text-black">{campaign.title ?? campaign.name}</h1>
          <p className="text-sm font-bold text-slate-600 mt-1">
            {campaign.name} · {rows.length}명 / 쿠폰 {campaign.coupons.length}장
            {campaign.expiresAt ? ` · 사용기한 ~ ${fmtKSTDate(campaign.expiresAt)}` : ""}
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="nb-card p-6 space-y-2">
            <p className="font-extrabold text-black">번호가 지정된 쿠폰이 없습니다.</p>
            <p className="text-sm text-slate-600">
              이 캠페인은 번호 없이 발급된 쿠폰만 있습니다.{" "}
              <Link href="/admin/send" className="underline font-bold">
                문자로 쿠폰 보내기
              </Link>
              에서 번호를 입력해 보내세요.
            </p>
          </div>
        ) : (
          <SendList rows={rows} campaignId={campaign.id} gatewayOn={gatewayConfigured()} />
        )}
      </div>
    </main>
  );
}
