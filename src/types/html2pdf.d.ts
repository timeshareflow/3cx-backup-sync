declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: {
      type?: "jpeg" | "png" | "webp";
      quality?: number;
    };
    enableLinks?: boolean;
    html2canvas?: {
      scale?: number;
      useCORS?: boolean;
      logging?: boolean;
      letterRendering?: boolean;
      allowTaint?: boolean;
      backgroundColor?: string;
    };
    jsPDF?: {
      unit?: "pt" | "mm" | "cm" | "in";
      format?: "a4" | "letter" | "legal" | [number, number];
      orientation?: "portrait" | "landscape";
      compress?: boolean;
    };
    pagebreak?: {
      mode?: "avoid-all" | "css" | "legacy" | string[];
      before?: string | string[];
      after?: string | string[];
      avoid?: string | string[];
    };
  }

  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance;
    from(element: HTMLElement | string): Html2PdfInstance;
    save(): Promise<void>;
    toPdf(): Html2PdfInstance;
    get(type: "pdf"): Promise<unknown>;
    output(type: "blob" | "dataurlstring" | "arraybuffer"): Promise<Blob | string | ArrayBuffer>;
    outputPdf(type: "blob" | "dataurlstring" | "arraybuffer"): Promise<Blob | string | ArrayBuffer>;
  }

  function html2pdf(): Html2PdfInstance;
  function html2pdf(element: HTMLElement | string, options?: Html2PdfOptions): Promise<void>;

  export = html2pdf;
}
