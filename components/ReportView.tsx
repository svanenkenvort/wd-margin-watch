import { dateLabel, money, monthName, pct, repLabel } from "@/lib/format";
import { bookedIn, completedIn, groupBy, lowestMargins, monthly, productGroup, summarize, type Row } from "@/lib/stats";
import type { Settings } from "@/lib/types";

export function ReportView({ rows, settings, year }: { rows: Row[]; settings: Settings; year: number }) {
  const target = settings.targetMargin;
  const done = completedIn(rows, year);
  const s = summarize(done);
  const sold = summarize(bookedIn(rows, year));
  const months = monthly(rows, year);
  const reps = groupBy(done, (r) => r.job.rep || "No rep");
  const products = groupBy(done, (r) => productGroup(r.job.product));
  const lows = lowestMargins(rows, year, 8);
  const prev = summarize(completedIn(rows, year - 1));
  const hasPrev = prev.count > 0;
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : "−"}${Math.abs(((a - b) / b) * 100).toFixed(0)}% vs ${year - 1}` : "");
  const lowPct = (p: number | null) => (p !== null && p < target ? " low" : "");

  return (
    <article className="report">
      <header className="report-head">
        <h2>{year} yearly report</h2>
        <p className="sub">Completed jobs counted in the year they finished. Target gross profit is {pct(target, 0)}.</p>
      </header>

      <section className="report-block">
        <h3>Summary</h3>
        <table className="report-table">
          <thead><tr><th>Measure</th><th className="num">{year}</th>{hasPrev && <th className="num">{year - 1}</th>}{hasPrev && <th className="num">Change</th>}</tr></thead>
          <tbody>
            <tr><td>Jobs completed</td><td className="num">{s.count}</td>{hasPrev && <><td className="num">{prev.count}</td><td className="num muted">{delta(s.count, prev.count)}</td></>}</tr>
            <tr><td>Sales on completed jobs</td><td className="num">{money(s.revenue)}</td>{hasPrev && <><td className="num">{money(prev.revenue)}</td><td className="num muted">{delta(s.revenue, prev.revenue)}</td></>}</tr>
            <tr><td>Average job</td><td className="num">{money(s.averageJob)}</td>{hasPrev && <><td className="num">{money(prev.averageJob)}</td><td className="num muted">{delta(s.averageJob, prev.averageJob)}</td></>}</tr>
            <tr><td>Finance charges</td><td className="num">{money(s.financeCharges)}</td>{hasPrev && <><td className="num">{money(prev.financeCharges)}</td><td /></>}</tr>
            <tr><td>Materials</td><td className="num">{money(s.materials)}</td>{hasPrev && <><td className="num">{money(prev.materials)}</td><td /></>}</tr>
            <tr><td>Labor</td><td className="num">{money(s.labor)}</td>{hasPrev && <><td className="num">{money(prev.labor)}</td><td /></>}</tr>
            <tr className="strong"><td>Gross profit</td><td className="num">{money(s.gross)}</td>{hasPrev && <><td className="num">{money(prev.gross)}</td><td className="num muted">{delta(s.gross, prev.gross)}</td></>}</tr>
            <tr className="strong"><td>Gross profit margin</td><td className={`num${lowPct(s.grossPct)}`}>{pct(s.grossPct)}</td>{hasPrev && <><td className="num">{pct(prev.grossPct)}</td><td /></>}</tr>
            <tr><td>Commissions paid</td><td className="num">{money(s.commissionPaid)}</td>{hasPrev && <><td className="num">{money(prev.commissionPaid)}</td><td /></>}</tr>
            <tr className="strong"><td>Profit after commissions</td><td className="num">{money(s.afterCommission)}</td>{hasPrev && <><td className="num">{money(prev.afterCommission)}</td><td className="num muted">{delta(s.afterCommission, prev.afterCommission)}</td></>}</tr>
            <tr><td>Margin after commissions</td><td className="num">{pct(s.afterCommissionPct)}</td>{hasPrev && <><td className="num">{pct(prev.afterCommissionPct)}</td><td /></>}</tr>
            <tr><td>Sold during {year} (all jobs, open or finished)</td><td className="num">{sold.count} jobs, {money(sold.revenue)}</td>{hasPrev && <><td /><td /></>}</tr>
          </tbody>
        </table>
      </section>

      <section className="report-block">
        <h3>By month</h3>
        <table className="report-table">
          <thead><tr><th>Month</th><th className="num">Sold</th><th className="num">Sold value</th><th className="num">Completed</th><th className="num">Completed value</th><th className="num">Gross margin</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{monthName(m.month)}</td>
                <td className="num">{m.bookedCount || "–"}</td>
                <td className="num">{m.booked ? money(m.booked) : "–"}</td>
                <td className="num">{m.completedCount || "–"}</td>
                <td className="num">{m.completed ? money(m.completed) : "–"}</td>
                <td className={`num${lowPct(m.grossPct)}`}>{pct(m.grossPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="report-two">
        <section className="report-block">
          <h3>By sales rep</h3>
          <table className="report-table">
            <thead><tr><th>Rep</th><th className="num">Jobs</th><th className="num">Sales</th><th className="num">Margin</th><th className="num">Commission paid</th><th className="num">Owed</th></tr></thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.key}><td>{repLabel(r.key)}</td><td className="num">{r.count}</td><td className="num">{money(r.revenue)}</td><td className={`num${lowPct(r.grossPct)}`}>{pct(r.grossPct)}</td><td className="num">{money(r.commissionPaid)}</td><td className="num">{r.commissionOwed > 1 ? money(r.commissionOwed) : "–"}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="report-block">
          <h3>By product</h3>
          <table className="report-table">
            <thead><tr><th>Product</th><th className="num">Jobs</th><th className="num">Sales</th><th className="num">Margin</th></tr></thead>
            <tbody>
              {products.map((r) => (
                <tr key={r.key}><td>{r.key}</td><td className="num">{r.count}</td><td className="num">{money(r.revenue)}</td><td className={`num${lowPct(r.grossPct)}`}>{pct(r.grossPct)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {lows.length > 0 && (
        <section className="report-block">
          <h3>Lowest margins (jobs of $1,500 or more)</h3>
          <table className="report-table">
            <thead><tr><th>Customer</th><th>Completed</th><th className="num">Contract</th><th className="num">Gross profit</th><th className="num">Margin</th></tr></thead>
            <tbody>
              {lows.map(({ job, c }) => (
                <tr key={job.id}><td>{job.name} <small className="muted">{job.jobNumber}</small></td><td>{dateLabel(job.completeDate)}</td><td className="num">{money(job.contractValue)}</td><td className="num">{money(c.grossActual)}</td><td className="num low">{pct(c.actualPct)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}
