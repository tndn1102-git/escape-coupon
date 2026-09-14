"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { fmtKSTFull } from "@/lib/restrict";

// "3분 전" 같은 상대 표기 — 1시간 넘은 건 날짜만으로 충분해 생략
function agoLabel(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "방금 전";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return "";
}

type Need = { people: boolean; theme: boolean };
type Result = {
  ok: boolean;
  message: string;
  benefit?: string;
  campaign?: string;
  need?: Need;
  minPeople?: number;
  excludeTheme?: string;
  themes?: string[];
  needLogin?: boolean;
  used?: boolean;
  redeemedAt?: string | null;
  redeemedStore?: string | null;
};

export default function Scanner() {
  const containerId = "qr-reader";
  const qrRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState("");

  // 추가 입력 단계 상태
  const [pending, setPending] = useState<(Result & { token: string }) | null>(null);
  const [people, setPeople] = useState(1);
  const [theme, setTheme] = useState("");

  async function redeem(token: string, opts?: { people?: number; theme?: string }) {
    busyRef.current = true;
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...opts }),
      });
      const data: Result = await res.json();
      if (res.status === 401) {
        // 세션이 풀린 것 — 쿠폰 문제가 아니니 호점 재선택 길을 열어준다
        setPending(null);
        setResult({
          ok: false,
          needLogin: true,
          message: "로그인이 풀렸습니다. 호점을 다시 선택해 주세요.",
        });
      } else if (data.need) {
        // 인원/테마 입력 필요
        setPending({ ...data, token });
        setPeople(data.minPeople ?? 1);
        setTheme(data.themes?.[0] ?? "");
        setResult(null);
      } else {
        setPending(null);
        setResult(data);
      }
    } catch {
      setResult({ ok: false, message: "처리 중 오류가 발생했습니다." });
    } finally {
      busyRef.current = false;
    }
  }

  function confirmExtra() {
    if (!pending) return;
    const opts: { people?: number; theme?: string } = {};
    if (pending.need?.people) opts.people = people;
    if (pending.need?.theme) opts.theme = theme;
    redeem(pending.token, opts);
  }

  async function startCamera() {
    setResult(null);
    setPending(null);
    busyRef.current = false;
    const qr = new Html5Qrcode(containerId);
    qrRef.current = qr;
    try {
      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          // 한 번 비출 때 같은 QR이 연달아 읽힌다. await 전에 막아야 두 번째 요청이
          // 첫 요청의 "사용 처리 완료"를 "이미 사용됨"으로 덮어쓰지 않는다.
          if (busyRef.current) return;
          busyRef.current = true;
          await qr.pause(true);
          await redeem(decoded);
        },
        () => {}
      );
      setScanning(true);
    } catch {
      setResult({ ok: false, message: "카메라를 시작할 수 없습니다. 권한을 확인하세요." });
    }
  }

  async function stopCamera() {
    const qr = qrRef.current;
    if (qr) {
      try {
        await qr.stop();
        await qr.clear();
      } catch {}
      qrRef.current = null;
    }
    setScanning(false);
  }

  async function scanNext() {
    setResult(null);
    setPending(null);
    busyRef.current = false;
    const qr = qrRef.current;
    if (qr) {
      try {
        await qr.resume();
      } catch {
        await startCamera();
      }
    } else {
      await startCamera();
    }
  }

  useEffect(() => {
    return () => {
      qrRef.current?.stop().catch(() => {});
    };
  }, []);

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.trim()) return;
    busyRef.current = false;
    await redeem(manual.trim());
    setManual("");
  }

  return (
    <div className="space-y-4">
      <div id={containerId} className="aspect-square w-full overflow-hidden rounded-2xl border-2 border-black bg-black/5" />

      {!scanning && (
        <button onClick={startCamera} className="nb-btn nb-btn-secondary w-full">
          카메라로 스캔 시작
        </button>
      )}
      {scanning && (
        <button onClick={stopCamera} className="nb-btn nb-btn-white w-full">
          카메라 끄기
        </button>
      )}

      {/* 추가 입력 단계 (인원/테마) */}
      {pending && (
        <div className="nb-card space-y-3">
          <div className="nb-banner bg-[#ffd23f] text-[#111] font-extrabold">{pending.benefit}</div>
          {pending.need?.people && (
            <label className="block">
              <span className="text-sm font-bold text-[#111]">인원수 (최소 {pending.minPeople}인)</span>
              <input
                type="number"
                min={1}
                value={people}
                onChange={(e) => setPeople(Number(e.target.value))}
                className="nb-input mt-1 w-full"
              />
            </label>
          )}
          {pending.need?.theme && (
            <label className="block">
              <span className="text-sm font-bold text-[#111]">
                이번에 플레이하는 테마 {pending.excludeTheme ? `('${pending.excludeTheme}' 제외)` : ""}
              </span>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="nb-input mt-1 w-full"
              >
                {(pending.themes ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={confirmExtra} className="nb-btn nb-btn-primary w-full">
            사용 처리하기
          </button>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className={`rounded-2xl border-2 border-black p-5 text-center ${result.ok ? "bg-[#4ad7d4]" : "bg-[#ff5d8f]"}`}>
          <div className="text-5xl font-extrabold text-[#111]">
            {result.ok ? "✓" : "✕"}
          </div>
          <div className="mt-1 font-extrabold text-[#111]">{result.message}</div>
          {result.used && (
            <div className="mt-2 rounded-xl border-2 border-black bg-white px-3 py-2 text-[#111]">
              <div className="text-xs font-bold">사용 시각</div>
              {/* 날짜가 "오후 / 03:32"로 끊기지 않게 한 줄 고정, 상대시각은 아래 줄로 */}
              <div className="font-extrabold whitespace-nowrap">
                {result.redeemedAt ? fmtKSTFull(result.redeemedAt) : "기록 없음"}
              </div>
              {result.redeemedAt && agoLabel(result.redeemedAt) && (
                <div className="text-sm font-extrabold">{agoLabel(result.redeemedAt)} 처리됨</div>
              )}
              {result.redeemedStore && <div className="text-sm font-bold">{result.redeemedStore}</div>}
            </div>
          )}
          {result.benefit && <div className="mt-1 font-bold text-[#111]">{result.benefit}</div>}
          {result.needLogin ? (
            <a href="/staff/login" className="nb-btn nb-btn-dark w-full mt-4 text-center">
              호점 다시 선택하기
            </a>
          ) : (
            <button onClick={scanNext} className="nb-btn nb-btn-dark w-full mt-4">
              다음 쿠폰 스캔
            </button>
          )}
        </div>
      )}

      {/* 수동 입력 */}
      <form onSubmit={submitManual} className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="QR이 안 될 때: 코드 6자리 입력 (예: ABC123)"
          className="nb-input flex-1 text-sm"
        />
        <button className="nb-btn nb-btn-sm nb-btn-dark">확인</button>
      </form>
    </div>
  );
}
