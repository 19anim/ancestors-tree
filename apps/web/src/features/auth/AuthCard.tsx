import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  children: ReactNode;
}

export function AuthCard({ title, children }: AuthCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 rounded-photo border border-line bg-surface p-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      {children}
    </div>
  );
}
