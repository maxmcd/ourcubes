import { describe, expect, it } from "vitest";
import { key, unpack, unpackKey } from "./voxels.js";

describe("Voxel Coordinate Functions", () => {
    describe("key function", () => {
        it("should generate correct keys for corner coordinates", () => {
            // Test corner cases
            expect(key(0, 0, 0)).toBe(0);
            expect(key(19, 0, 0)).toBe(19);
            expect(key(0, 19, 0)).toBe(19 * 20); // 380
            expect(key(0, 0, 19)).toBe(19 * 400); // 7600
            expect(key(19, 19, 19)).toBe(19 + 19 * 20 + 19 * 400); // 7999
        });

        it("should generate unique keys for different coordinates", () => {
            const coords = [
                [0, 0, 0],
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
                [10, 5, 8],
                [5, 10, 3],
                [8, 3, 15],
            ];

            const keys = coords.map(([x, y, z]) => key(x, y, z));
            const uniqueKeys = new Set(keys);

            expect(uniqueKeys.size).toBe(keys.length);
        });

        it("should generate keys within valid range", () => {
            // Test various coordinates within bounds
            for (let x = 0; x < 20; x += 5) {
                for (let y = 0; y < 20; y += 5) {
                    for (let z = 0; z < 20; z += 5) {
                        const k = key(x, y, z);
                        expect(k).toBeGreaterThanOrEqual(0);
                        expect(k).toBeLessThan(8000); // 20^3 = 8000
                    }
                }
            }
        });

        it("should follow the formula x + y*20 + z*400", () => {
            expect(key(5, 3, 2)).toBe(5 + 3 * 20 + 2 * 400); // 5 + 60 + 800 = 865
            expect(key(10, 15, 7)).toBe(10 + 15 * 20 + 7 * 400); // 10 + 300 + 2800 = 3110
        });
    });

    describe("unpackKey function", () => {
        it("should correctly unpack keys to coordinates", () => {
            // Test corner cases
            expect(unpackKey(0)).toEqual([0, 0, 0]);
            expect(unpackKey(19)).toEqual([19, 0, 0]);
            expect(unpackKey(380)).toEqual([0, 19, 0]); // 19 * 20
            expect(unpackKey(7600)).toEqual([0, 0, 19]); // 19 * 400
            expect(unpackKey(7999)).toEqual([19, 19, 19]); // Max key
        });

        it("should be inverse of key function", () => {
            // Test round-trip conversion for various coordinates
            const testCoords = [
                [0, 0, 0],
                [5, 10, 15],
                [19, 19, 19],
                [1, 2, 3],
                [10, 5, 8],
                [3, 15, 12],
            ];

            testCoords.forEach(([x, y, z]) => {
                const k = key(x, y, z);
                const [unpackedX, unpackedY, unpackedZ] = unpackKey(k);
                expect(unpackedX).toBe(x);
                expect(unpackedY).toBe(y);
                expect(unpackedZ).toBe(z);
            });
        });

        it("should handle edge cases", () => {
            // Test specific known values
            const k = key(5, 3, 2); // 5 + 60 + 800 = 865
            const [x, y, z] = unpackKey(k);
            expect(x).toBe(5);
            expect(y).toBe(3);
            expect(z).toBe(2);
        });

        it("should return coordinates within valid bounds", () => {
            // Test a range of keys
            for (let k = 0; k < 8000; k += 127) {
                // Step by prime to get good coverage
                const [x, y, z] = unpackKey(k);
                expect(x).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThan(20);
                expect(y).toBeGreaterThanOrEqual(0);
                expect(y).toBeLessThan(20);
                expect(z).toBeGreaterThanOrEqual(0);
                expect(z).toBeLessThan(20);
            }
        });
    });

    describe("unpack function", () => {
        it("should convert packed state to Map", () => {
            const packed: [number, string][] = [
                [0, "#FF0000"],
                [100, "#00FF00"],
                [7999, "#0000FF"],
            ];

            const map = unpack(packed);

            expect(map).toBeInstanceOf(Map);
            expect(map.size).toBe(3);
            expect(map.get(0)).toBe("#FF0000");
            expect(map.get(100)).toBe("#00FF00");
            expect(map.get(7999)).toBe("#0000FF");
        });

        it("should handle empty packed state", () => {
            const packed: [number, string][] = [];
            const map = unpack(packed);

            expect(map).toBeInstanceOf(Map);
            expect(map.size).toBe(0);
        });

        it("should preserve all entries from packed state", () => {
            const packed: [number, string][] = [];
            const colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF"];

            // Generate test data
            for (let i = 0; i < colors.length; i++) {
                packed.push([i * 100, colors[i]]);
            }

            const map = unpack(packed);

            expect(map.size).toBe(colors.length);
            packed.forEach(([key, color]) => {
                expect(map.get(key)).toBe(color);
            });
        });

        it("should handle duplicate keys by keeping last value", () => {
            const packed: [number, string][] = [
                [100, "#FF0000"],
                [100, "#00FF00"], // This should overwrite the previous
                [200, "#0000FF"],
            ];

            const map = unpack(packed);

            expect(map.size).toBe(2); // Only 2 unique keys
            expect(map.get(100)).toBe("#00FF00"); // Last value wins
            expect(map.get(200)).toBe("#0000FF");
        });
    });

    describe("Coordinate system consistency", () => {
        it("should maintain right-handed coordinate system properties", () => {
            // Test that coordinates increase in the expected directions
            // x increases from left to right
            expect(key(1, 0, 0)).toBeGreaterThan(key(0, 0, 0));

            // y increases from bottom to top
            expect(key(0, 1, 0)).toBeGreaterThan(key(0, 0, 0));

            // z increases from near to far
            expect(key(0, 0, 1)).toBeGreaterThan(key(0, 0, 0));
        });

        it("should handle boundary conditions correctly", () => {
            // Test max coordinate values
            const maxKey = key(19, 19, 19);
            expect(maxKey).toBe(7999); // 19^3 * powers

            const [x, y, z] = unpackKey(maxKey);
            expect(x).toBe(19);
            expect(y).toBe(19);
            expect(z).toBe(19);
        });
    });
});
