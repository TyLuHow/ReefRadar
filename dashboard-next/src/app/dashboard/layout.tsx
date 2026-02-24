export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(180deg, var(--bg-abyss) 0%, var(--bg-depths) 50%, var(--bg-surface) 100%)',
      }}
    >
      {children}
    </div>
  );
}
