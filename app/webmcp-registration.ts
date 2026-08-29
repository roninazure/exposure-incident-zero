export type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input?: unknown) => unknown | Promise<unknown>;
};

export type WebMcpModelContext = {
  registerTool: (tool: WebMcpTool) => void | Promise<void>;
};

type RegistrationState = "registered" | Promise<void>;

const statesByContext = new WeakMap<object, Map<string, RegistrationState>>();

export async function registerWebMcpTools(
  modelContext: WebMcpModelContext,
  tools: WebMcpTool[],
): Promise<Set<string>> {
  const states = statesByContext.get(modelContext) ?? new Map<string, RegistrationState>();
  statesByContext.set(modelContext, states);

  const pending = tools.map((tool) => {
    if (states.get(tool.name) === "registered") return Promise.resolve();

    const existing = states.get(tool.name);
    if (existing instanceof Promise) return existing;

    const registration = Promise.resolve()
      .then(() => {
        return modelContext.registerTool(tool);
      })
      .then(() => {
        states.set(tool.name, "registered");
      })
      .catch((error: unknown) => {
        states.delete(tool.name);
      });
    states.set(tool.name, registration);
    return registration;
  });

  await Promise.all(pending);
  return new Set(tools.filter((tool) => states.get(tool.name) === "registered").map((tool) => tool.name));
}
