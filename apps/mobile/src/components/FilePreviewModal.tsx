import { useIsFocused } from "@react-navigation/native";
import { useEffect, useEffectEvent, useState } from "react";
import { Alert, Keyboard } from "react-native";

import { loadLocalAttachmentPreview } from "../lib/localAttachmentPreview";
import { useRefreshAssetUrl } from "../state/assets";
import { FilePreview } from "./FilePreview";
import type { FilePreviewSource } from "./FilePreviewModal.types";

export type { FilePreviewSource, ResolvedFilePreviewSource } from "./FilePreviewModal.types";

function ResolvedFilePreview(props: {
  readonly source: FilePreviewSource;
  readonly onRequestClose: () => void;
  readonly onOpenError?: (error: unknown) => void;
}) {
  const { source } = props;
  const environmentId = "environmentId" in source ? source.environmentId : null;
  const refreshAssetUrl = useRefreshAssetUrl(
    environmentId,
    "resource" in source ? source.resource : null,
  );
  const [uri, setUri] = useState<string | null>("uri" in source ? source.uri : null);
  const onRequestClose = useEffectEvent(props.onRequestClose);
  const onResolutionError = useEffectEvent((error: unknown, fallbackMessage: string) => {
    if (props.onOpenError) props.onOpenError(error);
    else Alert.alert("Could not open preview", fallbackMessage);
    onRequestClose();
  });
  useEffect(() => Keyboard.dismiss(), []);
  useEffect(() => {
    if (environmentId === null || uri !== null) return;
    let cancelled = false;
    void refreshAssetUrl()
      .then((url) => {
        if (cancelled) return;
        if (!url) throw new Error("Reconnect to this environment and try again.");
        setUri(url + (source.srcFragment ?? ""));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        onResolutionError(
          error,
          "Reconnect to this environment and try again. The file may have been moved or deleted.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [environmentId, uri, refreshAssetUrl, source.srcFragment]);
  useEffect(() => {
    if (!("attachment" in source)) return;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    void loadLocalAttachmentPreview(source.attachment, controller.signal)
      .then((file) => {
        if (!file) return;
        if (controller.signal.aborted) {
          file.dispose();
          return;
        }
        release = file.dispose;
        setUri(file.uri);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        onResolutionError(error, "Attach the file again and retry.");
      });
    return () => {
      controller.abort();
      release?.();
    };
  }, [source]);

  return uri === null ? null : (
    <FilePreview
      source={{ ...source, uri }}
      onRequestClose={props.onRequestClose}
      {...(props.onOpenError ? { onOpenError: props.onOpenError } : {})}
    />
  );
}

export function FilePreviewModal(props: {
  readonly source: FilePreviewSource | null;
  readonly onRequestClose: () => void;
  readonly onOpenError?: (error: unknown) => void;
}) {
  const isFocused = useIsFocused();
  const hasSource = props.source !== null;
  const onRequestClose = useEffectEvent(props.onRequestClose);
  useEffect(() => {
    if (!isFocused && hasSource) onRequestClose();
  }, [isFocused, hasSource]);

  if (!props.source || !isFocused) return null;
  return (
    <ResolvedFilePreview
      source={props.source}
      onRequestClose={props.onRequestClose}
      {...(props.onOpenError ? { onOpenError: props.onOpenError } : {})}
    />
  );
}
