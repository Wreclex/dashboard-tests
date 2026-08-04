import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMoizvonkiMangoStatusQueryKey,
  getGetMoizvonkiMangoOperatorsQueryKey,
  getListAdminInvitationsQueryKey,
  getListAdminUsersQueryKey,
  useCreateAdminInvitation,
  useDeleteAdminInvitation,
  useGetMoizvonkiMangoOperators,
  useGetMoizvonkiMangoStatus,
  useListAdminInvitations,
  useListAdminUsers,
  useUpdateAdminUserOperator,
  getGetMeQueryKey,
} from '@workspace/api-client-react';
import type { TeamMember, TeamRole } from '@workspace/api-client-react';
import { Check, Clipboard, Link2, Radio, RefreshCw, UserPlus, Users, X } from 'lucide-react';

const ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  employee: 'Сотрудник',
};

function invitationLink(token: string) {
  // The assignment itself matches Clerk's email at first sign-in. The link is
  // still a useful, private handoff marker and is never persisted client-side.
  return `${window.location.origin}${import.meta.env.BASE_URL}sign-up?team_invite=${encodeURIComponent(token)}`;
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
}

export default function TeamSetupModal({
  open,
  onClose,
  onOpenMango,
}: {
  open: boolean;
  onClose: () => void;
  onOpenMango: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('employee');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const usersQuery = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey(), enabled: open, retry: false },
  });
  const invitationsQuery = useListAdminInvitations({
    query: { queryKey: getListAdminInvitationsQueryKey(), enabled: open, retry: false },
  });
  const mangoStatus = useGetMoizvonkiMangoStatus({
    query: { queryKey: getGetMoizvonkiMangoStatusQueryKey(), enabled: open, retry: false },
  });
  const operatorsQuery = useGetMoizvonkiMangoOperators({
    query: {
      queryKey: getGetMoizvonkiMangoOperatorsQueryKey(),
      enabled: open && Boolean(mangoStatus.data?.isConnected),
      retry: false,
    },
  });
  const createInvitation = useCreateAdminInvitation();
  const deleteInvitation = useDeleteAdminInvitation();
  const updateOperator = useUpdateAdminUserOperator();

  const users = usersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const pending = invitations.filter((invite) => invite.status === 'pending');
  const unassigned = users.filter((member) => !member.mangoMemberId);
  const availableOperators = useMemo(
    () =>
      (operatorsQuery.data ?? []).filter(
        (operator) => !users.some((member) => member.mangoMemberId === operator.memberId),
      ),
    [operatorsQuery.data, users],
  );

  if (!open) return null;

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAdminInvitationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const submitInvitation = (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    createInvitation.mutate(
      { data: { email, role } },
      {
        onSuccess: async (invite) => {
          const link = invitationLink(invite.token);
          await copyText(`Здравствуйте! Вас добавили в команду. Войдите или зарегистрируйтесь по ссылке: ${link}\nВаша роль: ${ROLE_LABELS[invite.role]}.`);
          setCopiedId(invite.id);
          setEmail('');
          setNotice('Приглашение создано. Готовое сообщение со ссылкой скопировано.');
          invalidateTeam();
        },
        onError: (requestError: any) => {
          const code = requestError?.response?.data?.error;
          setError(
            code === 'member_already_registered'
              ? 'Этот человек уже вошёл в команду. Измените роль в списке участников.'
              : 'Не удалось создать приглашение. Проверьте email и попробуйте снова.',
          );
        },
      },
    );
  };

  const copyInvite = async (id: string) => {
    // The raw token is intentionally returned only once, at creation. Existing
    // invitations instead tell the admin to issue a fresh link, which revokes
    // the previous secret.
    setCopiedId(id);
    setNotice('Для безопасности ссылку можно скопировать только в момент создания. Создайте новое приглашение для этого email — старая ссылка станет недействительной.');
  };

  const assignOperator = (member: TeamMember, value: string) => {
    setError(null);
    const operator = (operatorsQuery.data ?? []).find((item) => String(item.memberId) === value);
    updateOperator.mutate(
      {
        clerkUserId: member.clerkUserId,
        data: operator
          ? { mangoMemberId: operator.memberId, mangoMemberName: operator.memberName }
          : { mangoMemberId: null, mangoMemberName: null },
      },
      {
        onSuccess: invalidateTeam,
        onError: (requestError: any) => {
          const code = requestError?.response?.data?.error;
          setError(
            code === 'operator_already_claimed'
              ? 'Этот оператор уже привязан к другому сотруднику.'
              : code === 'unknown_mango_operator'
                ? 'Список Mango пока не готов. Обновите подключение и повторите.'
                : 'Не удалось сохранить привязку оператора.',
          );
        },
      },
    );
  };

  const isLoading = usersQuery.isLoading || invitationsQuery.isLoading || mangoStatus.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="team-setup-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <section className="glass relative z-10 w-full max-w-[760px] rounded-[20px] flex flex-col max-h-[88dvh] overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <Users size={16} />
            </div>
            <div>
              <h2 id="team-setup-title" className="text-[14px] font-bold text-foreground">Настроить команду</h2>
              <p className="text-[10px] text-muted-foreground">Приглашения, роли и операторы Mango в одном месте</p>
            </div>
          </div>
          <button onClick={onClose} className="press-sm w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Закрыть настройку команды">
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {isLoading ? (
            <div className="py-14 flex items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Загружаем состояние команды…</div>
          ) : (
            <>
              <section aria-labelledby="team-progress-title">
                <h3 id="team-progress-title" className="text-xs font-bold text-foreground mb-2">Готовность команды</h3>
                <div className="grid sm:grid-cols-3 gap-2">
                  <StatusCard label="Mango Office" value={mangoStatus.data?.isConnected ? 'Подключен' : 'Не подключен'} ok={Boolean(mangoStatus.data?.isConnected)} action={!mangoStatus.data?.isConnected ? onOpenMango : undefined} actionLabel="Подключить" />
                  <StatusCard label="Вошли в систему" value={`${users.length} участн.`} ok={users.length > 0} />
                  <StatusCard label="Нужен оператор" value={`${unassigned.length} участн.`} ok={unassigned.length === 0} />
                </div>
              </section>

              <section className="rounded-[16px] border border-white/[0.08] bg-white/[0.025] p-3.5" aria-labelledby="invite-title">
                <div className="flex items-center gap-2 mb-3">
                  <UserPlus size={15} className="text-primary" />
                  <h3 id="invite-title" className="text-xs font-bold text-foreground">Добавить коллегу</h3>
                </div>
                <form onSubmit={submitInvitation} className="grid sm:grid-cols-[1fr_160px_auto] gap-2">
                  <label className="sr-only" htmlFor="team-invite-email">Email коллеги</label>
                  <input id="team-invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@company.ru" className="h-10 rounded-xl px-3 bg-white/[0.06] border border-white/[0.1] text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/60" />
                  <label className="sr-only" htmlFor="team-invite-role">Роль</label>
                  <select id="team-invite-role" value={role} onChange={(event) => setRole(event.target.value as TeamRole)} className="h-10 rounded-xl px-3 bg-white/[0.06] border border-white/[0.1] text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60">
                    <option value="employee" className="bg-[#1a1a1a]">Сотрудник</option>
                    <option value="manager" className="bg-[#1a1a1a]">Руководитель</option>
                    <option value="admin" className="bg-[#1a1a1a]">Администратор</option>
                  </select>
                  <button type="submit" disabled={createInvitation.isPending} className="press-sm h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
                    {createInvitation.isPending ? 'Создаём…' : 'Пригласить'}
                  </button>
                </form>
                <p className="mt-2 text-[10px] text-muted-foreground">После создания сообщение со ссылкой автоматически копируется. Ссылка действует 14 дней.</p>
              </section>

              {notice && <p role="status" className="rounded-xl bg-green-500/10 px-3 py-2 text-xs text-green-400">{notice}</p>}
              {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

              {pending.length > 0 && (
                <section aria-labelledby="pending-title">
                  <h3 id="pending-title" className="text-xs font-bold text-foreground mb-2">Ожидают входа ({pending.length})</h3>
                  <div className="space-y-2">
                    {pending.map((invite) => (
                      <div key={invite.id} className="rounded-xl border border-white/[0.07] p-3 flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-xs font-semibold text-foreground">{invite.email}</p>
                          <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[invite.role]} · до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}</p>
                        </div>
                        <button type="button" onClick={() => copyInvite(invite.id)} className="press-sm h-8 px-3 rounded-full bg-white/[0.06] text-xs text-muted-foreground hover:text-foreground flex gap-1.5 items-center">
                          {copiedId === invite.id ? <Check size={12} /> : <Clipboard size={12} />} Новая ссылка
                        </button>
                        <button type="button" onClick={() => deleteInvitation.mutate({ id: invite.id }, { onSuccess: invalidateTeam })} className="press-sm h-8 px-3 rounded-full bg-destructive/10 text-destructive text-xs" aria-label={`Отменить приглашение для ${invite.email}`}>Отменить</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section aria-labelledby="members-title">
                <div className="flex items-center justify-between mb-2">
                  <h3 id="members-title" className="text-xs font-bold text-foreground">Участники ({users.length})</h3>
                  <button type="button" onClick={() => { usersQuery.refetch(); invitationsQuery.refetch(); mangoStatus.refetch(); operatorsQuery.refetch(); }} className="press-sm text-[11px] text-primary hover:underline flex items-center gap-1"><RefreshCw size={11} /> Обновить</button>
                </div>
                <div className="space-y-2">
                  {users.map((member) => (
                    <div key={member.clerkUserId} className="rounded-xl border border-white/[0.07] p-3 grid sm:grid-cols-[1fr_210px] items-center gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{member.displayName || member.email || member.clerkUserId}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{ROLE_LABELS[member.role]}{member.email ? ` · ${member.email}` : ''}</p>
                      </div>
                      <label className="text-[10px] text-muted-foreground flex items-center gap-2">
                        <Radio size={12} className="text-teal-400" />
                        <select value={member.mangoMemberId ? String(member.mangoMemberId) : ''} onChange={(event) => assignOperator(member, event.target.value)} disabled={!mangoStatus.data?.isConnected || updateOperator.isPending} className="flex-1 h-8 rounded-lg px-2 bg-white/[0.06] border border-white/[0.1] text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-50">
                          <option value="" className="bg-[#1a1a1a]">Оператор не выбран</option>
                          {member.mangoMemberId && <option value={String(member.mangoMemberId)} className="bg-[#1a1a1a]">{member.mangoMemberName}</option>}
                          {availableOperators.map((operator) => <option key={operator.memberId} value={String(operator.memberId)} className="bg-[#1a1a1a]">{operator.memberName}</option>)}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusCard({ label, value, ok, action, actionLabel }: { label: string; value: string; ok: boolean; action?: () => void; actionLabel?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-bold ${ok ? 'text-green-400' : 'text-amber-400'}`}>{value}</p>
      {action && <button type="button" onClick={action} className="mt-2 text-[11px] text-primary hover:underline">{actionLabel}</button>}
    </div>
  );
}