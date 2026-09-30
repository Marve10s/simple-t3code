import { FolderIcon, LaptopIcon, ServerIcon } from "lucide-react";

import type { EnvMode } from "../BranchToolbar.logic";

export function CodexComposerTray(props: {
  projectTitle: string;
  environmentLabel: string | null;
  isRemoteEnvironment: boolean;
  showWorktreeToggle: boolean;
  worktreeChecked: boolean;
  worktreeLocked: boolean;
  onWorktreeChange: (mode: EnvMode) => void;
}) {
  const MachineIcon = props.isRemoteEnvironment ? ServerIcon : LaptopIcon;
  return (
    <div data-codex-part="composer-tray" data-codex-composer-tray="">
      <span data-codex-part="composer-tray-item">
        <FolderIcon />
        <span className="truncate">{props.projectTitle}</span>
      </span>
      <span data-codex-part="composer-tray-item">
        <MachineIcon />
        <span className="truncate">{props.environmentLabel ?? "This computer"}</span>
      </span>
      {props.showWorktreeToggle ? (
        <label data-codex-part="composer-tray-worktree">
          Worktree
          <input
            type="checkbox"
            checked={props.worktreeChecked}
            disabled={props.worktreeLocked}
            onChange={(event) =>
              props.onWorktreeChange(event.target.checked ? "worktree" : "local")
            }
          />
        </label>
      ) : null}
    </div>
  );
}
