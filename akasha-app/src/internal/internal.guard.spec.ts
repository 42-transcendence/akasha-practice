import { InternalGuard } from "./internal.guard";

describe("InternalGuard", () => {
  it("should be defined", () => {
    expect(new InternalGuard()).toBeDefined();
  });
});
