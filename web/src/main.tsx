import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

const useMocks =
  import.meta.env.VITE_USE_MOCKS === "true" || import.meta.env.DEV;

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
