import type { ReactNode } from 'react';

function display(value: unknown): string {
  if (value === null || value === undefined) return 'Not available';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  return JSON.stringify(value) ?? 'Not available';
}
export function SystemInspector({
  items,
  children,
}: {
  items: Readonly<Record<string, unknown>>;
  children?: ReactNode;
}) {
  return (
    <section>
      <h2>System Inspector</h2>
      <div className="inspector">
        {Object.entries(items).map(([key, value]) => (
          <div key={key}>
            <span>{key.replaceAll(/([A-Z])/g, ' $1')}</span>
            <strong>{display(value)}</strong>
          </div>
        ))}
      </div>
      {children}
    </section>
  );
}
