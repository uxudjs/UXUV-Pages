import { forwardRef, type ButtonHTMLAttributes } from "react";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className = "", ...props }, ref) => (
    <button ref={ref} className={`auth-submit ${className}`.trim()} {...props} />
  ),
);

Button.displayName = "Button";
