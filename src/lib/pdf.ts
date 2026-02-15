/**
 * PDF generation utility using html2pdf.js
 */

export interface PDFOptions {
  filename?: string;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter";
  margin?: number;
  scale?: number;
}

const defaultOptions: PDFOptions = {
  filename: "report.pdf",
  orientation: "landscape",
  format: "a4",
  margin: 10,
  scale: 2,
};

/**
 * Generate a PDF from an HTML element
 * @param elementId - The ID of the HTML element to convert to PDF
 * @param options - PDF generation options
 */
export async function generatePDF(elementId: string, options: PDFOptions = {}): Promise<void> {
  const mergedOptions = { ...defaultOptions, ...options };

  // Dynamically import html2pdf to avoid SSR issues
  const html2pdf = (await import("html2pdf.js")).default;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }

  const pdfOptions = {
    margin: mergedOptions.margin,
    filename: mergedOptions.filename,
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: {
      scale: mergedOptions.scale,
      useCORS: true,
      logging: false,
    },
    jsPDF: {
      unit: "mm" as const,
      format: mergedOptions.format,
      orientation: mergedOptions.orientation,
    },
  };

  await html2pdf().set(pdfOptions).from(element).save();
}

/**
 * Open print dialog for an element
 * @param elementId - The ID of the HTML element to print
 */
export function printElement(elementId: string): void {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }

  // Create a new window for printing
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Failed to open print window. Please allow popups.");
  }

  // Copy styles
  const styles = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        // Cross-origin stylesheets will throw
        return "";
      }
    })
    .join("\n");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Report</title>
        <style>
          ${styles}
          @media print {
            body { margin: 0; padding: 20px; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${element.outerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  // Wait for content to load then print
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds === 0) return "--:--";

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

/**
 * Format file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}
