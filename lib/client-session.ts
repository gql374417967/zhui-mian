const sessionKey = "zhui-mian:client-session";

// 供 API 限流识别同一浏览器会话，不包含任何用户身份信息。
export function clientSessionId() {
  if (typeof window === "undefined") return "";
  try {
    const saved = localStorage.getItem(sessionKey);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(sessionKey, id);
    return id;
  } catch {
    return "";
  }
}
