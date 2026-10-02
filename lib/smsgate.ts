// 안드로이드 폰 SMS 게이트웨이(SMSGate 앱, sms-gate.app) — 매장 폰이 문자를 대신 보낸다.
// 서버는 클라우드 API 큐에 넣기만 하고, 실제 전송 속도는 폰 앱의 "메시지 간 지연" 설정이 조절한다.
// 환경변수 SMSGATE_LOGIN / SMSGATE_PASSWORD(앱 Cloud 모드 계정)가 있어야 켜진다.

const API = "https://api.sms-gate.app/3rdparty/v1/messages";

export function gatewayConfigured() {
  return Boolean(process.env.SMSGATE_LOGIN && process.env.SMSGATE_PASSWORD);
}

// 저장된 번호는 숫자만(01012345678) — 게이트웨이는 E.164(+8210…)를 요구한다
function e164(phone: string) {
  return phone.startsWith("0") ? `+82${phone.slice(1)}` : `+${phone}`;
}

// 문자 1건을 게이트웨이 큐에 넣고 메시지 id를 돌려준다. 실패는 throw.
export async function gatewaySend(phone: string, text: string): Promise<string> {
  const login = process.env.SMSGATE_LOGIN;
  const password = process.env.SMSGATE_PASSWORD;
  if (!login || !password) throw new Error("게이트웨이가 설정되지 않았습니다. (SMSGATE_LOGIN/PASSWORD)");

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
    },
    body: JSON.stringify({
      textMessage: { text },
      phoneNumbers: [e164(phone)],
      // 폰이 꺼져 있는 등으로 하루 안에 못 보내면 폐기 — 며칠 지난 문자가 뒤늦게 나가는 사고 방지
      ttl: 86400,
      // 도착 보고를 받아야 "전송 결과 확인"에서 Delivered(상대 폰 도착)까지 구분된다
      withDeliveryReport: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`게이트웨이 오류 ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? "";
}

export type GatewayState = "Pending" | "Processed" | "Sent" | "Delivered" | "Failed";

// 큐에 넣은 문자 1건의 현재 상태. 폰이 실제로 보냈는지(Sent/Delivered), 실패했는지(Failed)와 실패 사유.
// 통신사가 잠깐 막으면(RESULT_ERROR_NO_SERVICE) 큐에선 Failed로 끝나고 자동 재시도는 없다 — 그래서 서버가 확인해 되돌려야 한다.
export async function gatewayMessageState(id: string): Promise<{ state: GatewayState; error: string | null }> {
  const login = process.env.SMSGATE_LOGIN;
  const password = process.env.SMSGATE_PASSWORD;
  if (!login || !password) throw new Error("게이트웨이가 설정되지 않았습니다. (SMSGATE_LOGIN/PASSWORD)");

  const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`게이트웨이 오류 ${res.status}`);
  const data = (await res.json()) as { state?: GatewayState; recipients?: { error?: string | null }[] };
  const error = data.recipients?.find((r) => r.error)?.error ?? null;
  return { state: data.state ?? "Pending", error };
}
