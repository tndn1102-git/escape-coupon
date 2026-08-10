"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { copyText } from "@/lib/clipboard";
import { smsHref } from "@/lib/sms";
import { prepareCouponSend } from "../../actions";

// 쿠폰 한 장만 보내는 버튼.
// 번호가 있으면 바로 문자앱을 열고, 없으면 이 자리에서 이름·번호를 받아 저장한 뒤 연다.
// (일괄발송 화면과 달리 한 사람이 여러 장을 갖고 있어도 이 한 장만 나간다)
export default function CouponSend({
  couponId,
  phone,
  message,
}: {
  couponId: string;
  phone: string | null;
  message: string | null; // 번호가 이미 있는 쿠폰만 서버에서 미리 만들어 넘어온다
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  // 플랫폼 판정은 '누른 순간'에 한다 — 렌더 중에 navigator를 읽으면 서버 HTML과 어긋난다.
  function openSms(to: string, body: string) {
    window.location.href = smsHref(to, body, /iPhone|iPad|iPod/.test(navigator.userAgent));
  }

  async function copy() {
    if (!message) return;
    const ok = await copyText(message);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 1500);
  }

  // 번호 없는 쿠폰: 저장 → 서버가 만들어준 본문으로 문자앱 열기
  async function assignAndSend(formData: FormData) {
    setBusy(true);
    setError(null);
    const res = await prepareCouponSend(formData);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh(); // 저장된 번호가 목록·집계에 바로 보이도록
    openSms(res.phone, res.message);
  }

  if (phone && message) {
    return (
      <div className="mt-1.5 flex justify-end gap-1.5">
        <button type="button" onClick={copy} className="nb-btn nb-btn-sm nb-btn-yellow">
          {copied === "ok" ? "복사됨" : copied === "fail" ? "복사 실패" : "복사"}
        </button>
        <button
          type="button"
          onClick={() => openSms(phone, message)}
          className="nb-btn nb-btn-sm nb-btn-secondary"
        >
          📨 문자
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-1.5 flex justify-end">
        <button type="button" onClick={() => setOpen(true)} className="nb-btn nb-btn-sm nb-btn-white">
          + 번호 넣고 보내기
        </button>
      </div>
    );
  }

  return (
    <form
      action={assignAndSend}
      className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-[10px] border-2 border-dashed border-black/25 bg-[#fff7e0] p-2"
    >
      <input type="hidden" name="couponId" value={couponId} />
      <input name="name" placeholder="이름(선택)" className="nb-input w-24 px-2 py-1 text-xs" />
      <input
        name="phone"
        inputMode="numeric"
        placeholder="010-0000-0000"
        className="nb-input w-36 px-2 py-1 text-xs"
      />
      <button disabled={busy} className="nb-btn nb-btn-sm nb-btn-secondary">
        {busy ? "여는 중…" : "📨 보내기"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="nb-btn nb-btn-sm nb-btn-white">
        취소
      </button>
      <p className="w-full text-[11px] font-bold text-slate-500">
        번호는 이 쿠폰에 저장돼요 — 다음부터는 바로 [📨 문자]로 보낼 수 있습니다.
      </p>
      {error && <p className="w-full text-[11px] font-bold text-red-600">{error}</p>}
    </form>
  );
}
