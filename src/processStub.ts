// react-markdown 4 reads process.cwd(), which only exists in Node.
// Imported first by index.tsx so it is in place before a page renders.
const scope = window as unknown as {
  process?: { cwd: () => string; env: Record<string, string> };
};

if (!scope.process) {
  scope.process = { cwd: () => "/", env: {} };
}

export {};
