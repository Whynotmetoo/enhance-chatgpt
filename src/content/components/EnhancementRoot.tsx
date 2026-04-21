import type { ReactElement } from "react";
import { ConversationBulkManager } from "../features/ConversationBulkManager";
import { ConversationOutline } from "../features/ConversationOutline";
import { PromptManager } from "../features/PromptManager";

export function EnhancementRoot(): ReactElement {
  return (
    <>
      <ConversationBulkManager />
      <PromptManager />
      <ConversationOutline />
    </>
  );
}
