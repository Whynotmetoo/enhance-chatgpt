export const PROMPTS_STORAGE_KEY = "ecg.prompts.v1";

export type SavedPrompt = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
};
