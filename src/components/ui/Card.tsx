import { HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "gradient" | "bordered";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", padding = "md", variant = "default", children, ...props }, ref) => {
    const paddingStyles = {
      none: "",
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    };

    const variantStyles = {
      default: "bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow",
      gradient: "bg-gradient-to-br from-white to-gray-50 border border-gray-200 shadow-sm",
      bordered: "bg-white border-2 border-gray-200",
    };

    return (
      <div
        ref={ref}
        className={`rounded-xl ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className = "", children, ...props }, ref) => (
    <div
      ref={ref}
      className={`mb-4 pb-4 border-b border-gray-100 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

CardHeader.displayName = "CardHeader";

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className = "", children, ...props }, ref) => (
    <h3
      ref={ref}
      className={`text-lg font-bold text-gray-900 ${className}`}
      {...props}
    >
      {children}
    </h3>
  )
);

CardTitle.displayName = "CardTitle";

interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className = "", children, ...props }, ref) => (
    <p
      ref={ref}
      className={`text-sm text-gray-500 mt-1 ${className}`}
      {...props}
    >
      {children}
    </p>
  )
);

CardDescription.displayName = "CardDescription";

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className = "", children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
);

CardContent.displayName = "CardContent";
