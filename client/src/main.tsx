import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App";
import { AuthProvider } from "./components/AuthProvider";
import "./index.css";

const sentryEnv = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;

Sentry.init({
  dsn: sentryEnv.VITE_SENTRY_DSN,
  environment: sentryEnv.MODE,
  enabled: !!sentryEnv.VITE_SENTRY_DSN,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
