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
      withDeliveryReport: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`게이트웨이 오류 ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? "";
}
