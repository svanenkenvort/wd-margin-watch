"use client";

import type { BpCheck, MissingField } from "@/lib/calc";
import { dateLabel, money, repLabel } from "@/lib/format";
import type { BpSnapshot } from "@/lib/types";

/** One line under the customer in the table: what is still to enter. Opens the job. */
export function MissingLine({ missing, onOpen }: { missing: MissingField[]; onOpen: () => void }) {
  if (!missing.length) return null;
  return (
    <button className="todo-line" onClick={onOpen} title="Open the job to enter these">
      Add {missing.map((m) => m.label.toLowerCase()).join(", ")}
    </button>
  );
}

const checkText = (k: BpCheck) =>
  k.kind === "payments"
    ? `Builder Prime shows ${money(k.builderPrime, true)} paid, ${money(k.entered, true)} entered here`
    : k.kind === "rep"
      ? `Builder Prime has ${k.salesPerson} as the sales rep (${repLabel(k.rep)} here)`
      : `Complete in Builder Prime${k.on ? ` since ${dateLabel(k.on)}` : ""}`;

/** Short form for the table; the job itself shows the full sentence. */
const checkShort = (k: BpCheck) =>
  k.kind === "payments" ? `Paid differs from Builder Prime (${money(k.builderPrime)})` : k.kind === "rep" ? `Builder Prime rep: ${k.salesPerson}` : "Complete in Builder Prime";

export function BpFlags({ checks, onOpen }: { checks: BpCheck[]; onOpen: () => void }) {
  if (!checks.length) return null;
  return (
    <>
      {checks.map((k) => (
        <button key={k.kind} className="todo-line flag" onClick={onOpen} title={checkText(k)}>{checkShort(k)}</button>
      ))}
    </>
  );
}

const focusField = (field: string) => {
  const el = document.getElementById(`f-${field}`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  (el as HTMLInputElement).focus({ preventScroll: true });
};

/**
 * The checklist at the top of a job: each missing entry jumps to its field, and each place the
 * job and Builder Prime disagree says what to do about it.
 */
export function TodoPanel({ missing, checks, onUseBpPayments, onUseBpRep }: { missing: MissingField[]; checks: BpCheck[]; onUseBpPayments?: () => void; onUseBpRep?: (rep: string) => void }) {
  if (!missing.length && !checks.length) return <p className="todo-done">Everything this job needs is entered.</p>;
  return (
    <section className="todo" aria-label="Still to enter">
      {missing.length > 0 && (
        <>
          <h3>Still to enter</h3>
          <ul>
            {missing.map((m) => (
              <li key={m.field}><button className="linkish" onClick={() => focusField(m.field)}>{m.label}</button></li>
            ))}
          </ul>
        </>
      )}
      {checks.map((k) => (
        <p key={k.kind} className="todo-flag">
          {checkText(k)}.
          {k.kind === "payments" && k.builderPrime > k.entered && onUseBpPayments && (
            <> <button className="btn btn-small" onClick={onUseBpPayments}>Add the {money(k.builderPrime - k.entered, true)} difference</button></>
          )}
          {k.kind === "payments" && k.builderPrime < k.entered && <> Check the amounts entered below.</>}
          {k.kind === "complete" && <> Click Complete on the Open jobs list when the install is done.</>}
          {k.kind === "rep" && onUseBpRep && <> <button className="btn btn-small" onClick={() => onUseBpRep(k.rep)}>Use {repLabel(k.rep)}</button></>}
          {k.kind === "rep" && <> If {repLabel(k.rep)} isn&apos;t who {k.salesPerson} is, set their Builder Prime name under Settings &gt; Sales reps.</>}
        </p>
      ))}
    </section>
  );
}

/** Builder Prime's figures for the job. They update on every sync and are not typed here. */
export function BpPanel({ bp, jobNumber }: { bp: BpSnapshot; jobNumber: string | null | undefined }) {
  return (
    <section className="bp-panel" aria-label="From Builder Prime">
      <h3>
        From Builder Prime{jobNumber ? ` · job #${jobNumber}` : ""} <span className="muted">· {bp.status}{bp.projectName ? ` · ${bp.projectName}` : ""}{bp.salesPerson ? ` · sold by ${bp.salesPerson}` : ""}</span>
      </h3>
      <dl>
        <div><dt>Contract</dt><dd>{money(bp.contracted, true)}</dd></div>
        <div><dt>Invoiced</dt><dd>{money(bp.invoiced, true)}</dd></div>
        <div><dt>Paid</dt><dd>{money(bp.paid, true)}</dd></div>
        <div><dt>Cost</dt><dd>{money(bp.cost, true)}</dd></div>
      </dl>
      <p className="hint">Synced {dateLabel(bp.syncedAt.slice(0, 10))}. Builder Prime has no ProVia Order #, sale date, labor or payment dates, so those are entered here.</p>
    </section>
  );
}
