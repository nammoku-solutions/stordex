import { afterEach,describe,expect,it,vi } from "vitest";
import { b2bCreditVoidEnabled } from "./b2b-credit-void-feature";

afterEach(()=>vi.unstubAllEnvs());
describe("CreditNote VOID gate defaults hard OFF",()=>{
  it("requires BOTH exact switches on Staging preview",()=>{
    vi.stubEnv("VERCEL_ENV","preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","staging");
    vi.stubEnv("STORDEX_B2B_CREDIT_DRAFT_ENABLED","true");
    vi.stubEnv("STORDEX_B2B_CREDIT_VOID_ENABLED","false");
    expect(b2bCreditVoidEnabled()).toBe(false);
    vi.stubEnv("STORDEX_B2B_CREDIT_VOID_ENABLED","true");
    expect(b2bCreditVoidEnabled()).toBe(true);
    vi.stubEnv("STORDEX_B2B_CREDIT_DRAFT_ENABLED","false");
    expect(b2bCreditVoidEnabled()).toBe(false);
    vi.stubEnv("STORDEX_B2B_CREDIT_DRAFT_ENABLED","true");
    vi.stubEnv("VERCEL_ENV","production");
    expect(b2bCreditVoidEnabled()).toBe(false);
    vi.stubEnv("VERCEL_ENV","preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
    expect(b2bCreditVoidEnabled()).toBe(false);
  });
});
