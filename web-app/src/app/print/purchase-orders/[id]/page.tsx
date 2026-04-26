import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PrintToolbar } from "@/components/PrintToolbar";
import { yen, num, dateJP } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function POPrintPage({ params }: { params: { id: string } }) {
  const { tenantId, session } = await requireTenant();
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, tenantId },
    include: { supplier: true, items: { include: { item: true } } },
  });
  if (!po) notFound();

  return (
    <>
      <PrintToolbar title={`発注書 ${po.poNumber}`} />
      <div className="print-sheet">
        <h1 className="print-title">発 注 書</h1>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8mm" }}>
          <div style={{ width: "55%" }}>
            <div style={{ borderBottom: "1.5pt solid #000", paddingBottom: "2mm", fontSize: "13pt" }}>
              {po.supplier.name} 御中
            </div>
            <p style={{ marginTop: "3mm", fontSize: "10pt" }}>下記のとおり発注いたします。</p>
            {po.pickupDate && (
              <p style={{ fontSize: "11pt", marginTop: "3mm" }}>
                <strong>引取予定日：{dateJP(po.pickupDate)}</strong>
              </p>
            )}
          </div>
          <div style={{ width: "40%", fontSize: "10pt" }}>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "1mm 0" }}>発注番号</td>
                  <td style={{ fontFamily: "monospace" }}>{po.poNumber}</td>
                </tr>
                <tr>
                  <td>発注日</td>
                  <td>{dateJP(po.orderDate)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: "4mm", paddingTop: "2mm", borderTop: "1px solid #000" }}>
              <strong>{session.user.tenantName}</strong>
            </div>
          </div>
        </div>

        <table className="ptbl">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>No</th>
              <th style={{ width: "18%" }}>商品コード</th>
              <th>商品名</th>
              <th className="tr" style={{ width: "12%" }}>数量</th>
              <th className="tc" style={{ width: "8%" }}>単位</th>
              <th className="tr" style={{ width: "14%" }}>単価</th>
              <th className="tr" style={{ width: "14%" }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((l, i) => (
              <tr key={l.id}>
                <td className="tc">{i + 1}</td>
                <td style={{ fontFamily: "monospace" }}>{l.item.code}</td>
                <td>{l.itemName}</td>
                <td className="tr">{num(l.quantity)}</td>
                <td className="tc">{l.unit}</td>
                <td className="tr">{yen(l.unitPrice)}</td>
                <td className="tr">{yen(l.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 14 - po.items.length) }).map((_, i) => (
              <tr key={`e-${i}`}>
                <td>&nbsp;</td>
                <td></td>
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
              <th colSpan={6} className="tr">小計</th>
              <th className="tr">{yen(po.subtotal)}</th>
            </tr>
            <tr>
              <th colSpan={6} className="tr">消費税（{po.taxRate}%）</th>
              <th className="tr">{yen(po.tax)}</th>
            </tr>
            <tr>
              <th colSpan={6} className="tr" style={{ fontSize: "12pt" }}>合計</th>
              <th className="tr" style={{ fontSize: "12pt" }}>{yen(po.total)}</th>
            </tr>
          </tfoot>
        </table>

        {po.note && (
          <div style={{ marginTop: "6mm", fontSize: "10pt" }}>
            <strong>備考：</strong>
            <div style={{ whiteSpace: "pre-wrap", marginTop: "1mm" }}>{po.note}</div>
          </div>
        )}
      </div>
    </>
  );
}
