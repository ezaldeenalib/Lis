'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useListViewStore } from '@/stores/list-view.store';
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
import { Badge } from '@/components/ui/badge';

interface PlatformUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
}

export default function PlatformUsersPage() {
  const viewMode = useListViewStore((s) => s.viewMode);
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['platform', 'users'],
    queryFn: () => api.get<PlatformUser[]>('/platform/users'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-indigo-900">
          مستخدمو المنصة
        </h1>
        <p className="text-indigo-700/80">
          المدراء والموظفون على مستوى المنصة
        </p>
      </div>

      <Card className="border-indigo-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <Users className="h-5 w-5" />
            جميع مستخدمي المنصة
          </CardTitle>
          <CardDescription>
            المستخدمون ذوو صلاحيات المنصة (SUPER_ADMIN، SUPPORT)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-indigo-600/80">
              لا يوجد مستخدمون للمنصة.
            </p>
          ) : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.isActive ? 'success' : 'secondary'}
                      >
                        {user.isActive ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-xl border border-indigo-100 bg-card p-4 shadow-sm space-y-2"
                >
                  <p className="font-semibold">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-sm ltr-isolate font-mono text-muted-foreground break-all">{user.email}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge variant="outline">{user.role}</Badge>
                    <Badge variant={user.isActive ? 'success' : 'secondary'}>
                      {user.isActive ? 'نشط' : 'غير نشط'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
