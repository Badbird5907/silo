export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-widest uppercase">
      {children}
    </p>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-2xl font-bold tracking-tight">{children}</h2>
  );
}
