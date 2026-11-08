import { expect, test, type Page } from "@playwright/test";

async function selectText(page: Page, selector: string, scroll = true) {
  await page.evaluate(
    ({ target, scroll: shouldScroll }) => {
      const element = document.querySelector(target);
      if (!element) throw new Error(`Missing ${target}`);
      if (shouldScroll) element.scrollIntoView({ block: "center", inline: "nearest" });
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    { target: selector, scroll },
  );
}

async function copySelection(page: Page) {
  await page.keyboard.press("Control+C");
}

test.beforeEach(async ({ page, context, browserName }) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.goto("/");
  await expect(page.locator("#sentence")).toBeVisible();
});

test("a real copy tears the selection and then clears the overlay", async ({ page }) => {
  await selectText(page, "#sentence");
  const expected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  await page.evaluate(() => {
    document.addEventListener(
      "copy",
      (event) => {
        (window as unknown as { __prevented: string }).__prevented = String(event.defaultPrevented);
      },
      { once: true },
    );
  });
  const beforeHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const beforeText = await page.locator("#sentence").textContent();
  await copySelection(page);

  const strip = page.locator("[data-tearcopy-strip]");
  await expect(strip).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Copied 1 line.");
  const overlay = await page.locator("[data-tearcopy-layer]").evaluate((element) => ({
    hidden: element.getAttribute("aria-hidden"),
    events: getComputedStyle(element).pointerEvents,
    inert: (element as HTMLElement).inert,
  }));
  expect(overlay).toEqual({ hidden: "true", events: "none", inert: true });
  expect(await page.evaluate(() => (window as unknown as { __prevented?: string }).__prevented)).toBe("false");
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(beforeHeight);
  expect(await page.locator("#sentence").textContent()).toBe(beforeText);

  await expect(page.locator("[data-tearcopy-layer]")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator("[data-tearcopy-style]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-tearcopy-hide-selection"))).toBe(false);
  expect(expected.length).toBeGreaterThan(10);
});

test("clipboard keeps the selected text", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard reads are granted in Chromium.");
  await selectText(page, "#sentence");
  const expected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  await copySelection(page);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
});

test("wrapped lines become one scrap each", async ({ page }) => {
  const expected = await page.evaluate(() => {
    const element = document.querySelector("#narrow");
    if (!element) return 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()].filter((rect) => rect.width > 0.5 && rect.height > 0.5).length;
  });
  expect(expected).toBeGreaterThanOrEqual(3);
  await selectText(page, "#narrow");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(expected);
});

test("mixed inline styles stay on one scrap and keep their computed type", async ({ page }) => {
  const raw = await page.evaluate(() => {
    const element = document.querySelector("#mixed");
    if (!element) return 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()].filter((rect) => rect.width > 0.5).length;
  });
  expect(raw).toBeGreaterThan(1);
  await selectText(page, "#mixed");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(1);
  const styles = await page.evaluate(() => {
    const ink = document.querySelector("[data-tearcopy-ink]");
    const original = document.querySelector("#mixed");
    const read = (root: ParentNode | null, selector: string, prop: "fontWeight" | "color" | "fontFamily") => {
      const element = root?.querySelector(selector);
      return element ? getComputedStyle(element)[prop] : null;
    };
    return {
      strong: read(ink, "strong", "fontWeight"),
      originalStrong: read(original, "strong", "fontWeight"),
      link: read(ink, "a", "color"),
      originalLink: read(original, "a", "color"),
      code: read(ink, "code", "fontFamily"),
      originalCode: read(original, "code", "fontFamily"),
    };
  });
  expect(styles.strong).toBe(styles.originalStrong);
  expect(styles.link).toBe(styles.originalLink);
  expect(styles.code).toBe(styles.originalCode);
});

test("a code block tears once per visual line", async ({ page }) => {
  const expected = await page.evaluate(() => {
    const element = document.querySelector("#code");
    if (!element) return 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()].filter((rect) => rect.width > 0.5 && rect.height > 0.5).length;
  });
  expect(expected).toBeGreaterThanOrEqual(3);
  await selectText(page, "#code");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(3);
});

test("glyphs in the scrap sit on the original selection", async ({ page }) => {
  for (const selector of ["#sentence", "#mixed", "#code"]) {
    await page.goto("/");
    await selectText(page, selector);
    const drift = await page.evaluate((target) => {
      const root = document.querySelector(target);
      if (!root) return null;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode() as Text | null;
      if (!text) return null;
      const start = text.data.search(/\S/);
      if (start < 0) return null;
      const beforeRange = document.createRange();
      beforeRange.setStart(text, start);
      beforeRange.setEnd(text, start + 1);
      const before = beforeRange.getBoundingClientRect();
      document.dispatchEvent(new Event("copy", { bubbles: true }));
      const ink = document.querySelector("[data-tearcopy-ink]");
      const cloneWalker = ink ? document.createTreeWalker(ink, NodeFilter.SHOW_TEXT) : null;
      const clone = cloneWalker?.nextNode() as Text | null;
      if (!clone) return null;
      const cloneStart = clone.data.search(/\S/);
      const afterRange = document.createRange();
      afterRange.setStart(clone, cloneStart);
      afterRange.setEnd(clone, cloneStart + 1);
      const after = afterRange.getBoundingClientRect();
      return {
        dx: Math.abs(after.left - before.left),
        dy: Math.abs(after.top - before.top),
        char: text.data[start],
        cloneChar: clone.data[cloneStart],
      };
    }, selector);
    expect(drift, selector).not.toBeNull();
    expect(drift?.char, selector).toBe(drift?.cloneChar);
    expect(drift?.dx, selector).toBeLessThanOrEqual(2);
    expect(drift?.dy, selector).toBeLessThanOrEqual(2);
  }
});

test("scrolled text keeps the scrap on the selection", async ({ page }) => {
  await page.evaluate(() => {
    const element = document.getElementById("narrow");
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.35;
    window.scrollTo(0, Math.max(0, top));
  });
  await selectText(page, "#narrow", false);
  await copySelection(page);
  const delta = await page.evaluate(() => {
    for (const anim of document.getAnimations()) {
      anim.pause();
      anim.currentTime = 0;
    }
    const element = document.getElementById("narrow");
    const strips = [...document.querySelectorAll("[data-tearcopy-strip]")];
    if (!element || strips.length === 0) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    const expected = [...range.getClientRects()]
      .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
      .sort((a, b) => a.top - b.top)[0];
    const actual = strips
      .map((strip) => strip.getBoundingClientRect())
      .sort((a, b) => a.top - b.top)[0];
    return {
      left: Math.abs(actual.left - expected.left),
      top: Math.abs(actual.top - expected.top),
      width: Math.abs(actual.width - expected.width),
      height: Math.abs(actual.height - expected.height),
      scroll: window.scrollY,
    };
  });
  expect(delta).not.toBeNull();
  expect(delta!.scroll).toBeGreaterThan(40);
  expect(delta!.left).toBeLessThanOrEqual(2);
  expect(delta!.top).toBeLessThanOrEqual(2);
  expect(delta!.width).toBeLessThanOrEqual(2);
  expect(delta!.height).toBeLessThanOrEqual(2);
});

test("fields, editables, passwords, and opt-outs do not tear", async ({ page, browserName }) => {
  await page.locator("#copy-input").fill("do-not-tear");
  await page.locator("#copy-input").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+C");
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(0);
  if (browserName === "chromium") {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("do-not-tear");
  }

  await page.locator("#copy-area").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+C");
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(0);

  await page.locator("#copy-secret").focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+C");
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(0);

  await page.locator("#copy-edit").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+C");
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(0);

  await selectText(page, "#opt-out");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(0);
});

test("a rotated card fades in place", async ({ page }) => {
  await selectText(page, "#tilt p");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-motion=fly]")).toHaveCount(0);
  await expect(page.locator("[data-tearcopy-motion=fade]")).toHaveCount(1);
});

test("reduced motion does not translate the scrap", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await selectText(page, "#sentence");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-motion=fade]")).toHaveCount(1);
  const moved = await page.evaluate(() =>
    [...document.querySelectorAll("[data-tearcopy-strip]")].some((element) =>
      element.getAnimations().some((anim) => {
        const effect = anim.effect;
        if (!effect || !("getKeyframes" in effect)) return false;
        const frames = effect.getKeyframes();
        return frames.some((frame) => typeof frame.transform === "string" && frame.transform !== "none");
      }),
    ),
  );
  expect(moved).toBe(false);
});

test("reducedMotion none copies without a scrap", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard reads are granted in Chromium.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?reduced=none");
  await selectText(page, "#sentence");
  const expected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
});

test("turning the effect off and on does not stack listeners", async ({ page }) => {
  const toggle = page.locator("#enabled");
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) await toggle.uncheck();
    else await toggle.check();
  }
  await toggle.check();
  await selectText(page, "#sentence");
  await copySelection(page);
  await expect(page.locator("[data-tearcopy-tear]")).toHaveCount(1);
});

test("five rapid copies keep at most three tears and leave nothing behind", async ({ page }) => {
  await selectText(page, "#sentence");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Control+C");
  const active = await page.locator("[data-tearcopy-tear]").count();
  expect(active).toBeGreaterThan(0);
  expect(active).toBeLessThanOrEqual(3);
  await expect(page.locator("[data-tearcopy-layer]")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator("[data-tearcopy-strip]")).toHaveCount(0);
  await expect(page.locator("#sentence")).toHaveText("Paper remembers the hand that tore it.");
});
