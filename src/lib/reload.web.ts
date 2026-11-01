/** Restart the web app (used to apply a new colour theme). */
export async function reloadApp(): Promise<void> {
  window.location.reload();
}
