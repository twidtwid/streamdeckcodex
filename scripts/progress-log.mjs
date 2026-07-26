const line = process.argv.slice(2).join(" ").replace(/\s+/g, " ").trim();

if (!line) {
  console.error('Usage: npm run progress:log -- "Current activity line"');
  process.exitCode = 2;
} else {
  const port = Number.parseInt(process.env.CODEX_PROGRESS_PORT || "4317", 10);
  const response = await fetch(`http://127.0.0.1:${port}/api/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ line, kind: "transition" }),
  });
  if (!response.ok) {
    console.error(`Progress endpoint returned HTTP ${response.status}`);
    process.exitCode = 1;
  } else {
    const result = await response.json();
    console.log(`${result.entry.at} ${result.entry.line}`);
  }
}
