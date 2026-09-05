// LLM API cost math — the same table and arithmetic as the calculator on
// aiopsfieldnotes.com/tools/llm-cost-calculator/.
import MODELS from "../data/models.js";

const money = (n) =>
  n >= 100 ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : n >= 1 ? "$" + n.toFixed(2)
  : n >= 0.01 ? "$" + n.toFixed(3)
  : "$" + n.toFixed(5);

export function models() {
  return MODELS.map((m) => ({ name: m.name, vendor: m.vendor, in_per_mtok: m.inp, out_per_mtok: m.out, note: m.tag }));
}

export function estimate({ input_tokens, output_tokens, requests_per_month, filter }) {
  const q = (filter || "").trim().toLowerCase();
  const pool = q ? MODELS.filter((m) => (m.name + " " + m.vendor).toLowerCase().includes(q)) : MODELS;
  if (!pool.length) return { rows: [], filtered: q };

  const rows = pool
    .map((m) => {
      const per = (input_tokens / 1e6) * m.inp + (output_tokens / 1e6) * m.out;
      return { name: m.name, vendor: m.vendor, in_per_mtok: m.inp, out_per_mtok: m.out,
               note: m.tag, per_request: per, per_month: per * requests_per_month };
    })
    .sort((a, b) => a.per_month - b.per_month);

  return { rows, filtered: q };
}

export function renderEstimate({ input_tokens, output_tokens, requests_per_month }, { rows, filtered }) {
  if (!rows.length) return `No model matched "${filtered}". Ask for the full list with no filter.`;

  const head = `${input_tokens.toLocaleString()} in + ${output_tokens.toLocaleString()} out tokens per request, ` +
    `${requests_per_month.toLocaleString()} requests/month` + (filtered ? ` (filter: ${filtered})` : "");
  const w = Math.max(...rows.map((r) => r.name.length));
  const body = rows
    .map((r, i) => `${(i === 0 ? "*" : " ")} ${r.name.padEnd(w)}  ${money(r.per_month).padStart(10)}/mo  ` +
      `${money(r.per_request).padStart(9)}/req  ($${r.in_per_mtok.toFixed(2)}/$${r.out_per_mtok.toFixed(2)} per Mtok)` +
      (r.note ? `  [${r.note}]` : ""))
    .join("\n");

  const cheapest = rows[0], dearest = rows[rows.length - 1];
  const ratio = cheapest.per_month > 0 ? (dearest.per_month / cheapest.per_month).toFixed(1) : null;
  const tail = [
    `\nCheapest here is ${cheapest.name}` + (ratio ? `, ${ratio}x below ${dearest.name}.` : "."),
    "Batch APIs run ~50% cheaper at the big three, and prompt caching cuts repeated input cost by up to 90% —",
    "both change this ranking, so price your real traffic shape before switching.",
    "Intro and promo rates in the table expire; check the vendor's page before committing a budget.",
  ].join("\n");

  return `${head}\n\n${body}\n${tail}`;
}
