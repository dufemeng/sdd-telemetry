interface EmptyStateProps { text: string }

export function EmptyState({ text }: EmptyStateProps) {
  return (
    <div className="grid min-h-24 place-items-center text-[12px] text-[var(--color-muted)]">
      {text}
    </div>
  );
}
