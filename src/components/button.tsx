import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Botões do design system: 48 px no celular, compactos no desktop quando size="sm".
export const buttonStyles = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,transform,color] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ac text-ac-fg hover:bg-ac-hover",
        secondary: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "text-ac-text hover:bg-ac-soft",
        quiet: "text-fg-2 hover:bg-surface-2",
        danger: "bg-red-bg text-red hover:brightness-95",
      },
      size: {
        md: "h-12 rounded-[12px] px-[18px] text-[16px]",
        sm: "h-9 rounded-[9px] px-3 text-[13px] [&_svg]:size-[15px]",
        icon: "size-11 rounded-[12px]",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>;

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, block, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonStyles({ variant, size, block }), className)} {...props} />;
});
