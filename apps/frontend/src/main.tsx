import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { queryClient } from "./services/apiClient.ts";

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

if (!privyAppId) {
  console.error(
    "VITE_PRIVY_APP_ID is not set. See README for local development setup.",
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* config.embeddedWallets の詳細（ウォレット自動作成のタイミング等）はT032（US1）で確定する */}
    <PrivyProvider appId={privyAppId ?? ""}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </PrivyProvider>
  </StrictMode>,
);
