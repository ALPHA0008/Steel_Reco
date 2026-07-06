const ROWS: { label: string; computed?: boolean; danger?: boolean; values: string[]; total: string }[] = [
  { label: "A · Received", values: ["4.20", "18.60", "42.10", "88.40", "61.20", "54.90", "43.08"], total: "312.48" },
  {
    label: "C · Net Received",
    computed: true,
    values: ["4.20", "18.60", "40.00", "88.40", "59.80", "54.90", "43.08"],
    total: "308.98",
  },
  {
    label: "D · Issued to Contractor",
    values: ["4.10", "18.10", "39.20", "86.90", "58.40", "53.70", "42.30"],
    total: "302.70",
  },
  {
    label: "K · Total Physical",
    computed: true,
    values: ["0.16", "0.74", "1.28", "3.40", "2.55", "2.42", "1.94"],
    total: "12.49",
  },
  {
    label: "M · Wastage %",
    computed: true,
    danger: true,
    values: ["–", "–", "–", "–", "–", "–", "–"],
    total: "4.97%",
  },
]
const DIAS = ["8", "10", "12", "16", "20", "25", "32"]

/** A real, honest static preview of the Abstract grid — not an illustration. */
export function AbstractMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2.5">
        <span className="grid size-5 place-items-center rounded-full bg-brand text-[9px] font-extrabold text-brand-foreground">
          1
        </span>
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Steel Abstract
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">APAS · April 2026</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="px-3 py-1.5 text-left text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
                Section
              </th>
              {DIAS.map((d) => (
                <th
                  key={d}
                  className="px-2 py-1.5 text-right text-[9px] font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {d}
                </th>
              ))}
              <th className="px-3 py-1.5 text-right text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr
                key={row.label}
                className={row.danger ? "bg-danger-subtle" : i % 2 === 1 ? "bg-background" : undefined}
              >
                <td
                  className={`px-3 py-1.5 text-left font-medium ${row.computed ? "text-info" : "text-foreground"} ${row.danger ? "text-danger font-semibold" : ""}`}
                >
                  {row.label}
                </td>
                {row.values.map((v, j) => (
                  <td key={j} className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                    {v}
                  </td>
                ))}
                <td
                  className={`px-3 py-1.5 text-right font-mono font-semibold tabular-nums ${row.danger ? "text-danger" : "text-foreground"}`}
                >
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
