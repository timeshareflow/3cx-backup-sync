"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { Calendar } from "lucide-react";

interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ className = "", label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type="date"
            id={inputId}
            className={`w-full px-3 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              error ? "border-red-500" : "border-gray-300"
            } ${className}`}
            {...props}
          />
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

DatePicker.displayName = "DatePicker";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  startLabel?: string;
  endLabel?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = "Start Date",
  endLabel = "End Date",
}: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-4">
      <DatePicker
        label={startLabel}
        value={startDate}
        onChange={(e) => onStartDateChange(e.target.value)}
        max={endDate || undefined}
      />
      <span className="text-gray-500 mt-6">to</span>
      <DatePicker
        label={endLabel}
        value={endDate}
        onChange={(e) => onEndDateChange(e.target.value)}
        min={startDate || undefined}
      />
    </div>
  );
}
