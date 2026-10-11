"use client";

import { useMemo, useState } from "react";
import { compute } from "@/lib/calc";
import { money, pct, todayISO } from "@/lib/format";
import { STAGES, type Job, type Settings } from "@/lib/types";
import { NumField, Overlay, useJobApi } from "./inputs";
import { BpPanel, TodoPanel } from "./JobTodo";

type Api = ReturnType<typeof useJobApi>;

function blank(): Job {
  return {
    id: "", jobNumber: "", name: "", product: "", rep: "", soldDate: todayISO(), state: "open", stage: "awaitingDeposit",
    completeDate: null, reportYear: null, contractValue: 0, financePct: 0, financed: false, depositAmount: 0, depositDate: null,
    stageAmount: 0, stageDate: null, finalAmount: 0, finalDate: null, materialsPaid: null, materialsEst: null, laborEst: null,
    laborActual: null, commissionRate: null, commissionPaid: 0, commissionPaidDate: null, materialsActual: null, notes: "",
    source: "manual", builderPrimeId: null, updatedAt: "",
  };
}

function DateField({ value, onChange, label, id, needed = false }: { value: string | null; onChange: (v: string | null) => void; label: string; id?: string; needed?: boolean }) {
  return <input type="date" id={id} className={needed && !value ? "needed" : undefined} aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}

export function JobDrawer({ job, settings, api, onClose }: { job: Job | null; settings: Settings; api: Api; onClose: () => void }) {
  const creating = job === null;
  const [d, setD] = useState<Job>(job ?? blank());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Job>(k: K, v: Job[K]) => setD((p) => ({ ...p, [k]: v }));
  const c = useMemo(() => compute(d, settings), [d, settings]);
  const completed = d.state === "completed";
  const defaultRate = settings.reps.find((r) => r.name === d.rep)?.commissionRate;
  const fromBp = !!d.builderPrimeId && !completed;

  /** The deposit is taken at the sale, so an empty deposit date follows the sale date. */
  const setSoldDate = (v: string | null) =>
    setD((p) => ({ ...p, soldDate: v, depositDate: !p.depositDate && v && p.depositAmount > 0 && !p.financed ? v : p.depositDate }));

  /** Builder Prime has more paid than entered: put the difference in the next empty payment. */
  const addBpPayments = () => {
    const diff = Math.round(((d.bp?.paid ?? 0) - c.totalPayments) * 100) / 100;
    if (diff <= 0) return;
    const slot = !d.depositAmount ? "deposit" : !d.stageAmount ? "stage" : "final";
    if (slot === "deposit") setD((p) => ({ ...p, depositAmount: diff, depositDate: p.depositDate ?? p.soldDate }));
    else if (slot === "stage") set("stageAmount", diff);
    else set("finalAmount", (d.finalAmount || 0) + diff);
    requestAnimationFrame(() => document.getElementById(`f-${slot}Date`)?.focus());
  };

  const save = async () => {
    if (!d.name.trim()) return;
    setBusy(true);
    const body: Partial<Job> = { ...d, name: d.name.trim().toUpperCase(), rep: d.rep.trim().toUpperCase() };
    if (completed && d.completeDate) body.reportYear = job?.reportYear ?? Number(d.completeDate.slice(0, 4));
    const ok = creating ? await api.create(body, "Job added") : await api.patch(d.id, body, "Saved");
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Overlay onClose={onClose} side label={creating ? "New job" : `Edit ${d.name}`}>
      <header className="drawer-head">
        <div>
          <h2>{creating ? "New job" : d.name || "Job"}</h2>
          {!creating && (
            <p className="sub">
              {d.jobNumber ? `ProVia Order #${d.jobNumber}` : "No ProVia Order # yet"} ·{" "}
              {d.builderPrimeJobNumber ? `Builder Prime job #${d.builderPrimeJobNumber}` : d.source === "sheet" ? "imported from your spreadsheet" : "added by hand"}
            </p>
          )}
        </div>
        <button className="btn btn-quiet" onClick={onClose} aria-label="Close">Close</button>
      </header>

      <div className="drawer-body">
        {!creating && <TodoPanel missing={c.missing} checks={c.checks} onUseBpPayments={addBpPayments} />}
        {d.bp && <BpPanel bp={d.bp} jobNumber={d.builderPrimeJobNumber} />}
        <fieldset>
          <legend>Job</legend>
          <label className="field"><span>Customer name</span><input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="LAST NAME" autoFocus={creating} /></label>
          <div className="field-row">
            <label className="field"><span>Job number (ProVia Order #)</span><input id="f-jobNumber" className={d.jobNumber.trim() ? undefined : "needed"} value={d.jobNumber} onChange={(e) => set("jobNumber", e.target.value)} placeholder="e.g. 14651608" /></label>
            <label className="field"><span>Product</span><input id="f-product" className={d.product.trim() ? undefined : "needed"} value={d.product} onChange={(e) => set("product", e.target.value.toUpperCase())} placeholder="W, PD, ED" /></label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Sales rep</span>
              <input list="reps" value={d.rep} onChange={(e) => set("rep", e.target.value.toUpperCase())} />
              <datalist id="reps">{settings.reps.map((r) => <option key={r.name} value={r.name} />)}</datalist>
            </label>
            <label className="field"><span>Date sold</span><DateField id="f-soldDate" needed value={d.soldDate} onChange={setSoldDate} label="Date sold" /></label>
          </div>
          {!completed && (
            <label className="field">
              <span>Stage</span>
              <select value={d.stage ?? ""} onChange={(e) => set("stage", (e.target.value || null) as Job["stage"])}>
                <option value="">No stage</option>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          )}
          {completed && (
            <label className="field"><span>Install completed</span><DateField value={d.completeDate} onChange={(v) => set("completeDate", v)} label="Install completed" /></label>
          )}
        </fieldset>

        <fieldset>
          <legend>Payments</legend>
          <div className="field-row">
            {fromBp ? (
              <div className="field"><span>Contract value</span><p className="from-bp">{money(d.contractValue, true)} <small>from Builder Prime, updates on sync</small></p></div>
            ) : (
              <label className="field"><span>Contract value</span><NumField id="f-contractValue" label="Contract value" value={d.contractValue} needed={!d.contractValue} allowEmpty={false} onCommit={(v) => set("contractValue", v ?? 0)} /></label>
            )}
            <label className="field check"><input type="checkbox" checked={d.financed} onChange={(e) => set("financed", e.target.checked)} /><span>Financed (no deposit date)</span></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Deposit</span><NumField label="Deposit" value={d.depositAmount} onCommit={(v) => set("depositAmount", v ?? 0)} /></label>
            <label className="field"><span>Deposit date</span><DateField id="f-depositDate" value={d.depositDate} onChange={(v) => set("depositDate", v)} label="Deposit date" /></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Stage payment</span><NumField label="Stage payment" value={d.stageAmount} onCommit={(v) => set("stageAmount", v ?? 0)} /></label>
            <label className="field"><span>Stage payment date</span><DateField id="f-stageDate" value={d.stageDate} onChange={(v) => set("stageDate", v)} label="Stage payment date" /></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Final payment</span><NumField label="Final payment" value={d.finalAmount} onCommit={(v) => set("finalAmount", v ?? 0)} /></label>
            <label className="field"><span>Final payment date</span><DateField id="f-finalDate" value={d.finalDate} onChange={(v) => set("finalDate", v)} label="Final payment date" /></label>
          </div>
          <p className="readout">Paid {money(c.totalPayments, true)}. Balance owed <strong className={c.balance > 1 ? "low" : ""}>{money(c.balance, true)}</strong></p>
        </fieldset>

        <fieldset className="entry">
          <legend>Costs you enter</legend>
          <div className="field-row">
            <label className="field"><span>Materials estimate{d.bp?.cost ? <small className="muted"> · Builder Prime cost {money(d.bp.cost, true)}</small> : null}</span><NumField id="f-materialsEst" label="Materials estimate" value={d.materialsEst} needed={d.materialsEst === null} onCommit={(v) => set("materialsEst", v)} /></label>
            <label className="field"><span>Labor estimate</span><NumField id="f-laborEst" label="Labor estimate" value={d.laborEst} needed={d.laborEst === null} onCommit={(v) => set("laborEst", v)} /></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Materials paid to supplier</span><NumField label="Materials paid to supplier" value={d.materialsPaid} onCommit={(v) => set("materialsPaid", v)} /></label>
            <label className="field"><span>Labor paid</span><NumField id="f-laborActual" label="Labor paid" value={d.laborActual} needed={completed && d.laborActual === null} onCommit={(v) => set("laborActual", v)} /></label>
          </div>
          <div className="field-row">
            <label className="field"><span>Finance charge</span><NumField kind="percent" label="Finance charge percent" value={d.financePct} allowEmpty={false} onCommit={(v) => set("financePct", v ?? 0)} /></label>
            <label className="field">
              <span>Actual materials (optional)</span>
              <NumField label="Actual materials override" value={d.materialsActual} placeholder={String(Math.round(c.materialsActual))} onCommit={(v) => set("materialsActual", v)} />
            </label>
          </div>
          <p className="hint">Leave actual materials empty to use the estimate plus {pct(settings.materialsAllowance, 0)} of the contract.</p>
        </fieldset>

        <fieldset className="entry">
          <legend>Commission</legend>
          <div className="field-row">
            <label className="field"><span>Rate</span><NumField kind="percent" label="Commission rate" value={d.commissionRate} placeholder={defaultRate === undefined ? "0" : String(defaultRate * 100)} onCommit={(v) => set("commissionRate", v)} /></label>
            <label className="field"><span>Paid so far</span><NumField label="Commission paid" value={d.commissionPaid} allowEmpty={false} onCommit={(v) => set("commissionPaid", v ?? 0)} /></label>
          </div>
          <label className="field"><span>Last commission payment</span><DateField value={d.commissionPaidDate} onChange={(v) => set("commissionPaidDate", v)} label="Last commission payment" /></label>
          <p className="readout">Due {money(c.commissionDue, true)} at {pct(c.commissionRate, 1)}. Owed <strong className={c.commissionOwed > 1 ? "low" : ""}>{money(c.commissionOwed, true)}</strong></p>
        </fieldset>

        <fieldset>
          <legend>Notes</legend>
          <textarea rows={3} value={d.notes} onChange={(e) => set("notes", e.target.value)} aria-label="Notes" />
        </fieldset>

        <section className="preview" aria-label="Margin preview">
          <div><span>Estimated profit</span><strong>{money(c.estGross)}</strong><em>{pct(c.estPct)}</em></div>
          <div><span>Actual profit</span><strong>{c.grossActual === null ? "Needs labor paid" : money(c.grossActual)}</strong><em>{pct(c.actualPct)}</em></div>
          <div><span>After commission</span><strong>{c.grossAfterCommission === null ? "–" : money(c.grossAfterCommission)}</strong><em>{pct(c.afterCommissionPct)}</em></div>
        </section>
      </div>

      <footer className="drawer-foot">
        {!creating && !confirmDelete && <button className="btn btn-danger-quiet" onClick={() => setConfirmDelete(true)}>Delete job</button>}
        {!creating && confirmDelete && (
          <>
            <span className="confirm-text">Delete {d.name}? This can't be undone.</span>
            <button className="btn btn-danger" onClick={async () => { if (await api.remove(d.id, "Job deleted")) onClose(); }}>Yes, delete</button>
            <button className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        )}
        {!creating && completed && !confirmDelete && (
          <button className="btn btn-quiet" onClick={async () => { if (await api.reopen(d.id, "Moved back to open jobs")) onClose(); }}>Move back to open</button>
        )}
        <span className="grow" />
        {!confirmDelete && (
          <>
            <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !d.name.trim()}>{creating ? "Add job" : "Save changes"}</button>
          </>
        )}
      </footer>
    </Overlay>
  );
}
