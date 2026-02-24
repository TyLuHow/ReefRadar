export default function ExperienceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-abyss min-h-screen">
      {children}
    </div>
  );
}
