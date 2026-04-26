import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PrintToolbar } from "@/components/PrintToolbar";
import { yen, num, dateJP } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QuotationPrintPage({ params }: { params: { id: string } }) {
  const { tenantId, session } = await requireTenant();
  const q = await prisma.quotation.findFirst({
    where: { id: params.id, tenantId },
    include: { customer: true, items: true },
  });
  if (!q) notFound();

  return (
    <>
      <PrintToolbar title={`見積書 ${q.quotationNumber}`} />
      <div className="print-sheet">
        <h1 className="print-title">見 積 書</h1>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8mm" }}>
          <div style={{ width: "55%" }}>
            <div style={{ borderBottom: "1.5pt solid #000", paddingBottom: "2mm", fontSize: "13pt" }}>
              {q.customer.name} 御中
            </div>
            <p style={{ marginTop: "3mm", fontSize: "10pt" }}>下記のとおりお見積申し上げます。</p>
            <p style={{ marginTop: "6mm", fontSize: "11pt" }}>
              <strong>御見積合計金額</strong>{" "}
              <span style={{ fontSize: "14pt" }}>{yen(q.total)}（税込）</span>
            </p>
            {q.validUntil && (
              <p style={{ fontSize: "10pt", marginTop: "2mm" }}>
                有効期限：{dateJP(q.validUntil)}
              </p>
            )}
          </div>
          <div style={{ width: "40%", fontSize: "10pt" }}>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "1mm 0" }}>見積番号</td>
                  <td style={{ fontFamily: "monospace" }}>{q.quotationNumber}</td>
                </tr>
                <tr>
                  <td>発行日</td>
                  <td>{dateJP(q.issueDate)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: "4mm", paddingTop: "2mm", borderTop: "1px solid #000" }}>
              <strong>{session.user.tenantName}</strong>
              {q.contactName && <div>担当: {q.contactName}</div>}
              {q.contactPhone && <div>TEL: {q.contactPhone}</div>}
            </div>
          </div>
        </div>

        <table className="ptbl">
          <thead>
            <tr>
              <th style={{ width: "6%" }}>No</th>
              <th>品名 / 規格</th>
              <th className="tr" style={{ width: "12%" }}>数量</th>
              <th className="tc" style={{ width: "8%" }}>単位</th>
              <th className="tr" style={{ width: "14%" }}>単価</th>
              <th className="tr" style={{ width: "16%" }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((l, i) => (
              <tr key={l.id}>
                <td className="tc">{i + 1}</td>
                <td>
                  {l.itemName}
                  {l.spec && <div style={{ fontSize: "9pt", color: "#444" }}>{l.spec}</div>}
                </td>
                <td className="tr">{num(l.quantity)}</td>
                <td className="tc">{l.unit}</td>
                <td className="tr">{yen(l.unitPrice)}</td>
                <td className="tr">{yen(l.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 14 - q.items.length) }).map((_, i) => (
              <tr key={`e-${i}`}>
                <td>&nbsp;</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={5} className="tr">小計</th>
              <th className="tr">{yen(q.subtotal)}</th>
            </tr>
            <tr>
              <th colSpan={5} className="tr">消費税（{q.taxRate}%）</th>
              <th className="tr">{yen(q.tax)}</th>
            </tr>
            <tr>
              <th colSpan={5} className="tr" style={{ fontSize: "12pt" }}>合計</th>
              <th className="tr" style={{ fontSize: "12pt" }}>{yen(q.total)}</th>
            </tr>
          </tfoot>
        </table>

        {q.note && (
          <div style={{ marginTop: "6mm", fontSize: "10pt" }}>
            <strong>備考：</strong>
            <div style={{ whiteSpace: "pre-wrap", marginTop: "1mm" }}>{q.note}</div>
          </div>
        )}
      </div>
    </>
  );
}
