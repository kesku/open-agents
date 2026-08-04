/** Start the Workflow World worker when this Next.js process boots. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { getWorld } = await import("workflow/runtime");
  const world = await getWorld();
  await world.start?.();
}
