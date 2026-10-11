import { dateLabel, money, moneyShort, pct, repLabel } from "@/lib/format";
import { attention, bookedIn, completedIn, groupBy, lowestMargins, monthly, openRows, pipeline, productGroup, summarize, type Row } from "@/lib/stats";
import type { Settings } from "@/lib/types";
import { HBars, MarginWindow, MonthlyChart, StackBar } from "./charts";

export function DashboardView({ rows, settings, year }: { rows: Row[]; settings: Settings; year: number }) {
  const target = settings.targetMargin;
  const done = completedIn(rows, year);
  const s = summarize(done);
  const booked = summarize(bookedIn(rows, year));
  const open = openRows(rows);
  const openS = summarize(open);
  const stages = pipeline(open);
  const months = monthly(rows, year);
  const reps = groupBy(done, (r) => r.job.rep || "No rep");
  const products = groupBy(done, (r) => productGroup(r.job.product));
  const todo = attention(rows, settings, year);
  const lows = lowestMargins(rows, year, 4);
  const margin = s.afterCommissionPct;
  const gap = s.estAfterCommissionPct !== null && margin !== null ? margin - s.estAfterCommissionPct : null;
  const delta = margin !== null ? margin - target : null;

  return (
    <div className="frame dashboard">
      <section className="pane pane-hero" aria-labelledby="hero-title">
        <h2 id="hero-title" className="pane-title">Margin after commission on {year} completed jobs</h2>
        <div className="hero-body">
          <MarginWindow value={margin} target={target} />
          <div className="hero-read">
            <p className="hero-number">{pct(margin)}</p>
            <p className={`hero-delta ${delta !== null && delta < 0 ? "low" : "good"}`}>
              {delta === null ? "No finished jobs yet" : delta >= 0 ? `${(delta * 100).toFixed(1)} points above target` : `${(Math.abs(delta) * 100).toFixed(1)} points below target`}
            </p>
            {gap !== null && s.estAfterCommissionPct !== null && (
              <p className="hero-note">
                Jobs were estimated at {pct(s.estAfterCommissionPct)} when sold. {gap < 0 ? `${(Math.abs(gap) * 100).toFixed(1)} points were lost` : `${(gap * 100).toFixed(1)} points were gained`} by the time they finished.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="pane pane-ledger" aria-labelledby="ledger-title">
        <h2 id="ledger-title" className="pane-title">{year} at a glance</h2>
        <dl className="ledger">
          <div className="ledger-row"><dt>Jobs completed</dt><dd>{s.count}</dd></div>
          <div className="ledger-row"><dt>Sales on completed jobs</dt><dd>{money(s.revenue)}</dd></div>
          <div className="ledger-row sub"><dt>Average job</dt><dd>{money(s.averageJob)}</dd></div>
          <div className="ledger-row"><dt>Finance charges</dt><dd className="neg">{money(-s.financeCharges)}</dd></div>
          <div className="ledger-row"><dt>Materials</dt><dd className="neg">{money(-s.materials)}</dd></div>
          <div className="ledger-row"><dt>Labor</dt><dd className="neg">{money(-s.labor)}</dd></div>
          <div className="ledger-row total"><dt>Gross profit</dt><dd>{money(s.gross)}</dd></div>
          <div className="ledger-row"><dt>Commissions</dt><dd className="neg">{money(-s.commission)}</dd></div>
          <div className="ledger-row total"><dt>After commissions</dt><dd>{money(s.afterCommission)} <span className="ledger-pct">{pct(s.afterCommissionPct)}</span></dd></div>
          {s.commissionOwed > 1 && <div className="ledger-row warn"><dt>Commission still owed</dt><dd>{money(s.commissionOwed)}</dd></div>}
          {s.balance > 1 && <div className="ledger-row warn"><dt>Customer balances unpaid</dt><dd>{money(s.balance)}</dd></div>}
        </dl>
        {s.withoutActuals > 0 && <p className="pane-note">{s.withoutActuals} job{s.withoutActuals === 1 ? "" : "s"} without labor paid are left out of profit and margin.</p>}
      </section>

      <section className="pane pane-month" aria-labelledby="month-title">
        <div className="pane-head">
          <h2 id="month-title" className="pane-title">Sold and completed by month</h2>
          <p className="legend">
            <span className="key key-done" />Completed
            <span className="key key-low" />Under {pct(target, 0)} margin
            <span className="key key-sold" />Sold
          </p>
        </div>
        <div className="chart-scroll"><MonthlyChart points={months} target={target} year={year} /></div>
        <p className="pane-note">{booked.count} jobs sold in {year} for {money(booked.revenue)}. Percentages are margin after commission on jobs completed that month.</p>
      </section>

      <section className="pane pane-pipeline" aria-labelledby="pipe-title">
        <h2 id="pipe-title" className="pane-title">Open jobs by stage</h2>
        <p className="pane-big">{open.length} <span>jobs worth {moneyShort(openS.revenue)}</span></p>
        <StackBar parts={stages.map((p) => ({ key: p.key, label: p.label, color: p.color, value: p.count }))} />
        <ul className="stage-list">
          {stages.filter((p) => p.count > 0).map((p) => (
            <li key={p.key}>
              <span className="dot" style={{ background: p.color }} />
              <span className="stage-name">{p.label}</span>
              <span className="stage-count">{p.count}</span>
              <span className="stage-value">{moneyShort(p.value)}</span>
            </li>
          ))}
        </ul>
        <p className="pane-note">{money(openS.collected)} collected, {money(openS.balance)} still to collect.</p>
      </section>

      <section className="pane pane-reps" aria-labelledby="reps-title">
        <h2 id="reps-title" className="pane-title">By sales rep</h2>
        <table className="mini">
          <thead>
            <tr><th>Rep</th><th className="num">Jobs</th><th className="num">Sales</th><th className="num">Margin</th><th className="num">Commission</th></tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.key}>
                <td>{repLabel(r.key)}</td>
                <td className="num">{r.count}</td>
                <td className="num">{moneyShort(r.revenue)}</td>
                <td className={`num${r.afterCommissionPct !== null && r.afterCommissionPct < target ? " low" : ""}`}>{pct(r.afterCommissionPct)}</td>
                <td className="num">{moneyShort(r.commissionPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pane pane-products" aria-labelledby="prod-title">
        <h2 id="prod-title" className="pane-title">By product</h2>
        <HBars
          items={products.map((p) => ({ key: p.key, value: p.revenue, label: `${p.key} (${p.count})`, right: `${moneyShort(p.revenue)} at ${pct(p.afterCommissionPct, 0)}`, ok: p.afterCommissionPct === null ? null : p.afterCommissionPct >= target }))}
        />
      </section>

      <section className="pane pane-attn" aria-labelledby="attn-title">
        <h2 id="attn-title" className="pane-title">Needs a look{todo.length ? ` (${todo.length})` : ""}</h2>
        {todo.length === 0 && lows.length === 0 ? (
          <p className="empty">Everything is filled in and paid up.</p>
        ) : (
          <ul className="attn">
            {todo.slice(0, 7).map((t) => (
              <li key={t.id}>
                <a href={`/${t.tab}?job=${t.jobId}&year=${year}`}>
                  <span className={`attn-dot ${t.kind}`} />
                  <span><strong>{t.title}</strong><small>{t.detail}</small></span>
                </a>
              </li>
            ))}
            {todo.length > 7 && <li className="attn-more">and {todo.length - 7} more</li>}
          </ul>
        )}
        {lows.length > 0 && (
          <>
            <h3 className="pane-subtitle">Lowest margins finished in {year}</h3>
            <ul className="attn lows">
              {lows.map(({ job, c }) => (
                <li key={job.id}>
                  <a href={`/completed?job=${job.id}&year=${year}`}>
                    <span className="attn-dot margin" />
                    <span><strong>{job.name}</strong><small>{money(job.contractValue)} sold {dateLabel(job.soldDate, false)}</small></span>
                    <em>{pct(c.afterCommissionPct)}</em>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
