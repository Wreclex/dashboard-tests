import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListAdminUsers,
  useUpdateAdminUserRole,
  getListAdminUsersQueryKey,
} from '@workspace/api-client-react';
import type { TeamMember, TeamRole } from '@workspace/api-client-react';
import { RefreshCw, ShieldCheck, UserCog, UserRound, X } from 'lucide-react';

const ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  employee: 'Сотрудник',
};

const ROLES: TeamRole[] = ['employee', 'manager', 'admin'];

function RoleIcon({ role }: { role: TeamRole }) {
  if (role === 'admin') return <ShieldCheck size={13} className="text-primary" />;
  if (role === 'manager') return <UserCog size={13} className="text-blue-400" />;
  return <UserRound size={13} className="text-muted-foreground" />;
}

/**
 * Admin-only user management: list every registered user and assign each a
 * role (employee / manager / admin). The admin cannot change their own role.
 */
export default function AdminUsersModal({
  open,
  onClose,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  currentUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: users, isLoading, error, refetch, isFetching } = useListAdminUsers({
    query: { queryKey: getListAdminUsersQueryKey(), enabled: open, retry: false },
  });
  const updateRole = useUpdateAdminUserRole();

  if (!open) return null;

  const handleRoleChange = (member: TeamMember, role: TeamRole) => {
    setActionError(null);
    updateRole.mutate(
      { clerkUserId: member.clerkUserId, data: { role } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        },
        onError: (err: any) => {
          const status = err?.response?.status;
          setActionError(
            status === 400
              ? 'Нельзя изменить собственную должность.'
              : 'Не удалось изменить должность. Попробуйте ещё раз.',
          );
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Управление пользователями">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative z-10 w-full max-w-[560px] rounded-[20px] flex flex-col max-h-[80dvh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-5 rounded-full bg-primary shadow-[0_0_10px_2px_hsl(var(--primary)/0.5)]" />
            <p className="text-[13px] font-bold tracking-tight text-foreground">Пользователи и должности</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="press-sm w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Обновить список"
            >
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="press-sm w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Закрыть"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <RefreshCw size={18} className="animate-spin" />
              <span className="text-xs">Загружаем пользователей...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Не удалось загрузить список пользователей.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {(users ?? []).map((member) => {
                const isSelf = member.clerkUserId === currentUserId;
                return (
                  <li
                    key={member.clerkUserId}
                    className="glass rounded-[14px] px-3.5 py-3 flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <RoleIcon role={member.role} />
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-[12px] font-semibold text-foreground truncate">
                        {member.displayName || member.email || member.clerkUserId}
                        {isSelf && <span className="text-muted-foreground font-normal"> (вы)</span>}
                      </p>
                      {member.email && member.displayName && (
                        <p className="text-[10px] text-muted-foreground truncate">{member.email}</p>
                      )}
                      {member.mangoMemberName && (
                        <p className="text-[10px] text-muted-foreground/70 truncate">Mango: {member.mangoMemberName}</p>
                      )}
                    </div>
                    <select
                      value={member.role}
                      disabled={isSelf || updateRole.isPending}
                      onChange={(e) => handleRoleChange(member, e.target.value as TeamRole)}
                      aria-label={`Должность: ${member.displayName || member.email || member.clerkUserId}`}
                      className="bg-white/[0.05] border border-white/[0.08] rounded-full text-[10px] font-bold uppercase tracking-[0.1em] text-foreground px-2.5 h-8 outline-none focus:border-primary/60 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="bg-[#1a1a1a]">
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          )}
          {actionError && (
            <p className="mt-3 text-center text-[11px] text-destructive">{actionError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
