import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme, loadInitialTheme } from "./store/ui";

const useMocks =
  import.meta.env.VITE_USE_MOCKS === "true" || import.meta.env.DEV;

/** Apply persisted/system theme before React paints to avoid FOUC. */
applyTheme(loadInitialTheme());

async function bootstrap() {
  if (useMocks) {
    const { installMockServer } = await import("./api/mockServer");
    installMockServer();
  }

  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root");

  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootstrap();
