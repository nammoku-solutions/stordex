import { requireSession } from "@/lib/session";

/**
 * Print layout — no app chrome. Pages under /print render here so users can
 * use the browser's "Save as PDF" to produce delivery notes, quotations,
 * invoices, picking lists (replacement for the legacy printDocument* GDI+
 * printing in the C# WinForms app).
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: A4; margin: 14mm; }
            @media print {
              .no-print { display: none !important; }
              body { background: white !important; }
              .print-root { background: white !important; }
              .print-sheet { box-shadow: none !important; padding: 0 !important; }
            }
            .print-root { background: #f1f5f9; min-height: 100vh; }
            .print-sheet {
              max-width: 190mm; margin: 0 auto; padding: 14mm;
              background: white; min-height: 270mm;
              font-family: "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif;
              color: #000;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .print-toolbar {
              position: sticky; top: 0; background: #f1f5f9;
              padding: 10px 16px; border-bottom: 1px solid #cbd5e1; z-index: 10;
              display: flex; justify-content: space-between; align-items: center;
            }
            .ptbl { width: 100%; border-collapse: collapse; }
            .ptbl th, .ptbl td { border: 1px solid #000; padding: 4px 6px; font-size: 10.5pt; }
            .ptbl th { background: #f1f5f9; font-weight: 600; }
            .ptbl td.tr, .ptbl th.tr { text-align: right; }
            .ptbl td.tc, .ptbl th.tc { text-align: center; }
            h1.print-title {
              font-size: 22pt; font-weight: 700; text-align: center;
              margin: 4mm 0 6mm; letter-spacing: 0.4em;
            }
          `,
        }}
      />
      <div className="print-root">{children}</div>
    </>
  );
}
