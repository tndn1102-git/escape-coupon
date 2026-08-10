"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { formatPhone } from "@/lib/kst";
import { smsHref } from "@/lib/sms";

export type SendItem = { label: string; link: string; code: string | null };
export type SendRow = {
  phone: string;
  name: string | null;
  message: string;
  items: SendItem[];
  redeemed: number;
  viewed: number;
};

// 발송 목록 — 번호 입력 없이, 이미 발급된 쿠폰을 사람별로 한 통씩 보낸다.
// 주간·생일 등 어떤 캠페인이든 같은 화면을 쓴다.
export default function SendList({ rows }: { rows: SendRow[] }) {
  const [isIOS, setIsIOS] = useState(false);
  const [idx, setIdx] = useState(0); // 일괄발송 진행 위치(다음 보낼 사람)

  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  const next = rows[idx];

  return (
    <div className="space-y-3">
      {next ? (
        <a
          href={smsHref(next.phone, next.message, isIOS)}
          // 이 앵커의 href는 idx에 따라 바뀐다. 클릭 핸들러에서 곧바로 idx를 올리면
          // 리액트가 브라우저의 기본 이동보다 먼저 href를 '다음 사람' 것으로 바꿔버려
          // 1번이 건너뛰어지고 2번이 열린다. 이동이 시작된 뒤로 순번 갱신을 미룬다.
          onClick={() => setTimeout(() => setIdx((i) => i + 1), 0)}
          className="nb-btn nb-btn-primary w-full"
        >
          📨 일괄발송 — {idx + 1}/{rows.length} · {next.name ?? formatPhone(next.phone)}에게 보내기
        </a>
      ) : (
        <div className="w-full text-center border-2 border-black rounded-xl bg-[#4ad7d4] py-3 font-extrabold text-black">
          ✅ {rows.length}명 전체 발송 완료
        </div>
      )}

      <p className="text-xs text-slate-600">
        버튼을 누르면 문자앱이 내용 채워진 채 열립니다. 전송 후 돌아와 같은 버튼을 다시 누르면 다음 사람으로 넘어가요.
        {idx > 0 && (
          <button type="button" onClick={() => setIdx(0)} className="ml-1 underline font-bold">
            처음부터
          </button>
        )}
      </p>

      <div className="space-y-3 pt-1">
        {rows.map((r, i) => (
          <Row key={r.phone} row={r} href={smsHref(r.phone, r.message, isIOS)} done={i < idx} current={i === idx} />
        ))}
      </div>

      <p className="text-xs text-slate-500 pt-1">
        ※ 회색 말풍선을 누르면 문자 전문이 펼쳐집니다. PC에서는 [복사] 후 붙여넣어 쓰세요.
      </p>
    </div>
  );
}

function Row({ row, href, done, current }: { row: SendRow; href: string; done?: boolean; current?: boolean }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [open, setOpen] = useState(false);

  async function copy() {
    const ok = await copyText(row.message);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className={`nb-card-sm p-3 ${done ? "opacity-50" : ""} ${current ? "border-[#ff5d8f]" : ""}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <span className="font-extrabold text-black">
            {done ? "✓ " : ""}
            {row.name ?? "이름 없음"}
          </span>
          <span className="ml-2 text-xs font-bold text-slate-500">{formatPhone(row.phone)}</span>
        </div>
        {row.redeemed > 0 ? (
          <span className="nb-tag bg-[#ff5d8f] text-white shrink-0">사용 {row.redeemed}</span>
        ) : row.viewed > 0 ? (
          <span className="nb-tag shrink-0">열람</span>
        ) : row.items.length > 1 ? (
          <span className="nb-tag bg-[#ffd23f] shrink-0">{row.items.length}장 · 한 통</span>
        ) : (
          <span className="nb-tag bg-white text-slate-400 shrink-0">미열람</span>
        )}
      </div>

      <p className="text-xs font-bold text-slate-600 mt-1.5">🎟 {row.items.map((it) => it.label).join(" + ")}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`mt-2 w-full text-left bg-[#fff7e0] border-2 border-dashed border-black rounded-lg px-3 py-2 text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap ${
          open ? "" : "max-h-16 overflow-hidden"
        }`}
      >
        {row.message}
      </button>

      <div className="flex gap-2 justify-end mt-2">
        <button onClick={copy} className="nb-btn nb-btn-sm nb-btn-yellow">
          {copied === "ok" ? "복사됨" : copied === "fail" ? "복사 실패" : "복사"}
        </button>
        <a href={href} className="nb-btn nb-btn-sm nb-btn-secondary">
          문자 보내기
        </a>
      </div>
    </div>
  );
}
