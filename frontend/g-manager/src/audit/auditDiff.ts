export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export const absent = Symbol('absent')
export type ChangeValue = JsonValue | typeof absent
export type Snapshot = { kind: 'missing'; raw: ''; value: typeof absent }
  | { kind: 'json'; raw: string; value: JsonValue }
  | { kind: 'text'; raw: string; value: string }
export interface AuditChange { path: string; label: string; before: ChangeValue; after: ChangeValue }
export interface JsonLine { text: string; path: string }

export function parseSnapshot(raw: string | null): Snapshot {
  if (raw == null || !raw.trim()) return { kind: 'missing', raw: '', value: absent }
  try { return { kind: 'json', raw, value: JSON.parse(raw) as JsonValue } }
  catch { return { kind: 'text', raw, value: raw } }
}
function object(value: ChangeValue): value is { [key: string]: JsonValue } {
  return value !== absent && value !== null && typeof value === 'object' && !Array.isArray(value)
}
function pointer(key: string) { return key.replaceAll('~', '~0').replaceAll('/', '~1') }

export function compareSnapshots(before: Snapshot, after: Snapshot): { changes: AuditChange[]; limited: boolean } {
  const changes: AuditChange[] = []
  let visited = 0
  function walk(left: ChangeValue, right: ChangeValue, path: string, label: string, depth: number) {
    if (++visited > 2000 || depth > 24) throw new Error('Comparison limit')
    if (left === right) return
    if ((object(left) && (object(right) || right === absent)) || (object(right) && left === absent)) {
      const keys = [...new Set([...Object.keys(object(left) ? left : {}), ...Object.keys(object(right) ? right : {})])]
      if (keys.length) {
        for (const key of keys) walk(object(left) && Object.hasOwn(left, key) ? left[key] : absent,
          object(right) && Object.hasOwn(right, key) ? right[key] : absent,
          `${path}/${pointer(key)}`, `${label ? `${label} › ` : ''}${key}`, depth + 1)
        return
      }
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let index = 0; index < Math.max(left.length, right.length); index++) {
        walk(index < left.length ? left[index] : absent, index < right.length ? right[index] : absent,
          `${path}/${index}`, `${label || 'Niz'}[${index}]`, depth + 1)
      }
      return
    }
    // Empty objects compare equal; missing keys and explicit null remain distinct.
    if (object(left) && object(right) && !Object.keys(left).length && !Object.keys(right).length) return
    changes.push({ path, label: label || 'Celo stanje', before: left, after: right })
  }
  if (before.kind === 'text' || after.kind === 'text') {
    if (before.raw !== after.raw || before.kind !== after.kind) changes.push({ path: '', label: 'Ceo zapis (tekst)', before: before.value, after: after.value })
    return { changes, limited: false }
  }
  try { walk(before.value, after.value, '', '', 0); return { changes, limited: false } }
  catch { return { changes: [], limited: true } }
}
export function changeText(value: ChangeValue): string {
  if (value === absent) return 'Nije zabeleženo'
  try { return JSON.stringify(value, null, 2) }
  catch { return 'Pogledajte kompletno stanje.' }
}

export function snapshotLines(snapshot: Snapshot): JsonLine[] | null {
  if (snapshot.kind !== 'json') return null
  const lines: JsonLine[] = []
  function render(value: JsonValue, path: string, depth: number, prefix = '', comma = '') {
    if (lines.length > 3000 || depth > 24) throw new Error('Rendering limit')
    const indent = '  '.repeat(depth)
    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
      const array = Array.isArray(value)
      const entries: [string, JsonValue][] = Array.isArray(value)
        ? value.map((entry, index): [string, JsonValue] => [String(index), entry]) : Object.entries(value)
      if (!entries.length) { lines.push({ path, text: `${indent}${prefix}${array ? '[]' : '{}'}${comma}` }); return }
      lines.push({ path, text: `${indent}${prefix}${array ? '[' : '{'}` })
      entries.forEach(([key, entry], index) => render(entry, `${path}/${pointer(key)}`, depth + 1,
        array ? '' : `${JSON.stringify(key)}: `, index + 1 < entries.length ? ',' : ''))
      lines.push({ path, text: `${indent}${array ? ']' : '}'}${comma}` })
    } else lines.push({ path, text: `${indent}${prefix}${JSON.stringify(value)}${comma}` })
  }
  try { render(snapshot.value, '', 0); return lines }
  catch { return null }
}
