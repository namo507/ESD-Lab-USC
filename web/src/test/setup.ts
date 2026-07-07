import "@testing-library/jest-dom/vitest";

function ensureStorage(name: "localStorage" | "sessionStorage") {
  const current = window[name] as Storage | undefined;
  if (
    current
    && typeof current.getItem === "function"
    && typeof current.setItem === "function"
    && typeof current.removeItem === "function"
    && typeof current.clear === "function"
  ) {
    return;
  }

  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };

  Object.defineProperty(window, name, {
    configurable: true,
    value: storage,
  });
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
