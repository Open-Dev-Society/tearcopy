import { describe, expect, it } from "vitest";
import { mergeLineRects, type Box } from "./geometry";

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe("mergeLineRects", () => {
  it("merges fragments that sit on the same visual line", () => {
    const merged = mergeLineRects([
      box(10, 10, 40, 20),
      box(52, 11, 30, 18),
      box(90, 9, 24, 22),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].left).toBe(10);
    expect(merged[0].right).toBe(114);
    expect(merged[0].top).toBe(9);
    expect(merged[0].bottom).toBe(31);
  });

  it("keeps wrapped lines apart", () => {
    const merged = mergeLineRects([
      box(10, 10, 80, 20),
      box(10, 34, 60, 20),
      box(10, 58, 40, 20),
    ]);
    expect(merged.map((line) => line.top)).toEqual([10, 34, 58]);
  });

  it("drops zero-width and zero-height rects", () => {
    const merged = mergeLineRects([
      box(10, 10, 0, 20),
      box(10, 10, 40, 0),
      box(12, 10, 30, 20),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].left).toBe(12);
    expect(merged[0].width).toBe(30);
  });

  it("sorts fragments into reading order before merging", () => {
    const merged = mergeLineRects([
      box(10, 40, 40, 20),
      box(70, 8, 20, 20),
      box(10, 10, 40, 18),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].top).toBe(8);
    expect(merged[0].right).toBe(90);
    expect(merged[1].top).toBe(40);
  });

  it("returns nothing for an empty list", () => {
    expect(mergeLineRects([])).toEqual([]);
  });
});
