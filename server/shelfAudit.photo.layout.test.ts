/**
 * shelfAudit.photo.layout.test.ts
 *
 * TDD layout tests for the PhotoStep iOS/Android photo input bug.
 *
 * Root cause (systematic debugging):
 *   - `capture="environment"` on the <input type="file"> forces iOS Safari to open
 *     the camera directly and PREVENTS the user from selecting a photo from the gallery.
 *     This means if the user has already taken a photo, or wants to use an existing
 *     image, they cannot — the audit workflow is blocked.
 *   - On some iOS versions, `capture` also prevents HEIC→JPEG conversion, so the
 *     FileReader receives a HEIC blob that the LLM vision API cannot process.
 *   - The fix is to remove `capture="environment"` entirely so iOS shows the standard
 *     action sheet: "Take Photo", "Photo Library", "Browse" — all options available.
 *   - The client must send the full data URL (data:<mime>;base64,<payload>) so the
 *     server can detect the MIME type and use the correct Content-Type for S3.
 *
 * These are source-level assertions (no DOM) — same pattern as shelfAudit.layout.test.ts.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(resolve(__dirname, '../client/src/pages/ShelfAudit.tsx'), 'utf-8');

// Scope assertions to PhotoStep only
const photoStart = source.indexOf('function PhotoStep(');
const photoEnd = source.indexOf('\n// ─── Reconciliation', photoStart);
const photoStep = source.slice(photoStart, photoEnd);

describe('PhotoStep iOS/Android photo input', () => {
  it('does not use capture="environment" on the <input> element (blocks iOS gallery access)', () => {
    // capture="environment" forces camera-only on iOS — user cannot select from gallery.
    // We check the <input> JSX block specifically (not comments that explain the fix).
    const inputMatch = photoStep.match(/<input[\s\S]*?\/>/g);
    const fileInput = inputMatch?.find(el => el.includes('type="file"')) ?? '';
    expect(fileInput).not.toContain('capture="environment"');
  });

  it('does not use capture attribute on the <input> element (any capture value restricts iOS)', () => {
    // Any value of capture= on the <input> element restricts the file picker on iOS Safari.
    // We check the <input> JSX block specifically (not comments that explain the fix).
    // The <input> element starts at '<input' and ends at '/>' — extract it.
    const inputMatch = photoStep.match(/<input[\s\S]*?\/>/g);
    const fileInput = inputMatch?.find(el => el.includes('type="file"')) ?? '';
    expect(fileInput).not.toContain('capture');
  });

  it('sends full data URL to the server (preserves MIME type for S3 upload)', () => {
    // The client must send the full dataUrl (data:image/webp;base64,...) not just base64
    // so the server can detect the MIME type and use correct Content-Type for S3.
    // The fix: pass dataUrl directly instead of dataUrl.split(',')[1]
    // We check that the code does NOT strip the data URL prefix before sending.
    expect(photoStep).not.toContain("dataUrl.split(',')[1]");
  });

  it('still uses accept="image/*" to allow all image formats', () => {
    // Must keep accept="image/*" so all image formats are selectable
    expect(photoStep).toContain('accept="image/*"');
  });

  it('still uses FileReader.readAsDataURL for preview generation', () => {
    // FileReader.readAsDataURL is still needed to generate the preview image
    expect(photoStep).toContain('readAsDataURL');
  });
});

describe('ScanStep auto-polling', () => {
  it('enables refetchInterval: 5000 on getActiveAuditSession query in ScanStep', () => {
    // The liveSession query must poll every 5 seconds when step === 'scan'
    // so the co-auditor banner updates automatically without manual refresh.
    // We look for the query block that has enabled: step === 'scan'
    const scanQueryBlock = source.match(
      /const \{ data: liveSession[\s\S]*?enabled: step === ['"]scan['"][\s\S]*?\}\)/
    )?.[0] ?? '';
    expect(scanQueryBlock).toContain('refetchInterval');
    expect(scanQueryBlock).toContain('5000');
  });
});
