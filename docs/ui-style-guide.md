# UI style guide

This is the canonical styling contract for NAM-BOT's existing screens and new UI. Use it when changing Dashboard, Jobs, Presets, Settings, Diagnostics, Setup Guide, shared dialogs, or the desktop frame. The goal is one readable desktop application with the existing dark surfaces, neon status accents, and arcade headings.

## Source of truth

- `src/renderer/styles/tokens.css` owns the palette, font families, type scale, standard spacing, and control sizes.
- `global.css` owns shared components and text roles: buttons, fields, cards, badges, diagnostic summaries, charts, logs, and confirmation dialogs.
- `workspace.css` owns the desktop frame and Dashboard layout.
- `feature-workspace.css` owns feature layouts, library/editor layouts, and property-sheet navigation. It must not give a shared component a different type scale or hover behavior just because it appears on another page.
- `title-bar.css` owns native frame geometry and uses the shared type tokens with the shell's zoom compensation.
- `features/about/about.css` owns the scoped BBS presentation. Its artwork and effects are intentional; ordinary labels and credits still use the shared type scale. Keep other terminal behavior discreet in public documentation.

Import tokens before component and layout styles. Change the owning rule instead of appending another override to defeat it.

## Typography

Choose the role before choosing a class. Sizes are CSS pixels at 100% application zoom. The arcade font needs larger nominal sizes than the system font for comparable readability.

| Role | Token | Size / font | Use |
| --- | --- | --- | --- |
| Body | `--text-body` | 14px system | Descriptions, table values, input values, checkboxes, instructions, errors |
| Secondary | `--text-secondary` | 12px system | Timestamps, supporting hints, table headings, compact metadata |
| Code | `--text-code` | 13px monospace | Commands, paths, logs, JSON, filename previews |
| Lead | `--text-lead` | 16px system | A short diagnostic headline that needs emphasis |
| Chrome | `--text-chrome` | 11px system | Title-bar section, sidebar group captions, bottom status bar; never ordinary content |
| Badge | `--text-badge` | 16px arcade | Short status badges and compact data values |
| Label/control | `--text-label` | 18px arcade | Form labels, buttons, section navigation |
| Section/card heading | `--text-heading` | 22px arcade | Panel headings, card names, section headings |
| Page/dialog title | `--text-title` | 28px arcade | Workspace and dialog titles |
| Metric | `--text-metric` | 34px arcade | Dashboard totals |

Body and secondary text use `--leading-body` (1.5); headings and controls use `--leading-heading` (1.15); code uses `--leading-code` (1.6). Component layout can adjust line height when necessary, but must retain readable spacing.

Prefer an existing component's class. For standalone content, use `ui-text-body`, `ui-text-secondary`, `ui-text-code`, `ui-text-lead`, `ui-text-badge`, `ui-text-label`, `ui-text-heading`, or `ui-text-title`. These classes choose typography, not semantic HTML: still use appropriate headings, paragraphs, labels, and buttons.

Do not hard-code font sizes, families, or line heights in JSX. Do not shrink text at narrow widths to make it fit; wrap controls, collapse columns, or allow local scrolling for code and charts. Supporting text must remain at least 12px; normal descriptions and values use 14px. Treat essential instructions and errors as body text, not fine print.

## Components and interaction

- Use `WorkspaceToolbar` for page titles and primary actions; `PropertySheet` and `PropertySection` for editors and reference sections; `CopyableCodeBlock` for commands.
- Use `RuntimeCard` on every view that shows a training run. Its appearance is owned by `.job-card`, `.queue-card-*`, and `.runtime-*`, without a required page ancestor.
- Use `DiagnosticSummaryCard` for readiness summaries. Status words and colors have one shared implementation. Keep page-specific readiness calculations separate from presentation.
- Use `.btn` plus a color variant. Regular controls have a 34px minimum height; `.btn-sm`/`.btn-xs` use 30px with the same readable 18px label. A smaller button is smaller through padding, not smaller type.
- Use `.form-input`, `.form-select`, `.form-label`, `.property-hint`, and existing property-row/check-option classes. Do not reimplement them with local inline presentation styles.
- Use plain checkboxes for individual options and small groups such as file naming, training reports, and extra model copies. Reserve the tinted `.property-option-panel` for larger related selections such as packed submodels.
- Use `.property-row-checkbox` for a property row containing a single checkbox without supporting text. It centers the row label with the checkbox instead of applying the label offset used for text fields.
- Cards use a flat surface change on hover. Buttons change color/background; they do not jump or gain offset shadows. Selected/toggled controls retain a visible background or border after the pointer leaves.
- Keyboard focus uses `--focus-ring`, a 2px cyan outline. An inset offset is appropriate where scroll containers would clip an outside outline. Never remove focus indication without an equivalent visible replacement.
- Use the existing confirmation/application-dialog components. Dialogs use the same typography, flat controls, one-pixel border, cyan top accent, and soft overlay shadow. Actions wrap at narrow widths.

## Option labels and help

- Default to concise, self-explanatory labels. Put supporting explanations, examples, and technical details in tooltips rather than paragraphs beneath controls.
- Do not repeat an option's meaning in both its label and an always-visible description. If the label needs a paragraph to make sense, improve the label first.
- Keep inline text when users need to see it before acting: validation errors, unavailable features and their reasons, important consequences, or a required setup step. Use the shortest useful explanation.
- Tooltips supplement the label; they must not contain the only indication that an option is unavailable or an action has an important consequence. Reuse existing tooltip behavior and support keyboard access when adding tooltip components.
- Apply this preference to new controls and screens being revised. Keep detailed guidance in the user documentation and Setup Guide.

## Color, borders, and spacing

Use `--surface-workspace`, `--surface-panel`, `--surface-header`, `--surface-field`, `--surface-hover`, and `--surface-selected`. Use `--border-panel` for structure and `--border-field` for inputs. Standard panels and controls have square corners and one-pixel borders; selected states can add a two-pixel accent.

Use `--text-ash` for primary content and `--text-steel` for secondary content. Cyan marks navigation/information, green marks success/readiness, gold marks active work/caution, and magenta marks errors or destructive actions. Preserve established status meaning; always include a word or icon so color is not the only cue. Diagnostic advisory checks retain their existing cyan `CHECK` state.

Use the spacing tokens (`--space-1` through `--space-6`: 4, 8, 12, 16, 20, 24px) for new padding, margins, and gaps. Typical panels/cards use 16px padding, related controls use 8px gaps, and workspace sections use 20–24px separation. Explicit widths, chart coordinates, native frame geometry, and small optical adjustments are layout values, not additions to the spacing scale.

Inline styles are reserved for runtime values such as progress width, computed status color, or a local layout value. Repeated layout belongs in a class. No embedded `<style>` blocks. Third-party editors may need inline typography as an adapter; those values must reference shared tokens. The About screen's terminal artwork may use its own decorative scale; ordinary reading surfaces follow the shared typography rules.

## Changing or adding a screen

1. Read this guide and inspect the closest existing component before writing styles.
2. Reuse shared components/classes and choose text roles from the table. If a pattern needs a reusable variation, add an explicit component variant rather than a page-ancestor override.
3. Update the owning stylesheet. A new token requires a clear reusable role and an update to this guide; do not add a token solely to preserve a one-off size.
4. Check the modified screen with real rendered output at normal width, at 1000×700, and at 150% zoom. Exercise hover, keyboard focus, selected/disabled states, long names/paths, and expanded content where applicable.
5. Check every consumer of an edited shared component. Compare Dashboard/Jobs runtime cards and Dashboard/Diagnostics summaries directly.
6. Update the feature's documentation when behavior or structure changes. Keep styling policy here rather than copying it into every feature document.

## Validation

- `npm run dev` starts Electron with hot reload for interactive review.
- `npm run check` type-checks application/tests, runs Vitest and release-metadata tests, and builds main/preload/renderer. The style-contract test rejects local typography literals and embedded styles in normal UI and guards the readable scale.
- After `npm run build`, run `npm run test:desktop-shell -- --grep "shared typography|job properties|preset property|Diagnostics and Setup|settings property|lifetime dashboard|About uses|early ESR"` for relevant isolated Electron checks and screenshots. These tests use temporary app data and simulated training, not the user's environment or a live training job.

Automated checks are a guardrail. Inspect screenshots for clipping, crowded controls, unreadable text, and hierarchy; a passing numeric style check alone does not establish visual quality. This desktop check does not establish native macOS appearance or physical display/DPI coverage on untested hosts.

## Standalone training reports

Keep manual report export controls on Jobs cards. A successful save returns the button to its idle state without an inline success notice. Errors and warnings belong in the card's shared feedback area, never beneath an individual action button where they would disturb row alignment. Verify the post-save state as well as the idle layout.

Training reports reuse the canonical tokens, shared card/text/control styles, and ESR chart. `report/report.css` supplies document layout only; app screens retain their existing stylesheet contract. The build bundles report CSS, JavaScript, local Inter/VT323 fonts, and their license notices into a single offline HTML document. Embedding these built assets in the exported document is intentional and does not permit embedded stylesheets in application JSX. The PNG uses the same theme and an explicit static chart variant, rendered at a fixed 1,000-pixel width with content-driven height independently of application zoom and display scaling.

Keep the NAM-BOT wordmark and project attribution visible in both formats. The PNG has a readable repository address; HTML has one keyboard-accessible link to the NAM-BOT GitHub repository. Review generated exports as well as the application controls, including narrow/zoomed HTML and multi-submodel legends.

The report header uses the same `NamBotWordmark` component and split-color styling as the title bar. The HTML also shares its hover/focus animation, with a stationary hit area and reduced-motion support. Keep report summaries in compact bordered fact/ESR panels beside each other at desktop widths and stacked on phones. The responsive chart variant fits the full epoch axis into the available width without shrinking its text. Report attribution uses the secondary text role on one line where space permits and wraps on narrow screens.

The shared logo hover target uses the existing [Metal Horns cursor by MustardSauce](https://www.cursor.cc/?action=icon&file_id=35046), stored unmodified as `horns-cursor.png`, with a hotspot at the raised index finger. It has a white fill and black outline. Source and license details live beside the asset in `horns-cursor.LICENSE.txt`. The report build embeds the image and its source notice alongside the fonts so it remains available offline.
