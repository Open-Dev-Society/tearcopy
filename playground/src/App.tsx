import { useCallback, useState } from "react";
import { useTearcopy, type Corner, type Paper, type ReducedMotion, type TearcopyOptions } from "tearcopy/react";

const CODE = `const stop = tearcopy({ paper: "cream" });\nstop();\n// the page stays put`;

const CORNERS: { value: Corner; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

function reducedFromLocation(): ReducedMotion {
  const reduced = new URLSearchParams(window.location.search).get("reduced");
  return reduced === "none" ? "none" : "fade";
}

function TearEngine(options: TearcopyOptions) {
  useTearcopy(options);
  return null;
}

export function App() {
  const [paper, setPaper] = useState<Paper>("cream");
  const [corner, setCorner] = useState<Corner>("bottom-right");
  const [duration, setDuration] = useState(980);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState("Waiting for a copy.");
  const reducedMotion = reducedFromLocation();

  const onTear = useCallback((info: { lines: number }) => {
    setStatus(info.lines === 1 ? "Copied 1 line." : `Copied ${info.lines} lines.`);
  }, []);

  return (
    <div className="desk">
      {enabled ? (
        <TearEngine paper={paper} corner={corner} duration={duration} reducedMotion={reducedMotion} onTear={onTear} />
      ) : null}
      <article className="sheet">
        <header className="mast">
          <p className="kicker">Open Dev Society</p>
          <h1>Tearcopy</h1>
          <p className="lede">
            Select the line below and press <kbd>Ctrl</kbd>+<kbd>C</kbd> or <kbd>⌘</kbd>+<kbd>C</kbd>. It lifts off as
            torn paper. The original words, and the clipboard, stay where they are.
          </p>
        </header>

        <p id="sentence" className="specimen">
          Paper remembers the hand that tore it.
        </p>
        <p className="specimen-note">Drag through this line, or hold Shift and move the caret. Then copy. No button.</p>
        <p id="status" className="status" aria-live="polite" aria-atomic="true">
          {status}
        </p>

        <section className="howto" aria-labelledby="howto-title">
          <h2 id="howto-title">Try it</h2>
          <ol>
            <li>Select the specimen line, a wrapped paragraph, or the code block.</li>
            <li>
              Press <kbd>Ctrl</kbd>+<kbd>C</kbd> or <kbd>⌘</kbd>+<kbd>C</kbd>.
            </li>
            <li>The gap heals. Paste below with <kbd>Ctrl</kbd>+<kbd>V</kbd> and compare.</li>
          </ol>
        </section>

        <div className="controls">
          <fieldset>
            <legend>Paper</legend>
            <div className="choices">
              {(
                [
                  ["cream", "Cream"],
                  ["receipt", "Receipt"],
                  ["kraft", "Kraft"],
                ] as const
              ).map(([value, label]) => (
                <label className="choice" key={value}>
                  <input
                    type="radio"
                    name="paper"
                    value={value}
                    checked={paper === value}
                    onChange={() => setPaper(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Corner</legend>
            <div className="choices">
              {CORNERS.map((item) => (
                <label className="choice" key={item.value}>
                  <input
                    type="radio"
                    name="corner"
                    value={item.value}
                    checked={corner === item.value}
                    onChange={() => setCorner(item.value)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Motion</legend>
            <div className="duration">
              <label htmlFor="duration">Duration</label>
              <input
                id="duration"
                type="range"
                min={400}
                max={1800}
                step={20}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              />
              <output htmlFor="duration">{duration} ms</output>
            </div>
            <label className="toggle" htmlFor="enabled">
              <input
                id="enabled"
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  const next = event.target.checked;
                  setEnabled(next);
                  setStatus(next ? "Waiting for a copy." : "Tear is off.");
                }}
              />
              Tear enabled
            </label>
          </fieldset>
        </div>

        <section className="essay" aria-labelledby="essay-title">
          <h2 id="essay-title">From the desk</h2>
          <p>
            A copy used to mean a sheet pulled from the stack, not a silent buffer. The words stayed on the desk, and
            the duplicate left with the reader. Tearcopy is that gesture, played back on whatever page you are already
            reading.
          </p>
          <p id="mixed">
            <strong>Bold</strong>, a <a href="#colophon">link</a>, and <code>tearcopy()</code> share one line.
          </p>
          <div className="narrow-wrap">
            <p id="narrow">
              A narrow measure forces the line to break, the way a newspaper column folds a sentence before the thought
              is finished.
            </p>
          </div>
          <pre id="code">
            <code>{CODE}</code>
          </pre>
          <aside id="tilt">
            <p>Rotated three degrees. Copying here fades in place instead of flying off.</p>
          </aside>
          <p id="opt-out" data-tearcopy-ignore>
            This line opts out of the tear.
          </p>
        </section>

        <section className="quiet" aria-labelledby="quiet-title">
          <h2 id="quiet-title">Copy here should not tear</h2>
          <p className="note">Fields, passwords, and editable notes are left alone. The clipboard still fills.</p>
          <label htmlFor="copy-input">Text field</label>
          <input id="copy-input" type="text" defaultValue="A field keeps its letters." autoComplete="off" />
          <label htmlFor="copy-area">Textarea</label>
          <textarea id="copy-area" defaultValue="Copying this note should not tear." rows={3} />
          <label htmlFor="copy-secret">Password</label>
          <input id="copy-secret" type="password" defaultValue="s3cret-ink" autoComplete="off" />
          <span id="edit-label">Editable note</span>
          <div id="copy-edit" role="textbox" aria-labelledby="edit-label" contentEditable suppressContentEditableWarning>
            This note is editable. Copying it should not tear.
          </div>
        </section>

        <section className="verify" data-tearcopy-ignore aria-labelledby="paste-title">
          <h2 id="paste-title">Paste to verify</h2>
          <p className="note">
            The library never reads the clipboard. Paste here yourself and compare it with what you selected.
          </p>
          <label htmlFor="paste" className="sr-only">
            Paste target
          </label>
          <textarea
            id="paste"
            spellCheck={false}
            rows={4}
            placeholder="Click here and press Ctrl+V or ⌘V."
          />
        </section>

        <section className="notes" aria-labelledby="notes-title">
          <h2 id="notes-title">Margin notes</h2>
          <p>
            Scroll the page halfway and copy again. The scrap is pinned to the screen, using the selection’s position in
            the window, so the tear still meets the words.
          </p>
          <p>
            Reduced motion keeps the scrap still: it fades where it stands, or shows nothing if you pass{" "}
            <code>reducedMotion: &quot;none&quot;</code>. Add <code>?reduced=none</code> to this page and turn on reduced
            motion in the browser to try that path.
          </p>
          <p>
            Nothing here is stored. There is no pocket of old copies, no network call, and no permission prompt. When
            the flutter ends, the overlay is gone.
          </p>
          <p>
            Kraft is only a warmer sheet. Receipt is a cooler one. The motion is the same. Pick the paper, pick the
            corner, then steal a sentence.
          </p>
        </section>

        <footer id="colophon">
          <p>Created by Ravi for Open Dev Society. Tearcopy is not yet published to npm.</p>
          <p>No clipboard reads, no storage, no telemetry. MIT licensed.</p>
        </footer>
      </article>
    </div>
  );
}
