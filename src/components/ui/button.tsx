import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold cursor-pointer transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:shadow-sm",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 hover:shadow-sm",
        outline:
          "border border-input bg-background shadow-xs hover:border-foreground/20 hover:bg-accent hover:text-accent-foreground hover:shadow-sm",
        secondary: "border border-border bg-secondary text-secondary-foreground shadow-none hover:bg-secondary/75 hover:shadow-xs",
        success: "border border-success/25 bg-success/12 text-success hover:bg-success/18",
        warning: "border border-warning/25 bg-warning/12 text-warning hover:bg-warning/18",
        ghost: "shadow-none hover:-translate-y-0 hover:bg-accent hover:text-accent-foreground",
        link: "shadow-none hover:-translate-y-0 active:scale-100 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        xs: "h-8 rounded-md px-2.5 text-xs",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
