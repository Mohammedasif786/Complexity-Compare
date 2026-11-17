# Complexity Compare

Paste two solutions, compare their time and space complexity.

    npm install
    npm run dev

- **Static analysis** (live, any brace-style language: JS, TS, Java, C, C++): loop nesting, halving or doubling loops, recursion shape, sort and scan built-ins, allocations. It is a heuristic, so read the "Why" notes.
- **Benchmark** (JavaScript only): runs each function in a Web Worker for growing input sizes, then fits a log-log slope. Slow runs are cut off after 4 s per size.
- For exponential code such as naive fibonacci, choose "number" input and a small max N (for example 30).

Files: `src/analyzer.ts` (static analysis), `src/worker.ts` + `src/benchmark.ts` (timing), `src/App.tsx` (UI).
