import { FolderIcon, FolderOpenIcon } from "lucide-react";

export function CodexProjectFolderIcon({ expanded }: { expanded: boolean }) {
  const Icon = expanded ? FolderOpenIcon : FolderIcon;
  return <Icon data-codex-part="project-folder" aria-hidden="true" />;
}
