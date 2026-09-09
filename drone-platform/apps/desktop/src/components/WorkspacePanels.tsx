import type { WorkspaceState } from '../../../../src/domain/types';
import { Icon } from '../icons';
import { Panel, Tag, dateTime } from './common';

export function Readiness({ name, detail, ready }: { name: string; detail: string; ready: boolean }) {
  return <div className="readiness-row"><span className={`readiness-icon ${ready ? 'ready' : ''}`}><Icon name={ready ? 'check' : 'clock'} size={17} /></span><div><strong>{name}</strong><p>{detail}</p></div><span className={`readiness-dot ${ready ? 'ready' : ''}`} /></div>;
}

export function AdapterTopology({ adapters, onConnect }: { adapters: WorkspaceState['adapters']; onConnect?: () => void }) {
  return <Panel title="One platform. Independent adapters." eyebrow="CONNECTION ARCHITECTURE" className="section-gap adapter-panel" action={onConnect && <button className="text-button" onClick={onConnect}>Explore connections<Icon name="arrow" size={15} /></button>}><div className="adapter-grid">{adapters.map((adapter, index) => <article className="adapter-card" key={adapter.id}><div className="adapter-header"><span className={`adapter-icon adapter-${index}`}><Icon name={adapter.id.includes('sim') || adapter.id.includes('gazebo') ? 'simulation' : 'firmware'} size={23} /></span><Tag tone="pending">{adapter.status}</Tag></div><h3>{adapter.name}</h3><div className="adapter-flow"><span>{adapter.protocol}</span><Icon name="arrow" size={13} /><span>{adapter.target}</span></div><p>{adapter.reason}</p></article>)}</div><div className="shared-services"><span className="mono">SHARED SERVICES</span><span>Diagnostics</span><span>Blackbox</span><span>Telemetry</span><span>Testing</span><span>Reports</span><Tag>PLANNED INTEGRATIONS</Tag></div></Panel>;
}

export function Activity({ events, expanded = false }: { events: WorkspaceState['logs']; expanded?: boolean }) {
  return events.length ? <ol className={`activity-list ${expanded ? 'expanded' : ''}`}>{events.slice(0, expanded ? 100 : 5).map(event => <li key={event.id}><span className={`event-dot ${event.level.toLowerCase()}`} /><div><strong>{event.operation.replaceAll('_', ' ')}</strong><p>{event.message}</p></div><time dateTime={event.timestamp}>{dateTime(event.timestamp)}</time></li>)}</ol> : <div className="empty-activity"><Icon name="clock" size={24} /><div><h3>No workspace events yet</h3><p>Project, snapshot, and safety actions appear here as they happen.</p></div></div>;
}

