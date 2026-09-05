// Will this model fit on that GPU? Same heuristic as the VRAM calculator on
// aiopsfieldnotes.com/tools/vram-calculator/.
import GPUS from "../data/gpus.js";

export function fit({ params_b, quant_bits, context_tokens }) {
  const weights = (params_b * quant_bits) / 8;             // GB
  const kv_per_1k = Math.max(0.03, params_b * 0.006);      // GB per 1K tokens, GQA-era rule of thumb
  const kv = kv_per_1k * (context_tokens / 1024);
  const total = (weights + kv) * 1.15;                     // +15% runtime overhead
  return {
    weights_gb: weights, kv_cache_gb: kv, total_gb: total,
    gpus: GPUS.map((g) => ({ ...g, fits: g.vram_gb >= total, headroom_gb: g.vram_gb - total })),
  };
}

export function renderFit({ params_b, quant_bits, context_tokens }, r) {
  const fits = r.gpus.filter((g) => g.fits);
  const w = Math.max(...r.gpus.map((g) => g.name.length));
  const table = r.gpus
    .map((g) => `  ${g.fits ? "fits    " : "too big "} ${g.name.padEnd(w)}  ${String(g.vram_gb).padStart(3)} GB` +
      (g.fits ? `  (${g.headroom_gb.toFixed(1)} GB spare)` : ""))
    .join("\n");

  const smallest = fits.sort((a, b) => a.vram_gb - b.vram_gb)[0];
  const advice = smallest
    ? `Smallest card that fits: ${smallest.name} (${smallest.vram_gb} GB).`
    : "Nothing in the list fits — drop to a lower quantisation, shorten the context, or shard across more GPUs.";

  return [
    `${params_b}B params at ${quant_bits}-bit, ${context_tokens.toLocaleString()}-token context`,
    ``,
    `  Total needed  ≈ ${r.total_gb.toFixed(1)} GB`,
    `  weights ${r.weights_gb.toFixed(1)} GB · KV cache ~${r.kv_cache_gb.toFixed(1)} GB · +15% overhead`,
    ``,
    table,
    ``,
    advice,
    `Estimates, not guarantees: attention implementation, batch size and framework overhead all move the real number.`,
    `Mac figures assume ~75% of unified memory is usable for the model.`,
  ].join("\n");
}
