import { useEffect } from 'react';

type KeyboardShortcutHandler = (event: KeyboardEvent) => void;

interface KeyboardShortcutOptions {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  key: string;
  preventDefault?: boolean;
}

/**
 * Hook to register keyboard shortcuts
 * 
 * @param options - Shortcut configuration (key, modifiers)
 * @param handler - Function to call when shortcut is pressed
 * @param enabled - Whether the shortcut is currently enabled (default: true)
 */
export function useKeyboardShortcut(
  options: KeyboardShortcutOptions,
  handler: KeyboardShortcutHandler,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const { ctrl = false, shift = false, alt = false, key, preventDefault = true } = options;

      const ctrlMatch = ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
      const shiftMatch = shift ? event.shiftKey : !event.shiftKey;
      const altMatch = alt ? event.altKey : !event.altKey;
      const keyMatch = event.key.toLowerCase() === key.toLowerCase();

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        if (preventDefault) {
          event.preventDefault();
        }
        handler(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [options, handler, enabled]);
}
