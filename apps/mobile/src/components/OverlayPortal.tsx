import { type ReactNode, useEffect, useRef, useState } from "react";
import { View } from "react-native";

type Entries = ReadonlyMap<number, ReactNode>;
type Listener = (entries: Entries) => void;

let nextKey = 0;
const entries = new Map<number, ReactNode>();
const listeners = new Set<Listener>();

function emit() {
  const snapshot = new Map(entries);
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function OverlayPortal(props: { readonly children: ReactNode }) {
  const keyRef = useRef<number | null>(null);
  keyRef.current ??= nextKey++;
  const key = keyRef.current;

  useEffect(() => {
    entries.set(key, props.children);
    emit();
  });

  useEffect(
    () => () => {
      entries.delete(key);
      emit();
    },
    [key],
  );

  return null;
}

export function OverlayPortalHost() {
  const [current, setCurrent] = useState<Entries>(() => new Map());

  useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  if (current.size === 0) {
    return null;
  }
  return (
    <View pointerEvents="box-none" className="absolute inset-0">
      {[...current.entries()].map(([key, node]) => (
        <View key={key} pointerEvents="box-none" className="absolute inset-0">
          {node}
        </View>
      ))}
    </View>
  );
}
