/** 房间码归一化：去空白、转大写，作为 Room 的唯一键 */
export function normalizeCode(code: string): string {
  return String(code || '').trim().toUpperCase()
}
