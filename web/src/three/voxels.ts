export const key = (x: number, y: number, z: number) => x + y * 20 + z * 400;

export function unpack(packed: [number, string][] | [number, string, number][]) {
    const map = new Map<number, string>();
    for (const entry of packed) {
        // Handle both old format [k, hex] and new format [k, hex, timestamp]
        const [k, hex] = entry;
        map.set(k, hex);
    }
    return map;
}

export function unpackKey(k: number): [number, number, number] {
    const x = k % 20;
    const y = Math.floor(k / 20) % 20;
    const z = Math.floor(k / 400);
    return [x, y, z];
}
