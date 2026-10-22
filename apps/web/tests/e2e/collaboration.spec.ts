import { test, expect } from "@playwright/test";

test.describe("Pairio-Lite Multi-Seat Collaboration E2E", () => {
  test("two browser contexts join the same room and synchronize presence", async ({ browser }) => {
    const roomId = `e2e_${Date.now()}`;

    // Browser Context 1: Dev A (Host)
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // Browser Context 2: Dev B (Peer)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      // 1. Dev A joins room
      await pageA.goto(`/r/${roomId}`);
      await expect(pageA.getByText("Join Pair Programming Room")).toBeVisible();
      await pageA.fill('input[placeholder="Enter your name..."]', "Dev A");
      await pageA.click('button:has-text("Enter Room")');

      // Dev A enters editor
      await expect(pageA.getByText("Pairio-Lite")).toBeVisible();
      await expect(pageA.getByText("Dev A (Host)")).toBeVisible();

      // 2. Dev B joins the same room
      await pageB.goto(`/r/${roomId}`);
      await expect(pageB.getByText("Join Pair Programming Room")).toBeVisible();
      await pageB.fill('input[placeholder="Enter your name..."]', "Dev B");
      await pageB.click('button:has-text("Enter Room")');

      // Dev B enters editor
      await expect(pageB.getByText("Pairio-Lite")).toBeVisible();
      await expect(pageB.getByText("Dev B (Peer)")).toBeVisible();

      // 3. Verify presence sync: Dev A sees Dev B joined
      await expect(pageA.getByText("Dev B (Peer)")).toBeVisible({ timeout: 10000 });

      // 4. Verify Call Bar & Join Call button exists for both
      await expect(pageA.getByText("Join Call")).toBeVisible();
      await expect(pageB.getByText("Join Call")).toBeVisible();

      // 5. Verify Split Work button is active
      await expect(pageA.getByText("Split Work")).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
