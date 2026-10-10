/**
 * Barcode scanner hook for HID keyboard-wedge scanners.
 *
 * Most handheld scanners (including GTCodeStar X-9700L) emulate a USB keyboard.
 * They type the barcode digits rapidly, ending with Enter (or another suffix).
 * This hook detects that pattern — fast input followed by a terminator —
 * and fires a callback with the scanned code.
 */

import { useEffect, useRef, useCallback, useState } from "react";

export interface ScanEvent {
  code: string;
  timestamp: number;
}

interface UseScannerOpts {
  /** Max ms per char to qualify as scanner vs human. Default 30. */
  maxCharInterval?: number;
  /** Key that terminates a scan. Default "Enter". */
  terminator?: string;
  /** Min code length to fire callback. Default 3. */
  minLength?: number;
  /** Auto-focus a dedicated scan input. */
  autoFocus?: boolean;
}

export function useBarcodeScanner(opts: UseScannerOpts = {}) {
  const { maxCharInterval = 30, terminator = "Enter", minLength = 3, autoFocus = false } = opts;

  const [scanInput, setScanInput] = useState("");
  const [lastScan, setLastScan] = useState<ScanEvent | null>(null);
  const [scanning, setScanning] = useState(false);
  const bufferRef = useRef("");
  const lastTimeRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const callbackRef = useRef<((ev: ScanEvent) => void) | undefined>(undefined);

  const onScan = useCallback((fn: (ev: ScanEvent) => void) => {
    callbackRef.current = fn;
  }, []);

  // Auto-focus the scan input
  useEffect(() => {
    if (!autoFocus) return;
    const handler = () => scanInputRef.current?.focus();
    document.addEventListener("click", handler);
    scanInputRef.current?.focus();
    return () => document.removeEventListener("click", handler);
  }, [autoFocus]);

  // Listen for keyboard events and detect scanner vs human
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isScanField = target === scanInputRef.current;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        if (!isScanField && !autoFocus) return;
      }

      const now = Date.now();
      const elapsed = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (e.key === terminator) {
        e.preventDefault();
        const code = bufferRef.current.trim();
        if (code.length >= minLength) {
          const ev: ScanEvent = { code, timestamp: now };
          setLastScan(ev);
          setScanInput(code);
          if (callbackRef.current) callbackRef.current(ev);
        }
        bufferRef.current = "";
        setScanning(false);
        return;
      }

      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;

      const isScanner = elapsed < maxCharInterval || bufferRef.current.length === 0;
      setScanning(isScanner);

      if (isScanner) {
        e.preventDefault();
        if (e.key.length === 1) {
          bufferRef.current += e.key;
        }
        setScanInput(bufferRef.current);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          bufferRef.current = "";
          setScanning(false);
        }, 200);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [terminator, maxCharInterval, minLength, autoFocus]);

  return {
    scanInput,
    lastScan,
    scanning,
    scanInputRef,
    clear: useCallback(() => {
      setScanInput("");
      bufferRef.current = "";
    }, []),
    onScan,
  };
}
