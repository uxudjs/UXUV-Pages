import { forwardRef, type InputHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/Icon";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  leadingIcon?: LucideIcon;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  id,
  label,
  leadingIcon,
  className = "",
  ...props
}, ref) => (
  <div className="auth-input-field">
    <label className="sr-only" htmlFor={id}>{label}</label>
    <div className="auth-input-control">
      {leadingIcon && <Icon className="auth-input-icon" source={leadingIcon} size={16} />}
      <input
        ref={ref}
        id={id}
        className={`auth-input ${leadingIcon ? "auth-input-with-icon" : ""} ${className}`.trim()}
        {...props}
      />
    </div>
  </div>
));

Input.displayName = "Input";
