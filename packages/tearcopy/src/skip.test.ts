import { describe, expect, it } from "vitest";
import { isSkippedCopy } from "./skip";

function select(node: Node, textMode: "all" | "collapsed" | "blank" = "all"): Selection {
  const range = document.createRange();
  if (textMode === "collapsed") {
    range.setStart(node, 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(node);
  }
  const selection = document.getSelection();
  if (!selection) throw new Error("happy-dom selection missing");
  selection.removeAllRanges();
  selection.addRange(range);
  if (textMode === "blank") {
    node.textContent = " \n\t ";
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return selection;
}

describe("isSkippedCopy", () => {
  it("allows a normal paragraph selection", () => {
    document.body.innerHTML = `<p id="p">A sentence with ink.</p>`;
    const paragraph = document.getElementById("p")!;
    expect(isSkippedCopy(document.body, select(paragraph))).toBe(false);
  });

  it("skips collapsed and whitespace-only selections", () => {
    document.body.innerHTML = `<p id="p">A sentence with ink.</p><p id="blank"> </p>`;
    const paragraph = document.getElementById("p")!;
    const blank = document.getElementById("blank")!;
    expect(isSkippedCopy(document.body, select(paragraph, "collapsed"))).toBe(true);
    expect(isSkippedCopy(document.body, select(blank, "blank"))).toBe(true);
    expect(isSkippedCopy(document.body, null)).toBe(true);
  });

  it("skips inputs, textareas, passwords, contenteditables, and opt-outs", () => {
    document.body.innerHTML = `
      <input id="text" type="text" value="alpha" />
      <textarea id="area">beta</textarea>
      <input id="secret" type="password" value="gamma" />
      <div id="edit" contenteditable="true">delta</div>
      <div id="ignore" data-tearcopy-ignore><span id="inner">epsilon</span></div>
      <p id="ok">zeta</p>
    `;
    const text = document.getElementById("text")!;
    const area = document.getElementById("area")!;
    const secret = document.getElementById("secret")!;
    const edit = document.getElementById("edit")!;
    const inner = document.getElementById("inner")!;
    const ok = document.getElementById("ok")!;

    text.focus();
    expect(isSkippedCopy(text, select(ok))).toBe(true);
    (document.activeElement as HTMLElement | null)?.blur();

    expect(isSkippedCopy(area, select(area))).toBe(true);
    expect(isSkippedCopy(secret, select(secret))).toBe(true);
    expect(isSkippedCopy(edit, select(edit))).toBe(true);
    expect(isSkippedCopy(inner, select(inner))).toBe(true);
  });

  it("does not treat radios as text fields", () => {
    document.body.innerHTML = `<input id="radio" type="radio" /><p id="p">Still tearable.</p>`;
    const radio = document.getElementById("radio")!;
    const paragraph = document.getElementById("p")!;
    radio.focus();
    expect(isSkippedCopy(radio, select(paragraph))).toBe(false);
  });

  it("skips selections inside a shadow root", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    const paragraph = document.createElement("p");
    paragraph.textContent = "hidden ink";
    shadow.append(paragraph);
    const selection = select(paragraph);
    expect(isSkippedCopy(host, selection)).toBe(true);
  });
});
