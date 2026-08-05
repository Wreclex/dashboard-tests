import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  getGetMoizvonkiMangoStatusQueryKey,
  getListAdminInvitationsQueryKey,
  getListAdminUsersQueryKey,
  useCreateAdminInvitation,
  useDeleteAdminInvitation,
  useGetMoizvonkiMangoStatus,
  useListAdminInvitations,
  useListAdminUsers,
} from '@workspace/api-client-react';
import type { TeamRole } from '@workspace/api-client-react';
import { Check, Copy, RefreshCw, UserPlus, Users, X } from 'lucide-react';

const roleLabels: Record<TeamRole, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  employee: 'Сотрудник',
};

/**
 * An invitation is a role pre-assignment for an email address, not a secret
 * link: the role applies to whoever signs in with that address. So the message
 * carries the plain app link and stresses which email to use.
 */
async function copyInviteText(email: string, role: TeamRole) {
  const link = `${window.location.origin}${import.meta.env.BASE_URL}sign-up`;
  const text = `Здравствуйте! Вас добавили в команду. Зарегистрируйтесь по ссылке: ${link}\nВажно: войдите именно с адресом ${email} — роль «${roleLabels[role]}» назначена на него.`;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

/** Compact dashboard entry point for the same team-setup flow as Report Tool. */
export function TeamSetupDialog({
  open,
  onOpenChange,
  onOpenMango,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onOpenMango: () => void;
}) {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('employee');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const users = useListAdminUsers({ query: { queryKey: getListAdminUsersQueryKey(), enabled: open, retry: false } });
  const invitations = useListAdminInvitations({ query: { queryKey: getListAdminInvitationsQueryKey(), enabled: open, retry: false } });
  const mango = useGetMoizvonkiMangoStatus({ query: { queryKey: getGetMoizvonkiMangoStatusQueryKey(), enabled: open, retry: false } });
  const create = useCreateAdminInvitation();
  const revoke = useDeleteAdminInvitation();
  if (!open) return null;

  const members = users.data ?? [];
  const pending = (invitations.data ?? []).filter((item) => item.status === 'pending');
  const withoutOperator = members.filter((item) => !item.mangoMemberId).length;
  const invalidate = () => {
    client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    client.invalidateQueries({ queryKey: getListAdminInvitationsQueryKey() });
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    create.mutate(
      { data: { email, role } },
      {
        onSuccess: async (invite) => {
          await copyInviteText(invite.email, invite.role);
          setEmail('');
          setMessage('Роль закреплена за этим email — готовое сообщение скопировано.');
          invalidate();
        },
        onError: (requestError: any) => {
          setError(
            requestError?.response?.data?.error === 'member_already_registered'
              ? 'Этот человек уже есть в команде.'
              : 'Не удалось создать приглашение. Проверьте email.',
          );
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dashboard-team-setup">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <section className="relative z-10 w-full max-w-xl rounded-xl border bg-background shadow-xl max-h-[88dvh] overflow-y-auto">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <h2 id="dashboard-team-setup" className="font-semibold">Настроить команду</h2>
              <p className="text-xs text-muted-foreground">Приглашения и готовность к работе</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Закрыть настройку команды"><X className="w-4 h-4" /></Button>
        </header>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <SetupStatus label="Mango" value={mango.data?.isConnected ? 'Подключен' : 'Не подключен'} ok={Boolean(mango.data?.isConnected)} />
            <SetupStatus label="Вошли" value={`${members.length}`} ok={members.length > 0} />
            <SetupStatus label="Без оператора" value={`${withoutOperator}`} ok={withoutOperator === 0} />
          </div>
          {!mango.data?.isConnected && (
            <Button variant="outline" className="w-full" onClick={onOpenMango}>Подключить общий Mango Office</Button>
          )}
          <form onSubmit={submit} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" /><h3 className="text-sm font-medium">Пригласить коллегу</h3></div>
            <label className="sr-only" htmlFor="dashboard-invite-email">Email коллеги</label>
            <input id="dashboard-invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@company.ru" className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="dashboard-invite-role">Роль</label>
              <select id="dashboard-invite-role" value={role} onChange={(event) => setRole(event.target.value as TeamRole)} className="h-10 flex-1 rounded-md border bg-background px-3 text-sm">
                <option value="employee">Сотрудник</option>
                <option value="manager">Руководитель</option>
                <option value="admin">Администратор</option>
              </select>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Создаём…' : 'Создать'}</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Роль закрепляется за email на 14 дней и применяется при первом входе с этим адресом.</p>
          </form>
          {message && <p role="status" className="rounded-md bg-green-500/10 p-2 text-xs text-green-700 dark:text-green-400">{message}</p>}
          {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
          <section>
            <h3 className="mb-2 text-sm font-medium">Роль закреплена, ждём первого входа ({pending.length})</h3>
            {pending.length === 0 ? <p className="text-xs text-muted-foreground">Нет закреплённых ролей.</p> : (
              <div className="space-y-2">
                {pending.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-2 rounded-md border p-2.5">
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{invite.email}</p><p className="text-[11px] text-muted-foreground">{roleLabels[invite.role]} · до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}</p></div>
                    <Button variant="ghost" size="sm" onClick={async () => { await copyInviteText(invite.email, invite.role); setMessage('Сообщение скопировано — отправьте его коллеге.'); }}><Copy className="mr-1 w-3.5 h-3.5" />Скопировать текст</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => revoke.mutate({ id: invite.id }, { onSuccess: invalidate })}>Отменить</Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-xs text-muted-foreground">Операторы назначаются в разделе «Команда» Report Tool.</p>
            <Button variant="ghost" size="sm" onClick={() => { users.refetch(); invitations.refetch(); mango.refetch(); }}><RefreshCw className="mr-1 w-3.5 h-3.5" />Обновить</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SetupStatus({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="rounded-lg border p-2"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-sm font-semibold ${ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{value}{ok && <Check className="ml-1 inline w-3 h-3" />}</p></div>;
}