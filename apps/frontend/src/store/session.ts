import type { Wallet } from "shared";
import { create } from "zustand";

interface SessionState {
  sessionId: string;
  wallet: Wallet | null;
  setWallet: (wallet: Wallet | null) => void;
}

function newSessionId(): string {
  return crypto.randomUUID();
}

/** `/speckit-clarify`の決定により、1ユーザーは常に最大1つのウォレットしか持たない。 */
export const useSessionStore = create<SessionState>((set) => ({
  sessionId: newSessionId(),
  wallet: null,
  setWallet: (wallet) => set({ wallet }),
}));
