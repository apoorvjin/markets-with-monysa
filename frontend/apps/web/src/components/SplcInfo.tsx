import { useState } from "react";

/** Plain-English explainer for the supply-chain feature, shared by the SPLC
    Analysis page and the Asset Detail card so the wording can't drift apart.
    This screen shows numbers lifted out of legal filings, and "Disclosed vs
    Derived" is meaningless without context — so the explanation ships next to
    the data rather than living in a doc nobody opens. */
export function SplcInfoBody() {
  return (
    <div className="splc-info">
      <p>
        <strong>Who a company buys from, and who it sells to.</strong> US companies must tell
        regulators when a single customer is more than 10% of their sales. We read those filings
        and turn them into a list you can browse.
      </p>
      <p>
        <strong>Example:</strong> Fair Isaac (FICO) told the SEC that Experian is 10% of its
        revenue. So if something goes wrong at Experian, FICO feels it.
      </p>
      <p>Every row is labelled with where the number came from:</p>
      <ul>
        <li>
          <strong>Disclosed</strong> — the company stated this itself in a filing. A fact, not an
          estimate.
        </li>
        <li>
          <strong>Derived</strong> — only one side reported the relationship, so we worked out what
          it's worth to the other side using both companies' published financials. Lower
          confidence, and we say so.
        </li>
        <li>
          <strong>Federal contract</strong> — a published US government award. Shown in dollars
          only: award totals span several years, so a share of one year's revenue would mislead.
        </li>
        <li>
          <em>Undisclosed customer / supplier</em> — the concentration is real and reported, but
          the filer is allowed to write "Customer A" instead of a name. We show the number and
          leave the name blank rather than guessing.
        </li>
      </ul>
      <p className="splc-info-caveat">
        Worth knowing: companies only have to report counterparties above 10% of sales, so this
        shows the big relationships — never the whole picture. Filings are annual or quarterly, so
        figures can be months old. We'd rather show you less than guess.
      </p>
    </div>
  );
}

/** Toggle + panel. Kept together so every surface gets identical behaviour. */
export function SplcInfoToggle() {
  const [open, setOpen] = useState(false);
  return {
    button: (
      <button
        type="button"
        className="splc-info-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        What is this?
      </button>
    ),
    panel: open ? <SplcInfoBody /> : null,
  };
}
