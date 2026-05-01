'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AuditLog {
  id: string;
  timestamp: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

const ENTITY_TYPES = [
  'Patient',
  'Order',
  'Sample',
  'Result',
  'LabService',
  'Panel',
  'Analyzer',
  'User',
  'All',
];

function ChangesDiff({
  oldValues,
  newValues,
}: {
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}) {
  if (!oldValues && !newValues) return null;
  const keys = new Set([
    ...Object.keys(oldValues ?? {}),
    ...Object.keys(newValues ?? {}),
  ]);

  return (
    <div className="mt-2 space-y-1 text-xs font-mono">
      {Array.from(keys).map((key) => {
        const oldVal = oldValues?.[key];
        const newVal = newValues?.[key];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        return (
          <div
            key={key}
            className={cn(
              'flex gap-2 py-1',
              changed && 'bg-muted/50 rounded px-2'
            )}
          >
            <span className="text-muted-foreground min-w-[120px]">{key}:</span>
            {changed ? (
              <>
                <span className="text-destructive line-through">
                  {oldVal !== undefined && oldVal !== null
                    ? String(oldVal)
                    : '(empty)'}
                </span>
                <span>→</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {newVal !== undefined && newVal !== null
                    ? String(newVal)
                    : '(empty)'}
                </span>
              </>
            ) : (
              <span>{String(newVal ?? oldVal)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AuditLogsPage() {
  const viewMode = useListViewStore((s) => s.viewMode);
  const [entityType, setEntityType] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (entityType && entityType !== 'All') params.set('entityType', entityType);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', entityType, dateFrom, dateTo],
    queryFn: () =>
      api.get<AuditLog[]>(
        `/api/v1/audit-logs${params.toString() ? `?${params}` : ''}`
      ),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">سجل النشاطات</h1>
        <p className="page-subheading">عرض نشاط النظام وتاريخ التغييرات</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            سجل النشاطات
          </CardTitle>
          <CardDescription>
            عرض قراءة فقط لجميع التغييرات المتتبّعة في النظام
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>نوع السجل</Label>
              <Select
                value={entityType}
                onValueChange={setEntityType}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">لا توجد سجلات نشاطات</p>
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>التوقيت</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>الإجراء</TableHead>
                  <TableHead>نوع السجل</TableHead>
                  <TableHead>المعرّف</TableHead>
                  <TableHead>التغييرات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id;
                    const hasDetails =
                      (log.oldValues &&
                        Object.keys(log.oldValues).length > 0) ||
                      (log.newValues &&
                        Object.keys(log.newValues).length > 0);

                    return (
                      <React.Fragment key={log.id}>
                        <TableRow
                          key={log.id}
                          className={cn(
                            hasDetails && 'cursor-pointer hover:bg-muted/50'
                          )}
                          onClick={() =>
                            hasDetails &&
                            setExpandedId(isExpanded ? null : log.id)
                          }
                        >
                          <TableCell className="w-10">
                            {hasDetails ? (
                              isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDateTime(log.timestamp)}
                          </TableCell>
                          <TableCell>
                            {log.userName ?? log.userEmail ?? log.userId ?? '-'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                log.action === 'CREATE'
                                  ? 'success'
                                  : log.action === 'DELETE'
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell>{log.entityType}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[120px] truncate">
                            {log.entityId}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {log.changes ?? '-'}
                          </TableCell>
                        </TableRow>
                        {isExpanded && hasDetails && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              <div className="text-sm">
                                <h4 className="font-medium mb-2">
                                  تفاصيل التغييرات
                                </h4>
                                <ChangesDiff
                                  oldValues={log.oldValues}
                                  newValues={log.newValues}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
              </TableBody>
            </Table>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const hasDetails =
                  (log.oldValues && Object.keys(log.oldValues).length > 0) ||
                  (log.newValues && Object.keys(log.newValues).length > 0);
                return (
                  <div
                    key={log.id}
                    className={cn(
                      'rounded-xl border border-border bg-card p-4 shadow-card space-y-2',
                      hasDetails && 'cursor-pointer'
                    )}
                    onClick={() =>
                      hasDetails && setExpandedId(isExpanded ? null : log.id)
                    }
                    onKeyDown={(e) => {
                      if (!hasDetails) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : log.id);
                      }
                    }}
                    role={hasDetails ? 'button' : undefined}
                    tabIndex={hasDetails ? 0 : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {hasDetails ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          )
                        ) : null}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </div>
                      <Badge
                        variant={
                          log.action === 'CREATE'
                            ? 'success'
                            : log.action === 'DELETE'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="shrink-0"
                      >
                        {log.action}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {log.userName ?? log.userEmail ?? log.userId ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.entityType}{' '}
                      <span className="ltr-isolate font-mono">{log.entityId}</span>
                    </p>
                    {log.changes && (
                      <p className="text-xs line-clamp-2 text-muted-foreground">{log.changes}</p>
                    )}
                    {isExpanded && hasDetails && (
                      <div className="pt-2 border-t border-border text-sm">
                        <h4 className="font-medium mb-2">تفاصيل التغييرات</h4>
                        <ChangesDiff oldValues={log.oldValues} newValues={log.newValues} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
