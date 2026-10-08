export async function sessionToken() {
  const src = `${process.env.ADMIN_PASSWORD}:${process.env.WA_APP_SECRET}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
