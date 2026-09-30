import { useCodexView } from "./codexView";

export function useCodexActivityHeading(): boolean {
  const [view] = useCodexView();
  return view === "activity";
}
