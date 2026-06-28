// Runs on the server for each request, demonstrating server-side rendering.
export function load() {
  return { renderedAt: new Date().toISOString() }
}
