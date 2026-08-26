# Findings: Admin Shared Components + TipTap Editor (verified against installed @tiptap v3.20.0)

## HIGH
- ED-H1. useEditor without immediatelyRender:false THROWS in dev on Next.js (TipTap v3 SSR detection); page uses React.lazy (still SSRs) not next/dynamic ssr:false (RichTextEditor.tsx:66; blog [id]/page.tsx:23-25).
- ED-H2. editor.isActive()/can() read during render are STALE: v3 defaults shouldRerenderOnTransaction off → toolbar active states, undo/redo disabled states, and the Table controls row stay stale until next keystroke (RichTextEditor.tsx:544; EditorToolbar.tsx:135-303). FIX: useEditorState selector.
- ED-H3. Full-document getHTML() + whole ~900-line page re-render on EVERY keystroke (onUpdate → setPost) + per-render getText()×2 → typing lag on long posts (RichTextEditor.tsx:119-121,386-387; page.tsx:622-624). FIX: debounce/ref + memo toolbar.
- ED-H4. mammoth (~700KB) statically imported into admin blog page bundle; only used in processFile (page.tsx:20,185). FIX: dynamic import.
- ED-H5. ImageUploadModal: no role=dialog/aria-modal, no focus trap, no Escape, no focus restore (135-148).

## MEDIUM
- ED-M1. Content-sync setContent effect: WYSIWYG/state divergence (setContent doesn't emit onUpdate → saved HTML ≠ displayed) + keystroke-loss race under slow renders; missing editor dep (RichTextEditor.tsx:213-217).
- ED-M2. Admin Preview tab renders imported HTML unsanitized (page.tsx:631-634) — duplicate of UI-H1; sanitize with isomorphic-dompurify.
- ED-M3. Duplicate link/underline extensions: StarterKit v3 already includes them → openOnClick:false DEFEATED (StarterKit's instance still opens links on click); duplicate-extension warnings (RichTextEditor.tsx:68-79). FIX: configure via StarterKit only.
- ED-M4. Vimeo/generic embeds silently dropped by schema (only youtube iframe parse rule exists); built via unescaped string interpolation (EditorToolbar.tsx:96-117).
- ED-M5. Slash menu swallows Enter/Arrows when zero items match (menu hidden but state open) — editor feels dead until Escape (RichTextEditor.tsx:178-183,621).
- ED-M6. Bubble-menu 8 icon buttons no aria-label/title (407-539).
- ED-M7. Upload dropzone click-only div + hidden input → file upload keyboard-inaccessible (ImageUploadModal.tsx:179-196).
- ED-M8. accepts video/mp4 but always inserts as <img> → broken node (ImageUploadModal.tsx:57-64 + RichTextEditor.tsx:380).
- ED-M9. allowBase64:true with no handlePaste/handleDrop → Word/Docs pastes store inline base64 images, ballooning post.content; OS image paste ignored (RichTextEditor.tsx:81-87). FIX: paste/drop upload to media endpoint; allowBase64:false.
- ED-M10. DataTable: untyped column key (not keyof T) + unsafe ReactNode cast can throw "Objects are not valid as React child" (DataTable.tsx:5-10,89-91).
- ED-M11. DataTable pagination chevrons icon-only no aria-label (138-151); AlertBanner no role=alert/live region (53-55) + dismiss X unlabeled (70-75); ScanTimeline format = color-only 6px dot with title on div (72-83); ChartCard line mode = height-only bars, value never rendered (50-66).

## LOW
- ED-L1. handleDrop useCallback([]) captures stale alt → user's alt text overwritten by filename on drop path (ImageUploadModal.tsx:106-111).
- ED-L2. SVG uploads accepted, stored as active content on public bucket (supabase.co origin — low) (ImageUploadModal.tsx:62 + upload route).
- ED-L3. window.prompt for links; invalid URL silently no-ops (v3 blocks javascript: — verified safe) (EditorToolbar.tsx:75-87).
- ED-L4. Uncleared setTimeout in handleKeyDown (slash menu) → setState after unmount (RichTextEditor.tsx:155).
- ED-L5. Slash-menu key handling depends on per-render setOptions re-sync; stale-closure window under fast input — use refs or @tiptap/suggestion (already a dep) (143-199).
- ED-L6. DataTable key={index}; non-JSON upload error bodies crash into "Unexpected token <" (ImageUploadModal.tsx:82-85); preview img fires requests to partial/arbitrary hosts per keystroke (237-242); AILayerPanel/SignalGrid/SchemeCard/StatCard/RiskFunnel a11y + dead-prop nits (see source).

## VERIFIED NON-ISSUES
- Editor destroy handled by @tiptap/react v3 lifecycle; doc click listener cleaned up.
- No URL.createObjectURL leaks.
- javascript: hrefs blocked by v3 Link isAllowedUri (setLink + parseHTML); default rel/target safe.
- Public blog rendering sanitized (post-client.tsx:153).
- DataTable pagination boundary math correct.
