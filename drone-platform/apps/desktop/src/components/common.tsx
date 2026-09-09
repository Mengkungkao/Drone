import type { ReactNode } from 'react';
import { Icon } from '../icons';

export const dateTime = (date: string) => new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const firmwareName = (value: string) => ({ betaflight: 'Betaflight', px4: 'PX4', ardupilot: 'ArduPilot', custom: 'Custom firmware' })[value] ?? value;
export const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export function Tag({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`tag ${tone}`}>{children}</span>; }
export function Empty({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={26} /></span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Panel({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

