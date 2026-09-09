'use client';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { Search, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cloneElement, isValidElement, useId } from 'react';
export function Pick({
  value,
  onChange,
  items,
  label,
  placeholder = 'Choose…',
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  label: string;
  placeholder?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v ?? '')}
      items={items}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const generatedId = useId();
  const native =
    isValidElement<{ id?: string }>(children) &&
    typeof children.type === 'string' &&
    ['input', 'textarea', 'select'].includes(children.type);
  const inputId = native ? (children.props.id ?? generatedId) : undefined;
  return (
    <div className="field">
      {native ? (
        <label htmlFor={inputId}>{label}</label>
      ) : (
        <span className="field-label">{label}</span>
      )}
      {native ? cloneElement(children, { id: inputId }) : children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="check-row">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>
        {label}
        {hint && <p>{hint}</p>}
      </span>
    </label>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="searchbox">
      <Search />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Empty style={{ padding: '42px 20px' }}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && (
        <button className="btn primary" onClick={onAction}>
          <Plus />
          {action}
        </button>
      )}
    </Empty>
  );
}
export function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s: string;
    if (v == null) s = '';
    else if (typeof v === 'string') s = v;
    else if (
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      typeof v === 'bigint'
    )
      s = String(v);
    else s = JSON.stringify(v) ?? '';
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const csv = [
    keys.map(cell).join(','),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
