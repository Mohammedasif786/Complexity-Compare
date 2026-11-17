type Msg = { code: string; fn: string; input: 'array' | 'number' | 'string'; sizes: number[] };
const ctx = self as unknown as Worker;

const make = (kind: Msg['input'], n: number): number | number[] | string =>
  kind === 'array'
    ? Array.from({ length: n }, () => Math.floor(Math.random() * n))
    : kind === 'number'
      ? n
      : Array.from({ length: n }, () => 'abcdefghij'[Math.floor(Math.random() * 10)]).join('');

ctx.onmessage = (e: MessageEvent<Msg>) => {
  const { code, fn, input, sizes } = e.data;
  let f: (x: unknown) => unknown;
  try {
    f = new Function(`${code}\n;return ${fn};`)();
    if (typeof f !== 'function') throw new Error(`"${fn}" is not a function`);
  } catch (err) {
    ctx.postMessage({ error: String(err) });
    return;
  }
  try {
    for (const n of sizes) {
      const data = make(input, n);
      let runs = 0, total = 0;
      do {
        const arg = Array.isArray(data) ? data.slice() : data;
        const t0 = performance.now();
        f(arg);
        total += performance.now() - t0;
        runs++;
      } while (total < 20 && runs < 200);
      ctx.postMessage({ n, ms: total / runs });
    }
    ctx.postMessage({ done: true });
  } catch (err) {
    ctx.postMessage({ error: String(err) });
  }
};
