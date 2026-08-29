import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});
const { registerWebMcpTools } = await vite.ssrLoadModule("/app/webmcp-registration.ts");

test.after(async () => vite.close());

const tool = (name) => ({
  name,
  description: `${name} description`,
  inputSchema: { type: "object", properties: {} },
  execute: () => ({ name }),
});

test("resolved registrations become registered only after resolution", async () => {
  let resolveRegistration;
  const modelContext = { registerTool: () => new Promise((resolve) => { resolveRegistration = resolve; }) };
  const registration = registerWebMcpTools(modelContext, [tool("resolved")]);
  let settled = false;
  registration.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  resolveRegistration();
  assert.deepEqual([...await registration], ["resolved"]);
});

test("rejected registrations can be retried", async () => {
  let calls = 0;
  const modelContext = { registerTool: async () => { calls += 1; if (calls === 1) throw new Error("temporary failure"); } };
  assert.deepEqual([...await registerWebMcpTools(modelContext, [tool("retry")])], []);
  assert.deepEqual([...await registerWebMcpTools(modelContext, [tool("retry")])], ["retry"]);
  assert.equal(calls, 2);
});

test("one rejected registration does not prevent other tools", async () => {
  const modelContext = { registerTool: async ({ name }) => { if (name === "bad") throw new Error("bad tool"); } };
  assert.deepEqual([...await registerWebMcpTools(modelContext, [tool("bad"), tool("good")])], ["good"]);
});

test("remount calls deduplicate in-flight registrations", async () => {
  let calls = 0;
  let resolveRegistration;
  const modelContext = { registerTool: () => { calls += 1; return new Promise((resolve) => { resolveRegistration = resolve; }); } };
  const first = registerWebMcpTools(modelContext, [tool("stable")]);
  const second = registerWebMcpTools(modelContext, [tool("stable")]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveRegistration();
  assert.deepEqual([...await first], ["stable"]);
  assert.deepEqual([...await second], ["stable"]);
});
