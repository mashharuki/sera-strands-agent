import { QueryClient } from "@tanstack/react-query";
import type { paths } from "api-spec/generated/types.js";
import createClient from "openapi-fetch";

/**
 * contracts/openapi.yaml から生成された型（packages/api-spec/generated/types.ts）を
 * 使った型安全なfetchクライアント。Authorizationヘッダーは呼び出し側
 * （usePrivy().getAccessToken()）から都度渡す。
 */
export function createApiClient(getAccessToken: () => Promise<string | null>) {
  const client = createClient<paths>({
    baseUrl: import.meta.env.VITE_API_URL ?? "",
  });
  client.use({
    async onRequest({ request }) {
      const token = await getAccessToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
  });
  return client;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});
