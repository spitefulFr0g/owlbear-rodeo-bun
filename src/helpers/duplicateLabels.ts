/** Allocate image labels using only the scene labels visible to this person. */
export function duplicateLabels(labels: string[], visibleLabels: string[]): string[] {
  const taken = new Map<string, Set<string>>();
  const parse = (label: string) => /^(.* )([0-9]+)$/.exec(label);
  for (const label of visibleLabels) {
    const match = parse(label);
    if (!match) continue;
    const numbers = taken.get(match[1]) || new Set<string>();
    numbers.add(BigInt(match[2]).toString());
    taken.set(match[1], numbers);
  }
  return labels.map((label) => {
    const match = parse(label);
    if (!match) return label;
    const stem = match[1];
    const numbers = taken.get(stem) || new Set<string>();
    let number = BigInt(match[2]) + BigInt(1);
    while (numbers.has(number.toString())) number += BigInt(1);
    numbers.add(number.toString());
    taken.set(stem, numbers);
    return stem + number.toString();
  });
}
