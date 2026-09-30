export interface NativeMarkdownTextStyle {
  readonly selectionColor?: string;
  readonly selectionHandleColor?: string;
  readonly color: string;
  readonly strongColor: string;
  readonly mutedColor: string;
  readonly linkColor: string;
  readonly inlineCodeColor: string;
  readonly codeColor: string;
  readonly codeBackgroundColor: string;
  readonly codeBlockBackgroundColor: string;
  readonly fileTextColor: string;
  readonly skillTextColor: string;
  readonly quoteMarkerColor: string;
  readonly dividerColor: string;
  readonly contextChipBorderColor?: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly fontFamily: string;
  readonly headingFontFamily: string;
  readonly boldFontFamily: string;
  readonly headingFontSizes?: ReadonlyArray<number>;
}

export interface MarkdownHighlightedToken {
  readonly content: string;
  readonly color: string | null;
  readonly fontStyle: number | null;
}

export interface MarkdownCodeHighlightInput {
  readonly session?: object;
  readonly code: string;
  readonly language?: string | null;
  readonly theme: "light" | "dark";
}
export interface MarkdownCodeHighlighter {
  (
    input: MarkdownCodeHighlightInput,
  ): Promise<ReadonlyArray<ReadonlyArray<MarkdownHighlightedToken>>>;
  read?: (
    input: MarkdownCodeHighlightInput,
  ) => ReadonlyArray<ReadonlyArray<MarkdownHighlightedToken>> | undefined;
}

export interface SelectableMarkdownSkill {
  readonly name: string;
  readonly displayName?: string | null;
}

export interface MarkdownImageRequest {
  readonly href: string;
  readonly alt: string | null;
  readonly title: string | null;
}

export type MarkdownImageRenderer = (image: MarkdownImageRequest) => import("react").ReactNode;

export interface MarkdownFileContextMenuAction {
  readonly id: string;
  readonly title: string;
  readonly disabled?: boolean;
}

export interface MarkdownFileContextMenu {
  readonly title?: string;
  readonly actions: ReadonlyArray<MarkdownFileContextMenuAction>;
}

export interface SelectableMarkdownTextProps {
  readonly markdown: string;
  readonly contextClipboardFragment?: string;
  readonly textStyle: NativeMarkdownTextStyle;
  readonly highlightCode: MarkdownCodeHighlighter;
  readonly skills?: ReadonlyArray<SelectableMarkdownSkill>;
  readonly preserveSoftBreaks?: boolean;
  readonly onLinkPress?: (href: string) => void;
  readonly fileContextMenu?: (href: string) => MarkdownFileContextMenu | undefined;
  readonly onFileContextMenuAction?: (href: string, actionId: string) => void;
  readonly renderImage?: MarkdownImageRenderer;
  readonly marginTop?: number;
  readonly marginBottom?: number;
}
