import { describe, expect, it } from "vitest";
import { B2B_RETURN_STATUS_LABEL, B2B_RETURN_REASON_LABEL } from "./b2b-return-labels";

describe("buyer and seller return labels", () => {
  it("covers all eleven persisted workflow states", () => {
    expect(Object.keys(B2B_RETURN_STATUS_LABEL)).toHaveLength(11);
    expect(B2B_RETURN_STATUS_LABEL.SUBMITTED).toBe("申請済み");
    expect(B2B_RETURN_STATUS_LABEL.PARTIALLY_APPROVED).toBe("一部承認");
    expect(B2B_RETURN_STATUS_LABEL.CREDIT_PENDING).toBe("金額調整待ち");
  });
  it("provides nonempty localized labels for all source reasons", () => {
    expect(Object.keys(B2B_RETURN_REASON_LABEL)).toHaveLength(4);
    expect(Object.values(B2B_RETURN_REASON_LABEL).every(value => value.length > 0)).toBe(true);
  });
});
