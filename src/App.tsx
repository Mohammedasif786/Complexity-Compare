import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { analyze, detectFn, label, rank, type Cx } from "./analyzer";
import {
  BenchResult,
  InputKind,
  growthExponent,
  makeSizes,
  runBenchmark,
} from "./benchmark";

const SAMPLE_A = `function solve(arr) {
  const a = arr.slice();
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length - i - 1; j++) {
      if (a[j] > a[j + 1]) {
        const t = a[j]; a[j] = a[j + 1]; a[j + 1] = t;
      }
    }
  }
  return a;
}`;
const SAMPLE_B = `function solve(arr) {
  return arr.slice().sort((x, y) => x - y);
}`;

function playCompletionTone(context: AudioContext) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(1174.66, now + 0.12);
  volume.gain.setValueAtTime(0.0001, now);
  volume.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.37);
}

type Winner = "A" | "B" | "Tie";
const byCx = (a: Cx, b: Cx): Winner =>
  rank(a) < rank(b) ? "A" : rank(a) > rank(b) ? "B" : "Tie";

interface PanelProps {
  title: string;
  number: string;
  code: string;
  setCode: (v: string) => void;
  fn: string;
  setFn: (v: string) => void;
  detected: string;
}
function Panel({
  title,
  number,
  code,
  setCode,
  fn,
  setFn,
  detected,
}: PanelProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        borderTop: "3px solid",
        borderTopColor: number === "01" ? "primary.main" : "secondary.main",
      }}
    >
      <Stack spacing={2}>
        <Stack
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Chip
              label={number}
              size="small"
              color={number === "01" ? "primary" : "secondary"}
              sx={{ fontWeight: 700 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
          </Stack>
          <TextField
            size="small"
            label="Function to benchmark"
            placeholder={detected || "name"}
            value={fn}
            onChange={(e) => setFn(e.target.value)}
            helperText={detected ? `Detected: ${detected}` : "Enter a function name"}
            sx={{ width: { xs: "100%", sm: 240 } }}
          />
        </Stack>
        <TextField
          label={`${title} code`}
          multiline
          minRows={16}
          maxRows={22}
          fullWidth
          value={code}
          onChange={(e) => setCode(e.target.value)}
          slotProps={{
            htmlInput: {
              spellCheck: false,
              style: {
                fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.65,
              },
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              alignItems: "flex-start",
              bgcolor: "action.hover",
            },
          }}
        />
      </Stack>
    </Paper>
  );
}

function Cell({ value, win }: { value: string; win: boolean }) {
  return (
    <TableCell>
      {win ? <Chip size="small" color="success" label={value} /> : value}
    </TableCell>
  );
}

export default function App() {
  const [codeA, setCodeA] = useState(SAMPLE_A);
  const [codeB, setCodeB] = useState(SAMPLE_B);
  const [fnA, setFnA] = useState("");
  const [fnB, setFnB] = useState("");
  const [input, setInput] = useState<InputKind>("array");
  const [maxN, setMaxN] = useState(5000);
  const [running, setRunning] = useState(false);
  const [bench, setBench] = useState<{ a?: BenchResult; b?: BenchResult }>({});
  const [runError, setRunError] = useState("");
  const [soundError, setSoundError] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);

  const A = useMemo(() => analyze(codeA), [codeA]);
  const B = useMemo(() => analyze(codeB), [codeB]);
  const detectedA = useMemo(() => detectFn(codeA), [codeA]);
  const detectedB = useMemo(() => detectFn(codeB), [codeB]);
  const nameA = fnA || detectedA;
  const nameB = fnB || detectedB;

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      if (context && context.state !== "closed") void context.close();
    },
    [],
  );

  const run = async () => {
    setRunning(true);
    setBench({});
    setRunError("");
    setSoundError("");
    let soundContext: AudioContext | null = null;
    try {
      soundContext = audioContextRef.current ?? new window.AudioContext();
      audioContextRef.current = soundContext;
      await soundContext.resume();
    } catch (error) {
      setSoundError(
        error instanceof Error
          ? `Completion sound unavailable: ${error.message}`
          : "Completion sound is unavailable in this browser.",
      );
    }
    const sizes = makeSizes(input, maxN);
    try {
      const [a, b] = await Promise.all([
        runBenchmark(codeA, nameA, input, sizes),
        runBenchmark(codeB, nameB, input, sizes),
      ]);
      setBench({ a, b });
      if (soundContext?.state === "running" && !a.error && !b.error) {
        try {
          playCompletionTone(soundContext);
        } catch (error) {
          setSoundError(
            error instanceof Error
              ? `Could not play completion sound: ${error.message}`
              : "Could not play the completion sound.",
          );
        }
      }
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "The benchmark could not start.",
      );
    } finally {
      setRunning(false);
    }
  };

  const ea = bench.a ? growthExponent(bench.a.samples) : null;
  const eb = bench.b ? growthExponent(bench.b.samples) : null;
  const measuredWin: Winner =
    ea == null || eb == null || Math.abs(ea - eb) < 0.3
      ? "Tie"
      : ea < eb
        ? "A"
        : "B";
  const fmt = (e: number | null) => (e == null ? "n/a" : `~ n^${e.toFixed(2)}`);

  const rows: { name: string; a: string; b: string; win: Winner }[] = [
    {
      name: "Time (static)",
      a: label(A.time),
      b: label(B.time),
      win: byCx(A.time, B.time),
    },
    {
      name: "Space (static)",
      a: label(A.space),
      b: label(B.space),
      win: byCx(A.space, B.space),
    },
    ...(bench.a || bench.b
      ? [{ name: "Measured growth", a: fmt(ea), b: fmt(eb), win: measuredWin }]
      : []),
  ];

  const sizes = Array.from(
    new Set(
      [...(bench.a?.samples ?? []), ...(bench.b?.samples ?? [])].map(
        (s) => s.n,
      ),
    ),
  ).sort((x, y) => x - y);
  const series = (r?: BenchResult) => {
    const bySize = new Map<number, number>();
    r?.samples.forEach((sample) => bySize.set(sample.n, sample.ms));
    return sizes.map((n) => bySize.get(n) ?? null);
  };
  const notes = [
    ["Solution A", bench.a],
    ["Solution B", bench.b],
  ] as const;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="static"
        elevation={0}
        sx={{
          background: "linear-gradient(110deg, #102a43 0%, #0f766e 100%)",
        }}
      >
        <Toolbar sx={{ minHeight: 72 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              mr: 1.5,
              display: "grid",
              placeItems: "center",
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.16)",
              fontWeight: 800,
            }}
          >
            {"</>"}
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 750, lineHeight: 1.2 }}>
              Complexity Compare
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.75)" }}>
              Static analysis and live benchmarks
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <Box sx={{ maxWidth: 760, mb: 0.5 }}>
            <Chip
              label="ALGORITHM WORKSPACE"
              size="small"
              sx={{
                mb: 1.5,
                fontWeight: 700,
                letterSpacing: 0.6,
                bgcolor: "action.selected",
              }}
            />
            <Typography
              variant="h3"
              component="h1"
              sx={{
                fontSize: { xs: "2rem", md: "2.75rem" },
                fontWeight: 800,
                letterSpacing: "-0.04em",
                mb: 1,
              }}
            >
              Compare the cost of your code.
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: { md: 17 } }}>
              Paste two implementations to inspect their estimated time and
              space complexity, then benchmark them with real inputs.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2,
            }}
          >
            <Panel
              title="Solution A"
              number="01"
              code={codeA}
              setCode={setCodeA}
              fn={fnA}
              setFn={setFnA}
              detected={detectedA}
            />
            <Panel
              title="Solution B"
              number="02"
              code={codeB}
              setCode={setCodeB}
              fn={fnB}
              setFn={setFnB}
              detected={detectedB}
            />
          </Box>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 750 }}>
                  Complexity overview
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Estimated from code structure; actual performance can vary.
                </Typography>
              </Box>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 560 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Measure</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Solution A</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Solution B</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>More efficient</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell>{r.name}</TableCell>
                        <Cell value={r.a} win={r.win === "A"} />
                        <Cell value={r.b} win={r.win === "B"} />
                        <TableCell>
                          {r.win === "Tie" ? (
                            <Chip size="small" variant="outlined" label="Tie" />
                          ) : (
                            <Chip
                              size="small"
                              color="success"
                              variant="outlined"
                              label={`Solution ${r.win}`}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Divider />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2,
                }}
              >
                {[
                  { title: "Solution A", analysis: A },
                  { title: "Solution B", analysis: B },
                ].map(({ title, analysis }) => (
                  <Box key={title}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {title}: analysis notes
                    </Typography>
                    <Box
                      component="ul"
                      sx={{
                        m: 0,
                        pl: 3,
                        color: "text.secondary",
                        fontSize: 14,
                      }}
                    >
                      {[
                        ...analysis.timeWhy.map((x) => `Time: ${x}`),
                        ...analysis.spaceWhy.map((x) => `Space: ${x}`),
                      ].map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 750 }}>
                  Live benchmark
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Runs both solutions in isolated workers against increasing
                  input sizes.
                </Typography>
              </Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems={{ sm: "center" }}
              >
                <TextField
                  select
                  size="small"
                  label="Input type"
                  value={input}
                  onChange={(e) => {
                    const k = e.target.value as InputKind;
                    setInput(k);
                    setMaxN(k === "number" ? 30 : 5000);
                  }}
                  sx={{ minWidth: { sm: 200 } }}
                >
                  <MenuItem value="array">Array of n numbers</MenuItem>
                  <MenuItem value="number">Number n</MenuItem>
                  <MenuItem value="string">String of length n</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  type="number"
                  label="Max n"
                  value={maxN}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value)) setMaxN(Math.max(1, value));
                  }}
                  inputProps={{ min: 1 }}
                  sx={{ width: { sm: 140 } }}
                />
                <Button
                  variant="contained"
                  onClick={run}
                  disabled={running || !nameA || !nameB}
                  sx={{ minHeight: 40, px: 2.5, fontWeight: 700 }}
                >
                  {running ? "Running..." : "Run benchmark"}
                </Button>
              </Stack>
              {running && <LinearProgress />}
              {runError && <Alert severity="error">{runError}</Alert>}
              {soundError && <Alert severity="warning">{soundError}</Alert>}
              {notes.map(
                ([t, r]) =>
                  r?.error && (
                    <Alert key={t} severity="error">
                      {t}: {r.error}
                    </Alert>
                  ),
              )}
              {notes.map(
                ([t, r]) =>
                  r?.timedOut && (
                    <Alert key={t} severity="warning">
                      {t} took over 4 s for one size and was stopped. Lower max
                      n.
                    </Alert>
                  ),
              )}
              {sizes.length > 0 && (
                <Box sx={{ width: "100%", overflow: "hidden" }}>
                  <LineChart
                    height={320}
                    xAxis={[{ data: sizes, scaleType: "point", label: "Input size (n)" }]}
                    yAxis={[{ label: "Time per run (ms)" }]}
                    series={[
                      {
                        data: series(bench.a),
                        label: "Solution A",
                        connectNulls: true,
                      },
                      {
                        data: series(bench.b),
                        label: "Solution B",
                        connectNulls: true,
                      },
                    ]}
                  />
                </Box>
              )}
              {!running && sizes.length === 0 && (
                <Typography color="text.secondary">
                  Run the benchmark to see measured time for growing input
                  sizes.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
