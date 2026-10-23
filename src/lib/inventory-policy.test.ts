import { describe, expect, it } from "vitest";
import { belowMinimumStock, onDemandRemaining } from "./inventory-policy";

const items = [
  { id:"regular", code:"A",name:"A",unit:"個", stock:4,stockPolicy:"STOCKED" as const,reorderPoint:5 },
  { id:"equal", code:"B",name:"B",unit:"個", stock:5,stockPolicy:"STOCKED" as const,reorderPoint:5 },
  { id:"zero", code:"C",name:"C",unit:"個",stock:0,stockPolicy:"STOCKED" as const,reorderPoint:0 },
  { id:"spare", code:"D",name:"D",unit:"個",stock:6,stockPolicy:"ON_DEMAND" as const,reorderPoint:10 },
  { id:"none", code:"E",name:"E",unit:"個",stock:0,stockPolicy:"ON_DEMAND" as const,reorderPoint:0 },
];

describe("inventory policy", () => {
  it("warns only STOCKED items below a positive minimum, not on-demand goods", () => {
    expect(belowMinimumStock(items).map(x=>x.id)).toEqual(["regular"]);
  });
  it("shows on-demand physical leftovers and draft demand separately", () => {
    const remaining=onDemandRemaining(items,new Map([["spare",4]]));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      id:"spare",stock:6,pendingDraftUnits:4,estimatedAvailable:2,
    });
  });
  it("shows shortages rather than counting committed draft demand as spare inventory", () => {
    const rows = onDemandRemaining(items,new Map([["spare",9]]));
    expect(rows[0]).toMatchObject({
      id:"spare",stock:6,pendingDraftUnits:9,estimatedAvailable:0,additionalUnitsNeeded:3,
    });
  });
  it("shows a zero-stock on-demand SKU when a draft order requires procurement", () => {
    const rows = onDemandRemaining(items,new Map([["none",9]]));
    expect(rows.find(item => item.id === "none")).toMatchObject({
      stock:0,pendingDraftUnits:9,estimatedAvailable:0,additionalUnitsNeeded:9,
    });
    expect(onDemandRemaining(items).find(item => item.id === "none")).toBeUndefined();
  });
  it("does not suppress unexpected negative physical stock in the dashboard", () => {
    const rows = onDemandRemaining([
      { ...items[3], stock:-2 },
    ]);
    expect(rows[0]).toMatchObject({stock:-2,estimatedAvailable:0,additionalUnitsNeeded:2});
  });
});
