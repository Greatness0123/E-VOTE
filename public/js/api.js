// Thin fetch wrapper. Cookies (httpOnly session + readable CSRF token) are
// sent automatically with credentials: "include". Every state-changing
// request echoes the CSRF cookie back in a header (double-submit pattern);
// the server rejects the request if they don't match.
function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  const csrfToken = readCookie("sugvote_csrf");
  if (csrfToken && method !== "GET") headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

window.api = api;
