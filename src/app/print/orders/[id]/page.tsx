import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/session";
import { PrintToolbar } from "@/components/PrintToolbar";
import { yen, num, dateJP } from "@/lib/format";

export const dynamic = "force-dynamic";

// 納品書（旧: printDocument2）
export default async function OrderPrintPage({ params }: { params: { id: string } }) {
  const { tenantId, session } = await requireTenant();
  const order = await prisma.order.findFirst({
    where: { id: params.id, tenantId },
    include: { customer: true, items: true, tenant: true },
  });
  if (!order) notFound();

  return (
    <>
      <PrintToolbar title={`納品書 ${order.orderNumber}`} />
      <div className="print-sheet">
        <h1 className="print-title">納品書</h1>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8mm" }}>
          <div style={{ width: "55%" }}>
            <div style={{ borderBottom: "1.5pt solid #000", paddingBottom: "2mm", fontSize: "13pt" }}>
              {order.customer.name} 御中
            </div>
            <div style={{ fontSize: "9pt", marginTop: "1mm", color: "#444" }}>
              {order.customer.postalCode && `〒${order.customer.postalCode}`}
              <br />
              {order.customer.address}
            </div>
            <p style={{ marginTop: "4mm", fontSize: "10pt" }}>
              下記のとおり納品いたしました。
            </p>
          </div>
          <div style={{ width: "40%", fontSize: "10pt" }}>
            <table style={{ width: "100%", fontSize: "10pt" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "1mm 0" }}>注文番号</td>
                  <td style={{ padding: "1mm 0", fontFamily: "monospace" }}>{order.orderNumber}</td>
                </tr>
                <tr>
                  <td>注文日</td>
                  <td>{dateJP(order.orderDate)}</td>
                </tr>
                <tr>
                  <td>納品日</td>
                  <td>{dateJP(order.dueDate) || "—"}</td>
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
              <th>商品名</th>
              <th className="tr" style={{ width: "12%" }}>数量</th>
              <th className="tc" style={{ width: "8%" }}>単位</th>
              <th className="tr" style={{ width: "14%" }}>単価</th>
              <th className="tr" style={{ width: "16%" }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((l, i) => (
              <tr key={l.id}>
                <td className="tc">{i + 1}</td>
                <td>{l.itemName}</td>
                <td className="tr">{num(l.quantity)}</td>
                <td className="tc">{l.unit}</td>
                <td className="tr">{yen(l.unitPrice)}</td>
                <td className="tr">{yen(l.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 12 - order.items.length) }).map((_, i) => (
              <tr key={`empty-${i}`}>
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
              <th className="tr">{yen(order.subtotal)}</th>
            </tr>
            <tr>
              <th colSpan={5} className="tr">消費税（{order.taxRate}%）</th>
              <th className="tr">{yen(order.tax)}</th>
            </tr>
            <tr>
              <th colSpan={5} className="tr" style={{ fontSize: "12pt" }}>合計</th>
              <th className="tr" style={{ fontSize: "12pt" }}>{yen(order.total)}</th>
            </tr>
          </tfoot>
        </table>

        {order.note && (
          <div style={{ marginTop: "6mm", fontSize: "10pt" }}>
            <strong>備考：</strong>
            <div style={{ whiteSpace: "pre-wrap", marginTop: "1mm" }}>{order.note}</div>
          </div>
        )}
      </div>
    </>
  );
}
