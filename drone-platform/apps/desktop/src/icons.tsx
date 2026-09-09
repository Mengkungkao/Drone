import type { CSSProperties } from 'react';

const paths: Record<string, string> = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  drone: 'M8 8l8 8M8 16l8-8M9 9h6v6H9zM4 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8M20 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8M20 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  connect: 'M8 3v4M16 3v4M6 7h12v4a6 6 0 0 1-12 0V7M12 17v5',
  configure: 'M4 7h7M15 7h5M4 17h3M11 17h9M11 4v6M7 14v6',
  simulation: 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',
  tests: 'M8 3h8M9 3v7l-6 9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2l-6-9V3M7 15h10',
  firmware: 'M7 7h10v10H7zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3',
  diagnostics: 'M2 12h4l3-8 6 16 3-8h4',
  pid: 'M3 20V4M3 20h18M5 16c4 0 3-10 7-10s3 8 9 8',
  blackbox: 'M4 5h16v14H4zM8 9h8M8 13h5M8 19v3M16 19v3',
  flight: 'M12 3l9 17-9-4-9 4zM12 3v13',
  reports: 'M5 2h10l4 4v16H5zM15 2v5h4M8 12h8M8 16h8',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M6 18L18 6',
  shield: 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6',
  lock: 'M5 10h14v12H5zM8 10V6a4 4 0 0 1 8 0v4',
  folder: 'M3 5h7l2 3h9v12H3z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 11v6M12 7v1',
  check: 'M5 12l4 4L19 6',
  download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  code: 'M8 5l-6 7 6 7M16 5l6 7-6 7M14 3l-4 18',
};

export function Icon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name] ?? paths.info} /></svg>;
}

export function AirframeDrawing() {
  return <svg className="airframe-drawing" viewBox="0 0 480 300" fill="none" aria-hidden="true">
    <defs><pattern id="draft-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" stroke="currentColor" strokeWidth=".5" opacity=".14" /></pattern></defs>
    <rect width="480" height="300" fill="url(#draft-grid)" />
    <g stroke="currentColor" strokeWidth="1.4">
      <path d="M240 33v234M105 150h270" strokeDasharray="4 7" opacity=".3" />
      <path d="M195 119l-65-46-18 26 71 58M286 119l65-46 18 26-71 58M195 182l-65 46-18-26 71-58M286 182l65 46 18-26-71-58" opacity=".6" />
      <path d="M215 93h50l33 39v35l-33 40h-50l-33-40v-35z" />
      <path d="M216 117h48l13 16v34l-13 16h-48l-13-16v-34zM222 107h36M222 195h36" opacity=".6" />
      <path d="M233 135l7-8 7 8M240 129v27M226 174h28" />
      {[ [118,83], [362,83], [118,217], [362,217] ].map(([cx,cy], i) => <g key={i}><circle cx={cx} cy={cy} r="42" opacity=".45" /><circle cx={cx} cy={cy} r="34" strokeDasharray="3 5" opacity=".3" /><circle cx={cx} cy={cy} r="8" /><ellipse cx={cx} cy={cy} rx="35" ry="7" transform={`rotate(${i % 2 ? 32 : -32} ${cx} ${cy})`} opacity=".8" /></g>)}
      <path d="M118 23H362M118 18v10M362 18v10M418 83v134M413 83h10M413 217h10" opacity=".3" />
    </g>
    <g fill="currentColor" fontFamily="monospace" fontSize="9" letterSpacing="2" opacity=".45"><text x="206" y="16">AIRFRAME</text><text x="14" y="286">DRONELAB / ENGINEERING WORKSPACE</text></g>
  </svg>;
}
