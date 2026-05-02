export type ConversationItem = {
  id: string;
  title: string;
  href: string;
  row: HTMLElement;
};

export type BulkAction = "delete" | "archive";
export type BulkScope = "selected" | "all";

export type BulkFailure = {
  error: string;
  id: string;
  status?: number;
  title: string;
};

export type BulkDialogState =
  | {
      action: BulkAction;
      items: ConversationItem[];
      scope: BulkScope;
      status: "confirm";
    }
  | {
      action: BulkAction;
      failed: BulkFailure[];
      remaining: number;
      scope: BulkScope;
      status: "running";
      succeeded: number;
      total: number;
    };

export type BulkToast = {
  id: number;
  left: number;
  message: string;
  tone: "info" | "error";
};

export type HeaderControls = {
  actionsHost: HTMLElement;
  recentsButton: HTMLButtonElement;
  selectHost: HTMLElement;
};

export type ArchiveMenuPosition = {
  left: number;
  top: number;
};
