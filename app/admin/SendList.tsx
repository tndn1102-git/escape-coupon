"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { formatPhone } from "@/lib/kst";
import { smsHref } from "@/lib/sms";
import { autoSendPerson, testGatewaySend } from "./actions";

export type SendItem = { label: string; link: string; code: string | null };
export type SendRow = {
  phone: string;
  name: string | null;
  message: string;
  items: SendItem[];
  redeemed: number;
  viewed: number;
  autoSent?: string | null; // 폰 게이트웨이 자동발송 시각 라벨 ("9/2 14:32"), 미발송이면 null
};

// 발송 목록 — 번호 입력 없이, 이미 발급된 쿠폰을 사람별로 한 통씩 보낸다.
// 주간·생일 등 어떤 캠페인이든 같은 화면을 쓴다.
// campaignId + gatewayOn이 오면(캠페인 발송 화면) 폰 게이트웨이 자동발송 카드가 붙는다.
// 주간 화면은 한 사람이 여러 캠페인 쿠폰을 한 통으로 받아 캠페인 단위 발송이 안 맞으므로 수동 그대로.
export default function SendList({
  rows,
  campaignId,
  gatewayOn,
}: {
  rows: SendRow[];
  campaignId?: string;
  gatewayOn?: boolean;
}) {
  const [isIOS, setIsIOS] = useState(false);
  const [idx, setIdx] = useState(0); // 일괄발송 진행 위치(다음 보낼 사람)

  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  const next = rows[idx];

  return (
    <div className="space-y-3">
      {gatewayOn && campaignId && <AutoSend campaignId={campaignId} rows={rows} />}

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

// 폰 게이트웨이 자동발송 — 매장 안드로이드 폰(SMSGate 앱)이 문자를 대신 보낸다.
// 여기서는 서버 큐에 넣기만 하고, 실제 전송 간격은 폰 앱의 지연 설정이 조절한다.
function AutoSend({ campaignId, rows }: { campaignId: string; rows: SendRow[] }) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "running" | "done">("idle");
  const [sentNow, setSentNow] = useState<Record<string, true>>({}); // 이번 세션에서 성공한 번호
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pos, setPos] = useState(0);
  const [total, setTotal] = useState(0);
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const pending = rows.filter((r) => !r.autoSent && !sentNow[r.phone]);
  const failed = rows.filter((r) => errors[r.phone]);

  async function run(targets: SendRow[]) {
    setPhase("running");
    setErrors({});
    setTotal(targets.length);
    for (let i = 0; i < targets.length; i++) {
      setPos(i + 1);
      const fd = new FormData();
      fd.set("campaignId", campaignId);
      fd.set("phone", targets[i].phone);
      try {
        const res = await autoSendPerson(fd);
        if (res.ok) setSentNow((s) => ({ ...s, [targets[i].phone]: true }));
        else setErrors((e) => ({ ...e, [targets[i].phone]: res.error }));
      } catch {
        setErrors((e) => ({ ...e, [targets[i].phone]: "네트워크 오류 — 다시 시도해 주세요." }));
      }
    }
    setPhase("done");
  }

  async function test() {
    setTesting(true);
    setTestMsg(null);
    const fd = new FormData();
    fd.set("phone", testPhone);
    try {
      const res = await testGatewaySend(fd);
      setTestMsg(res.ok ? "✅ 큐에 넣었습니다 — 잠시 후 그 번호로 문자가 오는지 확인하세요." : `❌ ${res.error}`);
    } catch {
      setTestMsg("❌ 네트워크 오류");
    }
    setTesting(false);
  }

  return (
    <div className="nb-card-sm p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-extrabold text-black">📡 자동발송</span>
        <span className="text-xs font-bold text-slate-500">매장 폰이 순서대로 전송 · 남은 {pending.length}명</span>
      </div>

      {phase === "idle" && pending.length > 0 && (
        <button type="button" onClick={() => setPhase("confirm")} className="nb-btn nb-btn-secondary w-full">
          📡 {pending.length}명 전체 자동발송
        </button>
      )}
      {phase === "idle" && pending.length === 0 && (
        <p className="text-xs font-bold text-slate-600">✅ 전원 자동발송 완료 (또는 보낼 대상 없음)</p>
      )}

      {phase === "confirm" && (
        <div className="flex gap-2">
          <button type="button" onClick={() => run(pending)} className="nb-btn nb-btn-primary flex-1">
            정말 {pending.length}명에게 보내기
          </button>
          <button type="button" onClick={() => setPhase("idle")} className="nb-btn flex-1">
            취소
          </button>
        </div>
      )}

      {phase === "running" && (
        <p className="text-sm font-extrabold text-black">
          큐에 넣는 중… {pos}/{total}
        </p>
      )}

      {phase === "done" && (
        <div className="space-y-1">
          <p className="text-sm font-extrabold text-black">
            ✅ {total - failed.length}명 큐 등록 완료{failed.length > 0 ? ` · ❌ 실패 ${failed.length}명` : ""}
          </p>
          <p className="text-xs text-slate-600">
            폰이 설정된 간격으로 하나씩 전송합니다. 폰 화면(SMSGate 앱)에서 진행 상황을 볼 수 있어요.
          </p>
          {failed.length > 0 && (
            <>
              <ul className="text-xs text-slate-700 list-disc pl-4">
                {failed.map((r) => (
                  <li key={r.phone}>
                    <b>{r.name ?? formatPhone(r.phone)}</b> — {errors[r.phone]}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => run(failed)} className="nb-btn nb-btn-sm nb-btn-yellow">
                실패한 {failed.length}명만 재시도
              </button>
            </>
          )}
        </div>
      )}

      <details className="text-xs">
        <summary className="font-bold text-slate-500 cursor-pointer">게이트웨이 연결 테스트</summary>
        <div className="flex gap-2 mt-2">
          <input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="내 번호 (010…)"
            inputMode="numeric"
            className="nb-input"
            style={{ width: "auto", flex: 1, minWidth: 0 }}
          />
          <button type="button" onClick={test} disabled={testing} className="nb-btn nb-btn-sm shrink-0">
            {testing ? "…" : "테스트 발송"}
          </button>
        </div>
        {testMsg && <p className="mt-1 font-bold text-slate-700">{testMsg}</p>}
      </details>
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
        {row.autoSent && (
          <span className="nb-tag shrink-0" style={{ background: "#c7f0d8" }}>
            📡 {row.autoSent}
          </span>
        )}
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
