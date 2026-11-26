"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1>iSchoolie couldn’t load</h1>
          <p style={{ color: "#657786" }}>Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ background: "#1839E8", color: "#fff", border: 0, borderRadius: 999, padding: "10px 24px", fontWeight: 700 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
