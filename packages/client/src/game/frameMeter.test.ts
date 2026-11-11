import { describe, expect, it } from "vitest";
import { createFrameMeter } from "./frameMeter.ts";

describe("счётчик кадров", () => {
  it("без кадров показывает нули", () => {
    expect(createFrameMeter().stats()).toEqual({ fps: 0, minFps: 0, worstFrameMs: 0 });
  });

  it("ровные 60 кадров в секунду", () => {
    const meter = createFrameMeter();
    for (let i = 0; i < 120; i += 1) {
      meter.add(1000 / 60);
    }
    expect(meter.stats()).toEqual({ fps: 60, minFps: 60, worstFrameMs: 17 });
  });

  it("один долгий кадр виден в наименьшей частоте", () => {
    const meter = createFrameMeter();
    for (let i = 0; i < 59; i += 1) {
      meter.add(16);
    }
    meter.add(56);
    expect(meter.stats()).toEqual({ fps: 60, minFps: 18, worstFrameMs: 56 });
  });

  it("долгий кадр забывается через три секунды", () => {
    const meter = createFrameMeter();
    meter.add(100);
    for (let i = 0; i < 149; i += 1) {
      meter.add(20);
    }
    expect(meter.stats().worstFrameMs).toBe(100);
    meter.add(20);
    expect(meter.stats()).toEqual({ fps: 50, minFps: 50, worstFrameMs: 20 });
  });

  it("не принимает нулевую и отрицательную длительность", () => {
    const meter = createFrameMeter();
    meter.add(0);
    meter.add(-5);
    meter.add(Number.NaN);
    expect(meter.stats().fps).toBe(0);
  });

  it("кадр длиннее окна остаётся единственным", () => {
    const meter = createFrameMeter();
    meter.add(16);
    meter.add(5000);
    expect(meter.stats()).toEqual({ fps: 0, minFps: 0, worstFrameMs: 5000 });
  });
});
