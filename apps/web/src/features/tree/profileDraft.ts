import { create } from 'zustand';

interface ProfileDraftState {
  /** The open profile form has changes that are not saved. */
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}

/** Read by UnsentChangesGuard, which owns the app's one navigation blocker. */
export const useProfileDraft = create<ProfileDraftState>()((set) => ({
  dirty: false,
  setDirty: (dirty) => set({ dirty }),
}));

export function discardProfileDraft(): void {
  useProfileDraft.setState({ dirty: false });
}
