# Plan: Rich Content Editor for ScamDunk Admin News Page

## Current State

The blog post editor at `/admin/news/blog/[id]` currently uses a plain `<textarea>` for content input with basic markdown support. Cover images are added via manual URL entry only. There is no image upload, no text formatting toolbar, no media embedding, and no table/chart support.

## Recommended Approach: Tiptap Editor

**Why Tiptap** (over Quill, Slate, Lexical, etc.):
- **Headless architecture** - works natively with Tailwind CSS and the existing shadcn-style component system (no fighting pre-built themes)
- **ProseMirror-based** - battle-tested editing engine used by the New York Times, Atlassian, GitLab
- **Rich extension ecosystem** - first-party extensions for tables, images, videos, embeds, code blocks, and more
- **React-first** - `@tiptap/react` provides hooks and components designed for React 18
- **HTML output** - stores content as HTML, which is directly compatible with the existing `content String @db.Text` Prisma field (no schema migration needed for basic content)
- **Used by** WordPress.com (Gutenberg alternative), GitLab, Substack-style platforms

## Implementation Steps

### Phase 1: Core Rich Text Editor

**1.1 Install Tiptap and extensions**

```
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm
npm install @tiptap/extension-image @tiptap/extension-link @tiptap/extension-youtube
npm install @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
npm install @tiptap/extension-text-align @tiptap/extension-underline @tiptap/extension-color @tiptap/extension-text-style
npm install @tiptap/extension-highlight @tiptap/extension-placeholder @tiptap/extension-code-block-lowlight
npm install lowlight
```

**1.2 Create the `RichTextEditor` component** (`src/components/admin/RichTextEditor.tsx`)

A self-contained editor component that:
- Accepts `content` (HTML string) and `onChange` callback as props
- Initializes Tiptap with all extensions
- Renders a formatting toolbar and the editor area
- Matches the existing rounded-2xl card styling

**1.3 Build the editor toolbar**

A floating/sticky toolbar with grouped controls:

| Group | Controls |
|-------|----------|
| **Text Style** | Bold, Italic, Underline, Strikethrough, Highlight, Text Color |
| **Headings** | H1, H2, H3 dropdown |
| **Alignment** | Left, Center, Right, Justify |
| **Lists** | Bullet list, Ordered list, Task list |
| **Insert** | Image, Video/YouTube, Table, Horizontal Rule, Code Block, Block Quote, Link |
| **Utilities** | Undo, Redo, Clear Formatting |

**1.4 Replace the textarea in the blog editor page**

Swap the current `<textarea>` in `src/app/admin/news/blog/[id]/page.tsx` with the new `<RichTextEditor>` component. The content continues to be stored as HTML in the same `content` field.

### Phase 2: Media Upload & Management

**2.1 Create a Supabase storage bucket for news media**

Add a new `news-media` bucket (alongside the existing `evaluation-data` bucket) with helper functions in `src/lib/supabase.ts`.

**2.2 Create a media upload API route** (`src/app/api/admin/news/media-upload/route.ts`)

- Accepts `multipart/form-data` with image/video files
- Validates file type (images: jpg, png, gif, webp, svg; video: mp4, webm) and size limits
- Uploads to `news-media` Supabase bucket
- Returns the public URL
- Supports multiple files in one request

**2.3 Build an image upload component for the editor**

- Clicking the "Image" button in the toolbar opens a modal/popover with two options:
  - **Upload**: Drag-and-drop or file picker that uploads to Supabase and inserts the image
  - **URL**: Paste an external image URL directly
- Images inserted into the editor are resizable via drag handles (Tiptap's image extension supports this)

**2.4 Add cover image upload**

Replace the current cover image URL-only input in the sidebar with:
- A drag-and-drop upload zone
- File picker button
- URL input as fallback
- Image preview with remove button

### Phase 3: Tables, Charts & Embeds

**3.1 Table support**

Using Tiptap's table extensions:
- Insert table with configurable rows/columns
- Add/delete rows and columns
- Merge/split cells
- Table header row styling
- Styled with Tailwind to match the admin theme

**3.2 Video & embed support**

- YouTube/Vimeo embed via URL (using `@tiptap/extension-youtube`)
- Generic iframe embed for other services
- GIF support via the image extension (GIFs are just images)

**3.3 Chart/visualization embeds**

For charts and data visualizations, rather than building a full chart editor inside the text editor (which is extremely complex and rarely done well in CMS tools), the practical approach used by platforms like Substack, Ghost, and Medium is:
- **Embed approach**: Provide an "Embed" block where admins paste a URL or iframe snippet from chart tools (Datawrapper, Flourish, Google Charts, Infogram, Tableau Public)
- **Image approach**: Charts created externally can be uploaded as images with the image upload feature
- This matches industry standard practice - even WordPress and Notion handle charts this way

### Phase 4: Editor Polish & UX

**4.1 Slash command menu**

Add a "/" slash command menu (like Notion) that appears when the user types "/" at the start of a line, offering quick access to:
- Headings, lists, images, tables, videos, code blocks, quotes, dividers

**4.2 Bubble menu**

Add a floating bubble menu that appears when text is selected, offering quick formatting options (bold, italic, link, highlight) without needing to reach for the toolbar.

**4.3 Content preview**

Add a "Preview" tab alongside the editor that renders the HTML content as it would appear on the public-facing blog page.

**4.4 Editor keyboard shortcuts**

Standard shortcuts: Cmd+B (bold), Cmd+I (italic), Cmd+U (underline), Cmd+K (link), Cmd+Shift+H (highlight), etc. These come built-in with Tiptap.

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/components/admin/RichTextEditor.tsx` | Main Tiptap editor component with toolbar |
| `src/components/admin/EditorToolbar.tsx` | Toolbar component with formatting controls |
| `src/components/admin/ImageUploadModal.tsx` | Modal for uploading/inserting images |
| `src/components/admin/MediaUploader.tsx` | Reusable media upload component (for cover image + inline) |
| `src/app/api/admin/news/media-upload/route.ts` | API route for file uploads to Supabase |

### Modified Files
| File | Change |
|------|--------|
| `src/app/admin/news/blog/[id]/page.tsx` | Replace textarea with RichTextEditor, add cover image upload |
| `src/lib/supabase.ts` | Add news media bucket helpers |
| `package.json` | Add Tiptap dependencies |

### No Schema Changes Required
The existing `content String @db.Text` field in the BlogPost model stores the content as a string. It currently holds markdown text - it will now hold HTML from Tiptap. No Prisma migration is needed since both are just strings.

## Implementation Order

1. Install dependencies
2. Create `RichTextEditor.tsx` with toolbar (Phase 1)
3. Integrate into blog editor page, replacing textarea (Phase 1)
4. Create media upload API route (Phase 2)
5. Build image upload modal and cover image uploader (Phase 2)
6. Add table support to editor (Phase 3)
7. Add video/embed support (Phase 3)
8. Add slash commands and bubble menu (Phase 4)
9. Add content preview mode (Phase 4)
10. Verify build succeeds
