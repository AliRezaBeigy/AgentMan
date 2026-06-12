export function getMaxRowIndexFromKeys(keys: string[]): number {
  let max = 0
  for (const key of keys) {
    const match = key.match(/^Row (\d+) -/)
    if (match) max = Math.max(max, Number.parseInt(match[1], 10))
  }
  return max
}

export function extractRowFieldKeys(keys: string[]): string[] {
  return keys.filter((k) => /^Row \d+ -/.test(k))
}

export function expandCompositeFieldValues(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const expanded = { ...obj }

  const first = String(expanded.firstName ?? expanded.first_name ?? "").trim()
  const last = String(expanded.lastName ?? expanded.last_name ?? "").trim()
  const full = `${first} ${last}`.trim()

  if (full) {
    if (expanded["Contact name"] === undefined) expanded["Contact name"] = full
    if (expanded.fullName === undefined) expanded.fullName = full
    if (expanded.name === undefined) expanded.name = full
  }

  if (expanded.company === undefined && expanded.organization !== undefined) {
    expanded.company = expanded.organization
  }

  if (expanded.phone === undefined && expanded.tel !== undefined) {
    expanded.phone = expanded.tel
  }

  if (expanded["Lead source"] === undefined && expanded.source !== undefined) {
    expanded["Lead source"] = expanded.source
  }

  if (expanded.Priority === undefined && expanded.priority !== undefined) {
    expanded.Priority = expanded.priority
  }

  return expanded
}
