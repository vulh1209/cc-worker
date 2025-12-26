import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════
   TERMINAL CARD - Main container with glassmorphism
   ═══════════════════════════════════════════════════════════════ */
interface TerminalCardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  headerActions?: ReactNode;
  noPadding?: boolean;
}

export function TerminalCard({
  children,
  className,
  title,
  subtitle,
  headerActions,
  noPadding = false,
}: TerminalCardProps) {
  return (
    <div className={cn('terminal-card', className)}>
      {(title || headerActions) && (
        <div className="terminal-card-header flex items-center justify-between">
          <div>
            {title && <h3 className="terminal-card-title">{title}</h3>}
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          {headerActions && <div>{headerActions}</div>}
        </div>
      )}
      <div className={cn(!noPadding && 'terminal-card-content')}>{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TERMINAL WINDOW - macOS style window
   ═══════════════════════════════════════════════════════════════ */
interface TerminalWindowProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function TerminalWindow({
  children,
  className,
  title = 'terminal',
}: TerminalWindowProps) {
  return (
    <div className={cn('terminal-window', className)}>
      <div className="terminal-window-header">
        <div className="terminal-window-dots">
          <span className="terminal-window-dot terminal-window-dot-red" />
          <span className="terminal-window-dot terminal-window-dot-yellow" />
          <span className="terminal-window-dot terminal-window-dot-green" />
        </div>
        <span className="terminal-window-title">{title}</span>
        <div className="w-12" /> {/* Spacer for centering */}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BADGE - Terminal style badges
   ═══════════════════════════════════════════════════════════════ */
interface StatusBadgeProps {
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export function StatusBadge({ status, size = 'md', showDot = true }: StatusBadgeProps) {
  const config: Record<string, { class: string; dotClass: string; label: string }> = {
    ONLINE: { class: 'terminal-badge-success', dotClass: 'status-online', label: 'ONLINE' },
    OFFLINE: { class: 'terminal-badge-default', dotClass: 'status-offline', label: 'OFFLINE' },
    BUSY: { class: 'terminal-badge-warning', dotClass: 'status-busy', label: 'BUSY' },
    PENDING: { class: 'terminal-badge-default', dotClass: 'status-offline', label: 'PENDING' },
    RUNNING: { class: 'terminal-badge-warning', dotClass: 'status-busy', label: 'RUNNING' },
    COMPLETED: { class: 'terminal-badge-success', dotClass: 'status-online', label: 'COMPLETED' },
    FAILED: { class: 'terminal-badge-error', dotClass: 'status-error', label: 'FAILED' },
    CANCELLED: { class: 'terminal-badge-default', dotClass: 'status-offline', label: 'CANCELLED' },
  };

  const { class: badgeClass, dotClass, label } = config[status] || config.PENDING;

  return (
    <span
      className={cn(
        'terminal-badge',
        badgeClass,
        size === 'sm' && 'text-[10px] px-1.5 py-0'
      )}
    >
      {showDot && <span className={cn('status-indicator', dotClass, 'w-1.5 h-1.5')} />}
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STAT CARD - Big number display
   ═══════════════════════════════════════════════════════════════ */
interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: ReactNode;
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'orange';
  trend?: {
    value: number;
    label: string;
  };
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = 'default',
  trend,
}: StatCardProps) {
  const colorClasses = {
    default: 'text-foreground',
    green: 'stat-value-green',
    yellow: 'stat-value-yellow',
    red: 'stat-value-red',
    blue: 'stat-value-blue',
    orange: 'stat-value-orange',
  };

  return (
    <TerminalCard className="group hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className={cn('stat-value mt-1', colorClasses[color])}>{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                'text-xs mt-1 flex items-center gap-1',
                trend.value >= 0 ? 'text-green-400' : 'text-red-400'
              )}
            >
              <span>{trend.value >= 0 ? '↑' : '↓'}</span>
              <span>
                {Math.abs(trend.value)}% {trend.label}
              </span>
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 rounded bg-secondary/50 text-primary group-hover:bg-primary/10 transition-colors">
            {icon}
          </div>
        )}
      </div>
    </TerminalCard>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROGRESS BAR - Terminal style
   ═══════════════════════════════════════════════════════════════ */
interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'orange' | 'green' | 'blue' | 'yellow';
  striped?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressBar({
  value,
  max = 100,
  color = 'orange',
  striped = false,
  showLabel = false,
  size = 'md',
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const colorClasses = {
    orange: 'terminal-progress-bar-orange',
    green: 'terminal-progress-bar-green',
    blue: 'bg-blue-500 shadow-glow-blue',
    yellow: 'bg-yellow-500 shadow-glow-yellow',
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn('terminal-progress flex-1', size === 'sm' && 'h-1.5')}
      >
        <div
          className={cn(
            'terminal-progress-bar',
            colorClasses[color],
            striped && 'terminal-progress-bar-striped'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground tabular-nums min-w-[3ch]">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ASCII EMPTY STATE
   ═══════════════════════════════════════════════════════════════ */
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  type?: 'workers' | 'tasks' | 'default';
}

export function EmptyState({
  title,
  description,
  action,
  type = 'default',
}: EmptyStateProps) {
  const asciiArt = {
    workers: `
    ╔═══════════════╗
    ║   ◇     ◇     ║
    ║      ___      ║
    ║     /   \\     ║
    ║    |  ?  |    ║
    ║     \\___/     ║
    ╚═══════════════╝
    `,
    tasks: `
    ┌─────────────────┐
    │  ☐ ─────────    │
    │  ☐ ─────────    │
    │  ☐ ─────────    │
    │       ...       │
    └─────────────────┘
    `,
    default: `
    ╭───────────────╮
    │      404      │
    │   ◠     ◠     │
    │      ⌣       │
    ╰───────────────╯
    `,
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <pre className="ascii-art mb-4">{asciiArt[type]}</pre>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TERMINAL DIVIDER
   ═══════════════════════════════════════════════════════════════ */
interface DividerProps {
  label?: string;
}

export function Divider({ label }: DividerProps) {
  if (label) {
    return <div className="terminal-divider my-6">{label}</div>;
  }
  return <hr className="border-border my-6" />;
}

/* ═══════════════════════════════════════════════════════════════
   ACTIVITY ITEM - For timeline/activity feeds
   ═══════════════════════════════════════════════════════════════ */
interface ActivityItemProps {
  icon: ReactNode;
  iconColor?: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  title: string;
  timestamp: string;
  description?: string;
}

export function ActivityItem({
  icon,
  iconColor = 'gray',
  title,
  timestamp,
  description,
}: ActivityItemProps) {
  const colorClasses = {
    green: 'text-green-400 bg-green-500/10',
    yellow: 'text-yellow-400 bg-yellow-500/10',
    red: 'text-red-400 bg-red-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    gray: 'text-muted-foreground bg-secondary',
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <div
        className={cn(
          'flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs',
          colorClasses[iconColor]
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground truncate">{title}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {timestamp}
          </span>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TERMINAL BUTTON
   ═══════════════════════════════════════════════════════════════ */
interface TerminalButtonProps {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export function TerminalButton({
  children,
  variant = 'default',
  size = 'md',
  className,
  onClick,
  disabled,
  type = 'button',
}: TerminalButtonProps) {
  const variantClasses = {
    default: 'terminal-btn',
    primary: 'terminal-btn terminal-btn-primary',
    ghost: 'terminal-btn terminal-btn-ghost',
    destructive: 'terminal-btn bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SHORTCUT HINT
   ═══════════════════════════════════════════════════════════════ */
interface ShortcutHintProps {
  keys: string[];
}

export function ShortcutHint({ keys }: ShortcutHintProps) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, i) => (
        <kbd key={i} className="kbd">
          {key}
        </kbd>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TYPING TEXT - Typewriter effect
   ═══════════════════════════════════════════════════════════════ */
export function TypingText({ children }: { children: string }) {
  return (
    <span className="typing-cursor">
      {children}
    </span>
  );
}
