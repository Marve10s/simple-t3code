import * as Schema from "effect/Schema";

import {
  ForwardCompatibleArray,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const COMPOSER_CONTEXT_KINDS = [
  "image",
  "file",
  "terminal",
  "element",
  "preview-annotation",
  "review-comment",
  "mention",
  "skill",
] as const;
export type KnownComposerContextKind = (typeof COMPOSER_CONTEXT_KINDS)[number];

const CONTEXT_ID_MAX_CHARS = 128;
const CONTEXT_ID_PATTERN = /^[a-z0-9_-]+$/i;
const CONTEXT_KIND_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const KNOWN_KIND_PATTERN = new RegExp(`^(?!(?:${COMPOSER_CONTEXT_KINDS.join("|")})$)`);

export const COMPOSER_CONTEXT_LABEL_MAX_CHARS = 200;
export const COMPOSER_CONTEXT_TERMINAL_TEXT_MAX_CHARS = 64_000;
const COMPOSER_CONTEXT_ELEMENT_HTML_MAX_CHARS = 8_000;
const COMPOSER_CONTEXT_ELEMENT_STYLES_MAX_CHARS = 8_000;
export const COMPOSER_CONTEXT_REVIEW_TEXT_MAX_CHARS = 16_000;
export const COMPOSER_CONTEXT_REVIEW_DIFF_MAX_CHARS = 32_000;
const COMPOSER_CONTEXT_PREVIEW_COMMENT_MAX_CHARS = 8_000;

export const ComposerContextId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(CONTEXT_ID_MAX_CHARS),
  Schema.isPattern(CONTEXT_ID_PATTERN),
).pipe(Schema.brand("ComposerContextId"));
export type ComposerContextId = typeof ComposerContextId.Type;

export const ComposerContextReferenceId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(CONTEXT_ID_MAX_CHARS),
  Schema.isPattern(CONTEXT_ID_PATTERN),
).pipe(Schema.brand("ComposerContextReferenceId"));
export type ComposerContextReferenceId = typeof ComposerContextReferenceId.Type;

export const ComposerContextKind = TrimmedNonEmptyString.check(
  Schema.isPattern(CONTEXT_KIND_PATTERN),
);
export type ComposerContextKind = typeof ComposerContextKind.Type;

const ContextAttachmentId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(CONTEXT_ID_MAX_CHARS),
  Schema.isPattern(CONTEXT_ID_PATTERN),
);
const ContextLabel = Schema.String.check(Schema.isMaxLength(COMPOSER_CONTEXT_LABEL_MAX_CHARS));
const BoundedString = (max: number) => Schema.String.check(Schema.isMaxLength(max));
const ShortString = BoundedString(2_048);
const NullableShortString = Schema.NullOr(ShortString);

export const PullRequestContextMetadata = Schema.Struct({
  number: PositiveInt,
  title: ShortString,
  url: ShortString,
  headBranch: ShortString,
  baseBranch: ShortString,
  state: Schema.Literals(["open", "closed", "merged"]),
  isDraft: Schema.Boolean,
});
export type PullRequestContextMetadata = typeof PullRequestContextMetadata.Type;

const recordBase = {
  version: Schema.Literal(1),
  contextId: ComposerContextId,
  label: ContextLabel,
} as const;

const attachmentBinding = {
  attachmentId: ContextAttachmentId,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  sizeBytes: NonNegativeInt,
} as const;

export const ImageContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("image"),
  ...attachmentBinding,
});
export type ImageContextRecord = typeof ImageContextRecord.Type;

export const FileContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("file"),
  ...attachmentBinding,
});
export type FileContextRecord = typeof FileContextRecord.Type;

export const TerminalContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("terminal"),
  terminalId: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  terminalLabel: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  lineStart: NonNegativeInt,
  lineEnd: NonNegativeInt,
  text: BoundedString(COMPOSER_CONTEXT_TERMINAL_TEXT_MAX_CHARS),
}).check(Schema.makeFilter((record) => record.lineEnd >= record.lineStart));
export type TerminalContextRecord = typeof TerminalContextRecord.Type;

export const ElementContextSource = Schema.Struct({
  functionName: NullableShortString,
  fileName: NullableShortString,
  lineNumber: Schema.NullOr(NonNegativeInt),
  columnNumber: Schema.NullOr(NonNegativeInt),
});
export type ElementContextSource = typeof ElementContextSource.Type;

export const ElementContextDetails = Schema.Struct({
  pageUrl: ShortString,
  pageTitle: NullableShortString,
  tagName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  selector: NullableShortString,
  htmlPreview: BoundedString(COMPOSER_CONTEXT_ELEMENT_HTML_MAX_CHARS),
  componentName: NullableShortString,
  source: Schema.NullOr(ElementContextSource),
  styles: BoundedString(COMPOSER_CONTEXT_ELEMENT_STYLES_MAX_CHARS),
});
export type ElementContextDetails = typeof ElementContextDetails.Type;

export const ElementContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("element"),
  ...ElementContextDetails.fields,
});
export type ElementContextRecord = typeof ElementContextRecord.Type;

export const PreviewAnnotationContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("preview-annotation"),
  annotationId: ShortString,
  pageUrl: ShortString,
  pageTitle: NullableShortString,
  comment: BoundedString(COMPOSER_CONTEXT_PREVIEW_COMMENT_MAX_CHARS),
  targetSummary: ShortString,
  styleChanges: Schema.Array(ShortString).check(Schema.isMaxLength(200)),
  elements: Schema.optional(Schema.Array(ElementContextDetails).check(Schema.isMaxLength(50))),
  elementIds: Schema.optional(Schema.Array(ShortString).check(Schema.isMaxLength(50))),
  regionCount: Schema.optional(NonNegativeInt),
  strokeCount: Schema.optional(NonNegativeInt),
  styleChangeDetails: Schema.optional(
    Schema.Array(
      Schema.Struct({
        targetId: ShortString,
        selector: NullableShortString,
        property: ShortString,
        previousValue: BoundedString(COMPOSER_CONTEXT_ELEMENT_STYLES_MAX_CHARS),
        value: BoundedString(COMPOSER_CONTEXT_ELEMENT_STYLES_MAX_CHARS),
      }),
    ).check(Schema.isMaxLength(200)),
  ),
  screenshotContextId: Schema.optional(ComposerContextId),
});
export type PreviewAnnotationContextRecord = typeof PreviewAnnotationContextRecord.Type;

export const ReviewCommentContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("review-comment"),
  sectionId: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  sectionTitle: ShortString,
  filePath: TrimmedNonEmptyString.check(Schema.isMaxLength(2_048)),
  startIndex: NonNegativeInt,
  endIndex: NonNegativeInt,
  rangeLabel: ShortString,
  text: BoundedString(COMPOSER_CONTEXT_REVIEW_TEXT_MAX_CHARS),
  diff: BoundedString(COMPOSER_CONTEXT_REVIEW_DIFF_MAX_CHARS),
  fenceLanguage: Schema.optional(BoundedString(64)),
  pullRequest: Schema.optional(PullRequestContextMetadata),
}).check(Schema.makeFilter((record) => record.endIndex >= record.startIndex));
export type ReviewCommentContextRecord = typeof ReviewCommentContextRecord.Type;

export const MentionContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("mention"),
  path: TrimmedNonEmptyString.check(Schema.isMaxLength(2_048)),
});
export type MentionContextRecord = typeof MentionContextRecord.Type;

export const SkillContextRecord = Schema.Struct({
  ...recordBase,
  kind: Schema.Literal("skill"),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
});
export type SkillContextRecord = typeof SkillContextRecord.Type;

export const UnknownContextRecord = Schema.Struct({
  ...recordBase,
  kind: ComposerContextKind.check(Schema.isPattern(KNOWN_KIND_PATTERN)),
  payload: Schema.Unknown.check(
    Schema.makeFilter((payload) => {
      try {
        const encoded = JSON.stringify(payload);
        return encoded !== undefined && encoded.length <= 64_000;
      } catch {
        return false;
      }
    }),
  ),
});
export type UnknownContextRecord = typeof UnknownContextRecord.Type;

export const KnownComposerContextRecord = Schema.Union([
  ImageContextRecord,
  FileContextRecord,
  TerminalContextRecord,
  ElementContextRecord,
  PreviewAnnotationContextRecord,
  ReviewCommentContextRecord,
  MentionContextRecord,
  SkillContextRecord,
]);
export type KnownComposerContextRecord = typeof KnownComposerContextRecord.Type;

export const ComposerContextRecord = Schema.Union([
  ...KnownComposerContextRecord.members,
  UnknownContextRecord,
]);
export type ComposerContextRecord = typeof ComposerContextRecord.Type;

export const COMPOSER_CONTEXT_MAX_RECORDS = 200;
const COMPOSER_CONTEXT_MAX_SERIALIZED_CHARS = 16_000_000;

export const OrchestrationMessageContext = Schema.Struct({
  version: Schema.Literal(1),
  records: Schema.Array(Schema.Unknown)
    .check(
      Schema.isMaxLength(COMPOSER_CONTEXT_MAX_RECORDS),
      Schema.makeFilter((records) => {
        try {
          return JSON.stringify(records).length <= COMPOSER_CONTEXT_MAX_SERIALIZED_CHARS;
        } catch {
          return false;
        }
      }),
    )
    .pipe(Schema.decodeTo(ForwardCompatibleArray(ComposerContextRecord)))
    .check(
      Schema.makeFilter(
        (records) => new Set(records.map((record) => record.contextId)).size === records.length,
      ),
    ),
});
export type OrchestrationMessageContext = typeof OrchestrationMessageContext.Type;
