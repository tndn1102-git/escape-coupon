"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addCoupons, type AddResult } from "../../actions";

// 이미 만들어진 캠페인에 쿠폰을 더 발행하는 폼.
// 혜택·안내는 캠페인 것을 그대로 쓰므로 다시 입력받지 않는다.
// 유효기간은 캠페인 만료일이 아니라 "발행일 + 1개월"로 새로 잡힌다(expiresLabel = 그 날짜).
// 캠페인이 무기한이어도 마찬가지 — 추가 발행분은 예외 없이 1개월이다.
export default function AddCoupons({ id, expiresLabel }: { id: string; expiresLabel: string }) {
  const [state, action, pending] = useActionState<AddResult, FormData>(addCoupons, {});
  const [mode, setMode] = useState<"list" | "count">("list");

  const seg = (active: boolean) =>
    `flex-1 nb-btn nb-btn-sm ${active ? "nb-btn-yellow" : "nb-btn-white"}`;

  return (
    <section className="nb-card p-6 space-y-3">
      <div>
        <h2 className="font-extrabold text-[#111]">➕ 쿠폰 추가 발행</h2>
        <p className="text-sm text-slate-600 mt-1">
          이 캠페인에 쿠폰을 더 만듭니다. 혜택·안내는 그대로 적용됩니다.
        </p>
        <p className="mt-2 text-sm font-bold text-[#111]">
          🗓 유효기간은 <span className="nb-tag bg-[#ffd23f]">오늘부터 1개월</span> — {expiresLabel}까지
        </p>
        <p className="text-xs text-slate-500 mt-1">
          캠페인 만료일을 물려받지 않습니다(무기한 캠페인이어도 1개월) — 늦게 받은 분도 한 달을 온전히 씁니다. 발행
          후 쿠폰 목록에서 한 장씩 바꿀 수 있어요.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("list")} className={seg(mode === "list")}>
          명단으로 추가 <span className="font-semibold">(이름+번호)</span>
        </button>
        <button type="button" onClick={() => setMode("count")} className={seg(mode === "count")}>
          수량만 추가 <span className="font-semibold">(번호 없음)</span>
        </button>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="mode" value={mode} />

        {mode === "list" ? (
          <>
            <textarea
              name="people"
              rows={5}
              placeholder={"홍길동 010-1234-5678\n김철수 01098765432\n010-5555-6666"}
              className="nb-input font-mono text-sm resize-y"
            />
            <p className="text-xs text-slate-600 leading-relaxed">
              한 줄에 한 명씩. <b className="text-black">이름을 앞에 쓰면</b> 문자에 「홍길동님」으로 나갑니다. 이름 없이
              번호만 써도 됩니다.
              <br />
              <b className="text-black">같은 사람을 두 줄 쓰면 2장</b> 발급됩니다.
              <br />
              이미 미사용 쿠폰이 있는 번호는 건너뜁니다 — 같은 명단을 다시 넣어도 중복 발급되지 않아요.
            </p>
            <label className="flex items-start gap-2 text-sm font-bold text-[#111] cursor-pointer">
              <input type="checkbox" name="allowExtra" value="1" className="mt-1" />
              <span>
                이미 받은 사람에게도 한 장 더 발급
                <span className="block text-xs font-normal text-slate-600">
                  이벤트에 또 참여한 손님처럼, 기존 쿠폰이 있어도 줄 수만큼 새로 만듭니다.
                </span>
              </span>
            </label>
          </>
        ) : (
          <>
            <input
              type="number"
              name="quantity"
              min={1}
              max={2000}
              defaultValue={10}
              className="nb-input"
            />
            <p className="text-xs text-slate-600 leading-relaxed">
              번호 없는 쿠폰을 이 수량만큼 만듭니다. 발행 후 <b className="text-black">쿠폰 링크 복사</b>로 SNS·현장
              배포에 쓰세요.
            </p>
          </>
        )}

        {state?.error && <p className="text-sm font-bold text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="nb-btn nb-btn-primary w-full">
          {pending ? "발행 중…" : "추가 발행하기"}
        </button>
      </form>

      {state?.added != null && !state.error && (
        <div className="border-2 border-dashed border-black rounded-xl bg-[#fff7e0] p-4 space-y-2">
          <p className="font-extrabold text-black">
            발행 완료 — 새로 {state.added}장
            {state.skipped ? `, 건너뜀 ${state.skipped}장` : ""}
          </p>
          {state.skipped ? (
            <p className="text-xs font-bold text-slate-700">
              건너뛴 건 이미 미사용 쿠폰이 있는 번호예요. 한 장 더 주려면 「이미 받은 사람에게도 한 장 더 발급」을
              체크하고 다시 발행하세요.
            </p>
          ) : null}
          {state.labels && state.labels.length > 0 && (
            <p className="text-xs text-slate-600">{state.labels.join(" · ")}</p>
          )}
          {state.invalid && state.invalid.length > 0 && (
            <p className="text-xs font-bold text-red-600">
              번호를 못 읽어 건너뛴 줄 {state.invalid.length}개: {state.invalid.slice(0, 3).join(" / ")}
              {state.invalid.length > 3 ? " …" : ""}
            </p>
          )}
          <Link href={`/admin/dispatch/${id}`} className="nb-btn nb-btn-sm nb-btn-secondary">
            📨 발송 화면으로
          </Link>
        </div>
      )}
    </section>
  );
}
