export interface StripItem {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "warn" | "low";
}

/** One row of totals divided by window mullions. */
export function Strip({ items }: { items: StripItem[] }) {
  return (
    <dl className="strip">
      {items.map((i) => (
        <div key={i.label} className={i.tone ?? ""}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
          {i.note && <small>{i.note}</small>}
        </div>
      ))}
    </dl>
  );
}
