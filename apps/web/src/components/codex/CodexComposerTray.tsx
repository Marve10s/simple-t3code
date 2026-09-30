import type { EnvMode } from "../BranchToolbar.logic";

export function CodexComposerTray(props: {
  showWorktreeToggle: boolean;
  worktreeChecked: boolean;
  worktreeLocked: boolean;
  onWorktreeChange: (mode: EnvMode) => void;
}) {
  return (
    <div data-codex-part="composer-tray" data-codex-composer-tray="">
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
