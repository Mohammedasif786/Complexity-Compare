// Heuristic static complexity analysis for brace-style code (JS/TS/Java/C-like).
export interface Cx {
  exp: boolean;
  poly: number;
  log: number;
}
export interface Analysis {
  time: Cx;
  space: Cx;
  timeWhy: string[];
  spaceWhy: string[];
}

const O1: Cx = { exp: false, poly: 0, log: 0 };
const cx = (poly: number, log = 0): Cx => ({ exp: false, poly, log });
const EXP: Cx = { exp: true, poly: 0, log: 0 };
export const rank = (c: Cx) => (c.exp ? 1e6 : c.poly * 100 + c.log);
const max = (a: Cx, b: Cx) => (rank(b) > rank(a) ? b : a);
const sup = (n: number) => [...String(n)].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]).join("");

export function label(c: Cx): string {
  if (c.exp) return "O(2ⁿ)";
  const p = c.poly === 0 ? "" : c.poly === 1 ? "n" : `n${sup(c.poly)}`;
  const l = c.log === 0 ? "" : c.log === 1 ? "log n" : `log${sup(c.log)} n`;
  return `O(${[p, l].filter(Boolean).join(" ") || "1"})`;
}

export function detectFn(code: string): string {
  const m =
    /function\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[\w$]+\s*=>)/.exec(
      code,
    );
  return m ? m[1] || m[2] : "";
}

const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, (m) => " ".repeat(m.length))
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (m) => m.replace(/[^\n]/g, " "));

const R = {
  loopCall:
    /\.\s*(?:forEach|map|filter|reduce|reduceRight|some|every|find|findIndex|flatMap)\s*\(/y,
  sort: /\.\s*sort\s*\(/y,
  linear:
    /\.\s*(?:includes|indexOf|lastIndexOf|slice|concat|join|splice|reverse|fill|split|flat)\s*\(/y,
  grow: /\.\s*(?:push|add|set|unshift)\s*\(/y,
  kw: /(?:for|while|do)\b/y,
};
const at = (re: RegExp, s: string, i: number) => (
  (re.lastIndex = i),
  re.test(s)
);

const HALVING =
  /(\w+)\s*=\s*\1\s*[*/]\s*\d|[*/]=\s*\d|>>=|<<=|>>\s*1\b|<<\s*1\b|\bmid\b|Math\.floor\([^)]*\/\s*\d/;
const DIVIDE = /\/\s*2\b|>>\s*1\b|\bmid\b|Math\.floor\([^)]*\/\s*\d/;
const MEMO = /\b(?:memo|cache|dp|seen|visited)\b|new\s+Map|new\s+Set/i;
const ALLOC =
  /\bnew\s+(?:Array|Map|Set)\b|\bArray\s*\(|\bArray\.from\s*\(|\.\s*(?:map|filter|slice|concat|split|flat|flatMap)\s*\(|\[\s*\.\.\./;
const MATRIX =
  /(?:Array\.from\([^;]*?=>|\.map\([^;]*?=>|\.fill\()\s*(?:new\s+Array|Array\s*\(|Array\.from|\[\s*\])/;
const FN =
  /function\s+([\w$]+)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\s*\([^)]*\)\s*|\([^)]*\)\s*=>\s*|[\w$]+\s*=>\s*)(\{)?/g;

interface Frame {
  start: number;
  end: number;
  depth: number;
  state: "header" | "body" | "stmt" | "call";
  kind: "loop" | "call";
  isDo: boolean;
}
interface Ev {
  pos: number;
  kind: "sort" | "linear" | "grow";
}

function scan(s: string) {
  const frames: Frame[] = [],
    open: Frame[] = [],
    events: Ev[] = [];
  let depth = 0;
  const prevIdx = (i: number) => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;
    return j;
  };
  const nextCh = (i: number) => {
    while (i < s.length && /\s/.test(s[i])) i++;
    return s[i] ?? "";
  };
  const push = (f: Frame) => {
    frames.push(f);
    open.push(f);
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ".") {
      if (at(R.loopCall, s, i))
        push({
          start: i,
          end: s.length,
          depth,
          state: "call",
          kind: "call",
          isDo: false,
        });
      else if (at(R.sort, s, i)) events.push({ pos: i, kind: "sort" });
      else if (at(R.linear, s, i)) events.push({ pos: i, kind: "linear" });
      else if (at(R.grow, s, i)) events.push({ pos: i, kind: "grow" });
    } else if (
      /[A-Za-z_$]/.test(c) &&
      !/[\w$.]/.test(s[i - 1] ?? " ") &&
      at(R.kw, s, i)
    ) {
      const isDo = s.startsWith("do", i) && !s.startsWith("double", i);
      const tail =
        s.startsWith("while", i) &&
        frames.some((f) => f.isDo && f.end === prevIdx(i) + 1);
      if (!tail)
        push({
          start: i,
          end: s.length,
          depth,
          state: isDo ? "body" : "header",
          kind: "loop",
          isDo,
        });
    } else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      depth--;
      for (let k = open.length - 1; k >= 0; k--) {
        const f = open[k];
        if (
          depth < f.depth ||
          (depth === f.depth && (f.state === "body" || f.state === "call"))
        ) {
          f.end = i + 1;
          open.splice(k, 1);
        } else if (depth === f.depth && f.state === "header")
          f.state = nextCh(i + 1) === "{" ? "body" : "stmt";
      }
    } else if (c === ";") {
      for (let k = open.length - 1; k >= 0; k--)
        if (open[k].state === "stmt" && depth === open[k].depth) {
          open[k].end = i + 1;
          open.splice(k, 1);
        }
    }
  }
  return { frames, events };
}

function bodyOf(s: string, end: number) {
  if (s[end - 1] === "{") {
    let d = 1,
      i = end;
    while (i < s.length && d > 0) {
      if (s[i] === "{") d++;
      else if (s[i] === "}") d--;
      i++;
    }
    return s.slice(end, i);
  }
  const m = /[;\n]/.exec(s.slice(end));
  return s.slice(end, m ? end + m.index : s.length);
}

export function analyze(code: string): Analysis {
  const s = strip(code);
  const { frames, events } = scan(s);
  const logs = new Set<Frame>();
  for (const f of frames) {
    if (f.kind !== "loop") continue;
    const t = s.slice(f.start, f.end).split("");
    for (const c of frames)
      if (c !== f && c.start >= f.start && c.end <= f.end)
        t.fill(" ", c.start - f.start, c.end - f.start);
    if (HALVING.test(t.join(""))) logs.add(f);
  }
  const count = (pos: number) => {
    let p = 0,
      l = 0;
    for (const f of frames)
      if (f.start <= pos && pos < f.end) logs.has(f) ? l++ : p++;
    return { p, l };
  };

  const timeWhy: string[] = [],
    spaceWhy: string[] = [];
  let loop = O1,
    time = O1,
    grow = O1;
  for (const f of frames) {
    const { p, l } = count(f.start);
    loop = max(loop, cx(p, l));
  }
  time = loop;
  if (frames.length)
    timeWhy.push(
      `Loop nesting (for, while, map, forEach, filter...) gives ${label(loop)}`,
    );
  if (logs.size)
    timeWhy.push(
      "A loop that halves or doubles its counter contributes log n instead of n",
    );
  let sorted = false,
    scans = false;
  for (const e of events) {
    const { p, l } = count(e.pos);
    if (e.kind === "linear") {
      scans = true;
      time = max(time, cx(p + 1, l));
    } else if (e.kind === "sort") {
      sorted = true;
      time = max(time, cx(p + 1, l + 1));
    } else if (p + l > 0) grow = max(grow, cx(p, l));
  }
  if (sorted) timeWhy.push(".sort() costs O(n log n) per call");
  if (scans)
    timeWhy.push(
      "Built-ins like slice, includes, indexOf and join scan the whole input, O(n) each",
    );

  // Recursion: count self-calls inside each function's own body.
  let calls = 0;
  for (const m of s.matchAll(FN)) {
    const name = m[1] || m[2];
    const body = bodyOf(s, m.index! + m[0].length);
    const n = (
      body.match(new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\s*\\(`, "g")) ||
      []
    ).length;
    calls = Math.max(calls, n);
  }
  const divide = DIVIDE.test(s),
    memo = MEMO.test(s),
    d = loop.poly;
  let stack = O1;
  if (calls >= 2) {
    if (memo) {
      time = max(time, cx(d + 1));
      stack = cx(1);
      timeWhy.push(
        "Recursion with memoization: each subproblem is solved once",
      );
    } else if (divide) {
      time = max(time, d >= 1 ? cx(d, 1) : cx(1));
      stack = cx(0, 1);
      timeWhy.push("Recursion splits the input in half (divide and conquer)");
    } else {
      time = max(time, EXP);
      stack = cx(1);
      timeWhy.push(
        `${calls} self-calls without memoization or halving give exponential time`,
      );
    }
  } else if (calls === 1) {
    if (divide) {
      time = max(time, cx(d, 1));
      stack = cx(0, 1);
      timeWhy.push("Single recursive call on half the input");
    } else {
      time = max(time, cx(d + 1));
      stack = cx(1);
      timeWhy.push("Single recursive call per step: depth grows linearly");
    }
  }
  if (time === O1)
    timeWhy.push("No loops, scans or recursion found, so constant time");

  let space = O1;
  if (ALLOC.test(s)) {
    space = cx(1);
    spaceWhy.push(
      "Creates a copy or new collection (new Array/Map/Set, slice, map, filter, spread)",
    );
  }
  if (rank(grow) > 0) {
    space = max(space, grow);
    spaceWhy.push(
      `push, add or set inside loops grows a collection to ${label(grow)}`,
    );
  }
  if (MATRIX.test(s)) {
    space = max(space, cx(2));
    spaceWhy.push("2D structure (array of arrays) allocated");
  }
  if (rank(stack) > 0) {
    space = max(space, stack);
    spaceWhy.push(`Recursion call stack adds ${label(stack)}`);
  }
  if (space === O1)
    spaceWhy.push("Only scalar variables and in-place updates found");

  return { time, space, timeWhy, spaceWhy };
}
