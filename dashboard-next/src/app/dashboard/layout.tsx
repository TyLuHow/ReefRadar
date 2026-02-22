export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(180deg, var(--abyss) 0%, var(--deep) 50%, var(--mid) 100%)',
      }}
    >
      {children}
    </div>
  );
}
