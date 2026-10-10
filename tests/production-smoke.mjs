import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const child = spawn(process.execPath, ["script/start.cjs"], {
  env: { ...process.env, PORT: "5058", OPENAI_API_KEY: "" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });
try {
  for (let i = 0; i < 100 && !output.includes("serving on port 5058"); i++) {
    if (child.exitCode !== null) throw new Error(output);
    await delay(100);
  }
  assert.ok(output.includes("serving on port 5058"), output);
  const response = await fetch("http://127.0.0.1:5058", { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="root"/);
  console.log("Production startup and page smoke check passed.");
} finally {
  child.kill();
}
