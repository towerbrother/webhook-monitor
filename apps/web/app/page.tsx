import { APP_NAME } from "@repo/shared";

export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
        {APP_NAME.toUpperCase()}
      </h1>
      <p
        style={{
          fontSize: "4rem",
          color: "#22c55e",
          fontWeight: "bold",
        }}
      >
        OK
      </p>
      <p style={{ color: "#666", marginTop: "1rem" }}>
        Dashboard coming soon...
      </p>
    </main>
  );
}
