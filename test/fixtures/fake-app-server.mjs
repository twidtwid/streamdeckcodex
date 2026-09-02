import { createInterface } from "node:readline";

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  if (message.method === "fixture/oversize") {
    process.stdout.write("x".repeat(1_024));
    return;
  }
  if (message.method === "fixture/hang") return;
  process.stdout.write(
    `${JSON.stringify({ id: message.id, result: { method: message.method } })}\n`,
  );
});
