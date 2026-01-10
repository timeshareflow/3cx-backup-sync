import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";

export function formatMessageTime(dateString: string): string {
  const date = parseISO(dateString);

  if (isToday(date)) {
    return format(date, "h:mm a");
  }

  if (isYesterday(date)) {
    return `Yesterday ${format(date, "h:mm a")}`;
  }

  return format(date, "MMM d, h:mm a");
}

export function formatConversationTime(dateString: string): string {
  const date = parseISO(dateString);

  if (isToday(date)) {
    return format(date, "h:mm a");
  }

  if (isYesterday(date)) {
    return "Yesterday";
  }

  return format(date, "MMM d");
}

export function formatFullDate(dateString: string): string {
  const date = parseISO(dateString);
  return format(date, "MMMM d, yyyy 'at' h:mm a");
}

export function formatRelativeTime(dateString: string): string {
  const date = parseISO(dateString);
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatDateForInput(dateString: string): string {
  const date = parseISO(dateString);
  return format(date, "yyyy-MM-dd");
}

export function formatDateDivider(dateString: string): string {
  const date = parseISO(dateString);

  if (isToday(date)) {
    return "Today";
  }

  if (isYesterday(date)) {
    return "Yesterday";
  }

  return format(date, "EEEE, MMMM d, yyyy");
}

export function isSameDay(date1: string, date2: string): boolean {
  const d1 = parseISO(date1);
  const d2 = parseISO(date2);
  return format(d1, "yyyy-MM-dd") === format(d2, "yyyy-MM-dd");
}
