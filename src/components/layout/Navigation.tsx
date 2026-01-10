"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface NavigationProps {
  breadcrumbs?: BreadcrumbItem[];
}

export function Navigation({ breadcrumbs = [] }: NavigationProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-gray-600 mb-4">
      <Link href="/" className="flex items-center hover:text-gray-900">
        <Home className="h-4 w-4" />
      </Link>

      {breadcrumbs.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4 text-gray-400" />
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-900">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
