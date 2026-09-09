import { useCallback, useEffect, useState } from 'react';
import type { ConfigurationSnapshot, WorkspaceState } from '../../../src/domain/types';
import { adapterDescriptors } from '../../../src/domain/adapters';
import { workspace } from '../../../src/application/workspace';
import { AirframeDrawing, Icon } from './icons';
import type { Page } from './types';
import { Panel, Tag, Empty, dateTime, firmwareName, messageOf } from './components/common';
import { CreateProjectDialog, ProjectList } from './components/Projects';
import { ConfigurationView } from './components/Configuration';
import { Activity, AdapterTopology, Readiness } from './components/WorkspacePanels';
import { CapabilityView, SettingsView, pageDescription } from './components/Capabilities';

const navigation: { label: Page; icon: string; group: string }[] = [
  { label: 'Dashboard', icon: 'dashboard', group: 'WORKSPACE' },
  { label: 'Drone', icon: 'drone', group: 'WORKSPACE' },
  { label: 'Connect', icon: 'connect', group: 'WORKSPACE' },
  { label: 'Configure', icon: 'configure', group: 'WORKSPACE' },
  { label: 'Simulation', icon: 'simulation', group: 'ENGINEERING' },
  { label: 'Tests', icon: 'tests', group: 'ENGINEERING' },
  { label: 'Firmware', icon: 'firmware', group: 'ENGINEERING' },
  { label: 'Diagnostics', icon: 'diagnostics', group: 'ANALYSIS' },
  { label: 'PID', icon: 'pid', group: 'ANALYSIS' },
  { label: 'Blackbox', icon: 'blackbox', group: 'ANALYSIS' },
  { label: 'Flight Test', icon: 'flight', group: 'ANALYSIS' },
  { label: 'Reports', icon: 'reports', group: 'ANALYSIS' },
];
export function App() {
  const [page, setPage] = useState<Page>('Dashboard');
  const [data, setData] = useState<WorkspaceState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [snapshots, setSnapshots] = useState<ConfigurationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isNative = workspace.isNative;
  const activeProject = data?.projects.find(project => project.id === data.selectedProjectId);
  const refresh = useCallback(async () => {
    if (!workspace.isNative) { setLoading(false); return true; }
    try { setData(await workspace.getWorkspace()); return true; }
    catch (err) { setData(null); setError(messageOf(err)); return false; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    setSnapshots([]);
    if (activeProject && isNative) workspace.listSnapshots(activeProject.id)
      .then(result => { if (active) setSnapshots(result); })
      .catch(err => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, [activeProject?.id, activeProject?.configurationRevision, isNative]);
  const navigate = (next: Page) => { setPage(next); setSidebarOpen(false); setNotice(''); };
  const act = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); const refreshed = await refresh(); if (success && refreshed) setNotice(success); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  };
  const selectProject = (projectId: string) => void act(() => workspace.selectProject(projectId));
  const createButton = <button className="button primary" disabled={!isNative || !data || busy} onClick={() => setShowCreate(true)} title={!isNative ? 'Project storage requires the DroneLab desktop application' : undefined}><Icon name="plus" size={17} />New project</button>;
  const state = data?.safety.state ?? 'UNAVAILABLE';
  const locked = state === 'EMERGENCY_STOP';

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <a href="#" className="brand" onClick={event => { event.preventDefault(); navigate('Dashboard'); }} aria-label="DroneLab dashboard"><span className="brand-symbol"><Icon name="drone" size={27} /></span><span>drone<span className="brand-light">lab</span><small>ENGINEERING WORKSPACE</small></span></a>
      <div className="workspace-selector"><span className="workspace-avatar">DL</span><div><strong>Local workspace</strong><span>{isNative ? 'Desktop · SQLite' : 'Browser preview'}</span></div><Icon name="lock" size={14} /></div>
      <nav aria-label="Main navigation">{navigation.map((item, index) => <div key={item.label}>{(index === 0 || navigation[index - 1].group !== item.group) && <div className="nav-group">{item.group}</div>}<button className={`nav-item ${page === item.label ? 'active' : ''}`} aria-current={page === item.label ? 'page' : undefined} onClick={() => navigate(item.label)}><Icon name={item.icon} size={18} /><span>{item.label}</span>{page === item.label && <span className="nav-active-dot" />}</button></div>)}</nav>
      <div className="sidebar-bottom"><div className="foundation-card"><span className="tiny-dot" /><strong>Foundation release</strong><p>Project-first. Safety by design.</p><span className="mono">PHASE 00 / v0.1.0</span></div><button className={`nav-item ${page === 'Settings' ? 'active' : ''}`} onClick={() => navigate('Settings')}><Icon name="settings" size={18} />Settings</button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="Toggle navigation" onClick={() => setSidebarOpen(!sidebarOpen)}><Icon name="dashboard" /></button><span>Workspace</span><Icon name="chevron" size={13} /><strong>{page}</strong></div><div className="topbar-actions"><span className={`connection-status ${locked ? 'locked' : ''}`}><span className="status-dot" />{state.replaceAll('_', ' ').toLowerCase()}</span><span className="topbar-divider" /><button className={`button safety-button ${locked ? 'is-locked' : ''}`} disabled={!isNative || !data || busy} onClick={() => void act(() => workspace.setSafetyState(locked ? 'DISCONNECTED' : 'EMERGENCY_STOP'), locked ? 'Local command lock cleared. Hardware remains disconnected.' : 'Local command lock engaged. No command was sent to hardware.')} title="Local application command lock; does not stop physical motors"><Icon name="lock" size={14} />{locked ? 'Clear local lock' : 'E-stop lock'}</button></div></header>
      {!isNative && <div className="preview-banner"><Icon name="info" size={16} /><span><strong>Browser preview</strong> · Native backend unavailable. Open the desktop app to create projects and save configuration snapshots.</span></div>}
      {error && <div className="message-banner error" role="alert"><Icon name="info" size={17} /><span>{error}</span><button className="text-button" onClick={() => { setError(''); void refresh(); }}>Retry</button><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
      {notice && <div className="message-banner success" role="status"><Icon name="check" size={17} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
      <main>
        <div className="page-heading"><div><div className="eyebrow">DRONELAB / {page === 'Dashboard' ? 'MISSION CONTROL' : 'ENGINEERING'}</div><h1>{page === 'Dashboard' ? 'Engineering starts here.' : page === 'Drone' ? 'Your airframes.' : page === 'Configure' ? 'Configuration workspace.' : `${page}.`}</h1><p>{page === 'Dashboard' ? 'One workspace. From the first configuration to the next flight.' : pageDescription(page)}</p></div>{(page === 'Dashboard' || page === 'Drone') && createButton}</div>
        {loading ? <div className="loading-panel" role="status"><span className="loading-line" /><span>Opening your workspace…</span></div> : <>
          {page === 'Dashboard' && <>
            <section className="overview-grid" aria-label="Workspace overview"><div className="overview-item"><span className="overview-label"><Icon name="folder" size={17} />PROJECTS</span><strong>{data?.projects.length ?? 0}<small>in this workspace</small></strong></div><div className="overview-item"><span className="overview-label"><Icon name="drone" size={17} />ACTIVE AIRFRAME</span><strong className="overview-text">{activeProject?.name ?? 'No project selected'}<small>{activeProject ? `${firmwareName(activeProject.firmware)} · ${activeProject.kind}` : 'Create a project to get started'}</small></strong></div><div className="overview-item"><span className="overview-label"><Icon name="shield" size={17} />COMMAND STATE</span><strong className="overview-text">{locked ? 'Locally locked' : 'Hardware disabled'}<small>No flight controller connection</small></strong></div></section>
            <div className="dashboard-grid"><Panel title="Project workspace" eyebrow="YOUR AIRFRAMES" action={<button className="text-button" onClick={() => navigate('Drone')}>View projects<Icon name="arrow" size={15} /></button>} className="project-panel">{data?.projects.length ? <ProjectList projects={data.projects} selectedId={activeProject?.id} select={selectProject} busy={busy} limit={3} /> : <div className="project-intro"><div><Tag tone="neutral">START WITH A PROJECT</Tag><h3>Every airframe.<br />One place to build.</h3><p>Keep physical drones and simulated vehicles organized, with a configuration history for each project.</p><button className="text-button" disabled={!isNative} onClick={() => setShowCreate(true)}>Create your first project<Icon name="arrow" size={16} /></button></div><AirframeDrawing /></div>}</Panel>
            <Panel title="Workspace readiness" eyebrow="SYSTEM STATUS"><div className="readiness"><Readiness name="Project storage" detail={data ? 'Native SQLite workspace available' : isNative ? 'Native workspace could not be loaded' : 'Requires the desktop runtime'} ready={Boolean(data)} /><Readiness name="Flight controllers" detail="No verified hardware connection" ready={false} /><Readiness name="Simulation runtime" detail="Gazebo / PX4 launch is not integrated" ready={false} /></div><div className="quiet-note"><Icon name="shield" size={17} /><span>Physical commands are disabled in this release.</span></div></Panel></div>
            <AdapterTopology adapters={data?.adapters ?? adapterDescriptors} onConnect={() => navigate('Connect')} />
            <div className="dashboard-grid lower-grid"><Panel title="Recent activity" eyebrow="WORKSPACE AUDIT"><Activity events={data?.logs ?? []} /></Panel><Panel title="A deliberate path to flight" eyebrow="DEVELOPMENT SEQUENCE"><div className="sequence"><span className="sequence-number">01</span><div><h3>Define your drone</h3><p>Create a physical or simulated project and capture its configuration.</p></div></div><div className="sequence muted"><span className="sequence-number">02</span><div><h3>Connect & validate</h3><p>Adapter verification and hardware checks are planned for a later phase.</p></div></div><button className="text-button sequence-link" onClick={() => navigate('Configure')}>Open configuration workspace<Icon name="arrow" size={16} /></button></Panel></div>
          </>}
          {page === 'Drone' && <><Panel title="Projects" action={<Tag>{data?.projects.length ?? 0} total</Tag>}>{data?.projects.length ? <ProjectList projects={data.projects} selectedId={activeProject?.id} select={selectProject} busy={busy} /> : <Empty icon="drone" title="Make room for your first airframe" action={createButton}>Create a physical drone or a simulated vehicle. Every project keeps its own configuration snapshots.</Empty>}</Panel>{activeProject && <Panel title="Selected project" className="section-gap"><dl className="detail-grid"><div><dt>PROJECT</dt><dd>{activeProject.name}</dd></div><div><dt>FIRMWARE</dt><dd>{firmwareName(activeProject.firmware)}</dd></div><div><dt>VEHICLE TYPE</dt><dd>{activeProject.kind}</dd></div><div><dt>CONFIGURATION REVISION</dt><dd>{activeProject.configurationRevision}</dd></div><div><dt>CREATED</dt><dd>{dateTime(activeProject.createdAt)}</dd></div><div><dt>DESCRIPTION</dt><dd>{activeProject.description || 'No description added'}</dd></div></dl></Panel>}</>}
          {page === 'Configure' && <ConfigurationView project={activeProject} snapshots={snapshots} native={isNative} busy={busy} onSave={(label, values) => act(() => workspace.saveSnapshot(activeProject!.id, label, values), 'Configuration snapshot saved locally. No flight controller settings were changed.')} onProjects={() => navigate('Drone')} />}
          {page === 'Connect' && <><AdapterTopology adapters={data?.adapters ?? adapterDescriptors} /><Panel title="Device connection" className="section-gap"><div className="capability-message"><span className="empty-icon"><Icon name="connect" size={27} /></span><div><h3>Transport integration is the next step</h3><p>Adapter contracts are defined. Serial discovery, MSP handshake, MAVLink connection, and firmware identity verification are not implemented. DroneLab does not scan or communicate with USB devices in this release.</p></div><Tag tone="pending">UNAVAILABLE</Tag></div></Panel></>}
          {page === 'Diagnostics' && <><Panel title="Workspace event log" eyebrow="LOCAL DIAGNOSTICS" action={<Tag>{data?.logs.length ?? 0} events</Tag>}><Activity events={data?.logs ?? []} expanded /></Panel><div className="two-column section-gap"><Panel title="Safety state"><dl className="detail-grid single"><div><dt>CURRENT STATE</dt><dd>{state.replaceAll('_', ' ')}</dd></div><div><dt>REASON</dt><dd>{data?.safety.reason ?? 'Native safety state is unavailable.'}</dd></div></dl></Panel><Panel title="Telemetry source"><Empty icon="diagnostics" title="No telemetry connected">Live sensor data and protocol health need a verified controller adapter. No telemetry is generated for display.</Empty></Panel></div></>}
          {page === 'Settings' && <SettingsView native={isNative} />}
          {!['Dashboard', 'Drone', 'Configure', 'Connect', 'Diagnostics', 'Settings'].includes(page) && <CapabilityView page={page} onNavigate={navigate} />}
        </>}
      </main>
      <footer className="statusbar"><span><span className="tiny-dot" />{isNative ? 'Native desktop runtime' : 'Preview runtime'}<span className="statusbar-separator">/</span>LOCAL WORKSPACE</span><span>{activeProject ? activeProject.name : 'No project selected'}<span className="statusbar-separator">/</span>DroneLab 0.1.0</span></footer>
    </div>
    {showCreate && <CreateProjectDialog busy={busy} onClose={() => setShowCreate(false)} onCreate={async input => { setBusy(true); setError(''); try { await workspace.createProject(input); const refreshed = await refresh(); setShowCreate(false); if (refreshed) setNotice('Project created in your local workspace.'); } catch (err) { throw err; } finally { setBusy(false); } }} />}
  </div>;
}

