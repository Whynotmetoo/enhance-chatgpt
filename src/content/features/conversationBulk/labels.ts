import type { BulkAction, BulkDialogState, BulkFailure, BulkScope } from "./types";

export function actionProgressLabel(action: BulkAction): string {
  return action === "delete" ? "Deleting" : "Archiving";
}

export function actionProgressTitle(action: BulkAction): string {
  return `${actionProgressLabel(action)} chats...`;
}

export function actionPastLabel(action: BulkAction): string {
  return action === "delete" ? "Deleted" : "Archived";
}

export function actionConfirmLabel(action: BulkAction): string {
  return action === "delete" ? "Confirm deletion" : "Confirm archive";
}

export function pluralizeConversation(count: number): string {
  return `${count} conversation${count === 1 ? "" : "s"}`;
}

export function completionToastMessage(
  action: BulkAction,
  succeeded: number,
  failed: BulkFailure[],
  scope: BulkScope
): string {
  const successMessage =
    action === "delete" && scope === "all" && failed.length === 0
      ? "Deleted all chats."
      : `${actionPastLabel(action)} ${pluralizeConversation(succeeded)}.`;
  const failureMessage =
    failed.length > 0
      ? ` ${failed.length} failed${failed[0]?.error ? `: ${failed[0].error}` : "."}`
      : "";

  return `${successMessage}${failureMessage}`;
}

export function bulkDialogTitle(dialog: BulkDialogState | null): string {
  if (dialog?.status === "running") {
    return dialog.scope === "all" && dialog.action === "delete"
      ? "Deleting all chats..."
      : actionProgressTitle(dialog.action);
  }

  if (dialog?.status === "confirm") {
    if (dialog.scope === "all" && dialog.action === "delete") {
      return "Clear your chat history - are you sure?";
    }

    return dialog.action === "delete" ? "Delete chats?" : "Archive chats";
  }

  return "Confirm batch action";
}

export function bulkDialogDescription(dialog: BulkDialogState | null): string {
  if (dialog?.status === "running") {
    return dialog.scope === "all" && dialog.action === "delete"
      ? "Do not close this page until the operation finishes."
      : `${dialog.remaining} of ${dialog.total} remaining. Do not close this page until the operation finishes.`;
  }

  if (dialog?.status === "confirm") {
    return dialog.scope === "all" && dialog.action === "delete"
      ? "This will delete all chats, including those in Projects and archived conversations."
      : `This will ${dialog.action} ${pluralizeConversation(dialog.items.length)}.`;
  }

  return "";
}
