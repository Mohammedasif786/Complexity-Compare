export type InputKind = 'array' | 'number' | 'string';
export interface Sample { n: number; ms: number }
export interface BenchResult { samples: Sample[]; error?: string; timedOut?: boolean }

export function makeSizes(kind: InputKind, max: number): number[] {
  if (kind === 'number') return Array.from({ length: 8 }, (_, i) => Math.max(1, Math.round((max * (i + 1)) / 8)));
  const sizes: number[] = [];
  for (let n = Math.max(50, Math.floor(max / 64)); n <= max; n *= 2) sizes.push(n);
  return sizes;
}

export function runBenchmark(code: string, fn: string, input: InputKind, sizes: number[], stepTimeoutMs = 4000): Promise<BenchResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const samples: Sample[] = [];
    let timer = 0;
    const finish = (r: Partial<BenchResult>) => { clearTimeout(timer); worker.terminate(); resolve({ samples, ...r }); };
    const arm = () => { clearTimeout(timer); timer = window.setTimeout(() => finish({ timedOut: true }), stepTimeoutMs); };
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.error) finish({ error: d.error });
      else if (d.done) finish({});
      else { samples.push(d); arm(); }
    };
    worker.onerror = (e) => finish({ error: e.message });
    arm();
    worker.postMessage({ code, fn, input, sizes });
  });
}

// Least-squares slope of ln(ms) against ln(n): roughly the exponent k in n^k.
export function growthExponent(samples: Sample[]): number | null {
  const pts = samples.filter((s) => s.ms > 0 && s.n > 1).map((s) => [Math.log(s.n), Math.log(s.ms)]);
  if (pts.length < 3) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return den === 0 ? null : num / den;
}
