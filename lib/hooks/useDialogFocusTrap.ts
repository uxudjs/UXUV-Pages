"use client";

import { useEffect, useRef, type RefObject } from "react";

const arrows = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function available(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>("[data-focusable]")]
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true" && element.offsetParent !== null);
}

export function useDialogFocusTrap({ open, dialogRef, returnFocusRef, onEscape }: {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onEscape: () => void;
}) {
  const escapeRef = useRef(onEscape);
  useEffect(() => { escapeRef.current = onEscape; }, [onEscape]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const returnFocus = returnFocusRef?.current;
    queueMicrotask(() => (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? available(dialog)[0])?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab" && !arrows.has(event.key)) return;
      const alert = dialog.querySelector<HTMLElement>("[role=alertdialog]");
      const scope = alert && alert.offsetParent !== null ? alert : dialog;
      const elements = available(scope);
      if (!elements.length) return;
      const current = document.activeElement instanceof HTMLElement ? elements.indexOf(document.activeElement) : -1;
      const backwards = event.shiftKey || event.key === "ArrowUp" || event.key === "ArrowLeft";
      const next = current < 0 ? 0 : (current + (backwards ? -1 : 1) + elements.length) % elements.length;
      elements[next].focus();
      elements[next].scrollIntoView({ block: "nearest" });
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      queueMicrotask(() => returnFocus?.focus());
    };
  }, [dialogRef, open, returnFocusRef]);
}
