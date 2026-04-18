/**
 * TDD layout test for ReconcileStep mobile responsiveness.
 *
 * Root cause (systematic debugging):
 *   - `sticky bottom-0` inside a page-scroll container is covered by Android Chrome's
 *     56px bottom bar — the Confirmar button is unreachable.
 *   - Missing `min-h-0` on the flex-1 list div prevents proper flex shrinking.
 *   - Missing `safe-area-inset-bottom` means footer is hidden behind browser chrome.
 *   - ScrollArea creates a nested scroll context that defeats flex layout.
 *
 * These are source-level assertions (no DOM) because @testing-library/react is not
 * installed and the bug is purely CSS class composition.
 */

// Deployment trigger: 2026-04-18
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(resolve(__dirname, '../client/src/pages/ShelfAudit.tsx'), 'utf-8');

// Scope assertions to ReconcileStep only
const start = source.indexOf('function ReconcileStep(');
const end = source.indexOf('\n// ─── Main page', start);
const reconcile = source.slice(start, end);

describe('ReconcileStep mobile layout', () => {
  it('does not use ScrollArea (creates nested scroll context that breaks flex layout)', () => {
    expect(reconcile).not.toContain('<ScrollArea');
  });

  it('does not use sticky bottom-0 (covered by Android Chrome bottom bar)', () => {
    expect(reconcile).not.toContain('sticky bottom-0');
  });

  it('uses min-h-0 on the scrollable list div (required for flex children to shrink)', () => {
    expect(reconcile).toContain('min-h-0');
  });

  it('uses safe-area-inset-bottom on the footer (clears Android Chrome bottom bar)', () => {
    expect(reconcile).toContain('safe-area-inset-bottom');
  });

  it('uses overflow-y-auto on the list div (enables independent list scrolling)', () => {
    expect(reconcile).toContain('overflow-y-auto');
  });

  it('uses flex-1 on the list div (list grows to fill space above footer)', () => {
    expect(reconcile).toContain('flex-1');
  });
});
