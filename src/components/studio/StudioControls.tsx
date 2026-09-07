import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { GoalNode } from '../../types';
import { studioItemPath } from '../../lib/studioWorkspace';

export const fieldClass = 'studio-input';

export function StudioButton({ children, onClick, disabled = false, quiet = false, danger = false }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; quiet?: boolean; danger?: boolean;
}) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`studio-button ${danger ? 'studio-button-danger' : quiet ? 'studio-button-quiet' : 'studio-button-primary'}`}>{children}</button>;
}

export function StudioTabs<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <div className="studio-tabs" role="group">{options.map((option) => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function StudioPanel({ title, subtitle, children, onClose, inactive = false }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; inactive?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { requestAnimationFrame(() => { if (previous?.isConnected && !previous.closest('[inert]')) previous.focus(); }); };
  }, []);
  useEffect(() => { if (inactive) ref.current?.setAttribute('inert', ''); else ref.current?.removeAttribute('inert'); }, [inactive]);
  return <div className="studio-panel-scrim" aria-hidden={inactive || undefined} onClick={inactive ? undefined : onClose}>
    <section ref={ref} tabIndex={-1} className="studio-panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
      if (inactive || e.key !== 'Tab') return;
      const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? [])].filter((el) => el.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first?.focus(); }
    }}>
      <header className="studio-panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="studio-icon-button" aria-label="Close editor" onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

/** Every repeated label retains its source; this list is never inferred from names. */
export function StudioTargets({ goals, nodes }: { goals: GoalNode[]; nodes: GoalNode[] }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, { label: string; path: string; nodes: GoalNode[] }>();
    nodes.forEach((node) => {
      const path = studioItemPath(goals, node.id);
      const existing = grouped.get(path);
      if (existing) existing.nodes.push(node);
      else {
        const parts = path.split(' / ');
        grouped.set(path, { label: parts[parts.length - 1] ?? 'Location', path, nodes: [node] });
      }
    });
    return [...grouped.values()];
  }, [goals, nodes]);
  const [activePath, setActivePath] = useState('');
  useEffect(() => {
    if (!groups.some((group) => group.path === activePath)) setActivePath(groups[0]?.path ?? '');
  }, [activePath, groups]);
  if (nodes.length === 0) return <p className="studio-context">All goals</p>;
  if (nodes.length === 1) return <div className="studio-target-single"><strong>{nodes[0].title}</strong><span>{studioItemPath(goals, nodes[0].id)}</span></div>;
  const labels = [...new Set(nodes.map((node) => node.title))];
  const activeGroup = groups.find((group) => group.path === activePath) ?? groups[0];
  return <details className="studio-targets"><summary><span><strong>{nodes.length} selected · {groups.length} location{groups.length === 1 ? '' : 's'}</strong><span>{labels.slice(0, 2).join(' · ')}{labels.length > 2 ? '…' : ''}</span></span><ChevronDown size={15} /></summary>
    {groups.length > 1 && <div className="studio-location-tabs" role="tablist" aria-label="Selected locations">{groups.map((group) => <button key={group.path} type="button" role="tab" title={group.path} aria-selected={activeGroup?.path === group.path} onClick={() => setActivePath(group.path)}><span>{group.label}</span><small>{group.nodes.length}</small></button>)}</div>}
    {activeGroup && <><p className="studio-location-path">{activeGroup.path}</p><ul>{activeGroup.nodes.map((node) => <li key={node.id}><strong>{node.title}</strong></li>)}</ul></>}
  </details>;
}

export function StudioField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="studio-field"><span>{label}</span>{children}</label>;
}
