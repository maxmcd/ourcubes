export const key = (x: number, y: number, z: number) => x + y * 20 + z * 400;

export function unpack(packed: [number, string][]) {
    const map = new Map<number, string>();
    for (const [k, hex] of packed) map.set(k, hex);
    return map;
}

export function unpackKey(k: number): [number, number, number] {
    const x = k % 20;
    const y = Math.floor(k / 20) % 20;
    const z = Math.floor(k / 400);
    return [x, y, z];
}
