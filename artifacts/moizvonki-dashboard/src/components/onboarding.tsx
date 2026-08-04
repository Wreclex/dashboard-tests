import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Radio, RefreshCw, UserCheck, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useGetMoizvonkiMangoOperators,
  useClaimMoizvonkiOperator,
  getGetMeQueryKey,
  getGetMoizvonkiMangoOperatorsQueryKey,
} from '@workspace/api-client-react';

/**
 * First-login onboarding: the user picks THEMSELVES from the Mango operator
 * list (binds clerk user ↔ mango member) so their personal KPI can be scoped
 * out of the shared Mango connection. Skippable — the Мои Звонки part of the
 * dashboard works without a Mango binding.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const { data: operators, isLoading, isFetching, error, refetch } = useGetMoizvonkiMangoOperators({
    query: { queryKey: getGetMoizvonkiMangoOperatorsQueryKey(), retry: false },
  });
  const claim = useClaimMoizvonkiOperator();

  const errorStatus = (error as any)?.response?.status;
  const mangoNotConfigured = errorStatus === 404;
  // 502 = the shared connection exists but Mango has not answered yet. The
  // server keeps refreshing in the background, so retrying actually helps.
  const mangoStillLoading = errorStatus === 502;

  const handleClaim = (memberId: number, memberName: string) => {
    setClaimingId(memberId);
    claim.mutate(
      { data: { mangoMemberId: memberId, mangoMemberName: memberName } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          onDone();
        },
        onError: () => {
          setClaimingId(null);
          toast({ title: 'Ошибка', description: 'Не удалось сохранить выбор оператора.', variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-6 text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
          <Radio className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Кто вы в Mango Office?</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
            Выберите себя из списка операторов — так дашборд покажет именно ваши звонки и трафик из общего подключения Mango.
          </p>
        </div>

        <Card className="text-left">
          <CardContent className="p-4 max-h-[320px] overflow-y-auto">
            {isLoading ? (
              <div className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin" />
                <p className="text-sm">Загружаем список операторов из Mango...</p>
              </div>
            ) : mangoNotConfigured ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Общее подключение Mango ещё не настроено. Попросите руководителя или администратора подключить Mango Office.
                </p>
              </div>
            ) : mangoStillLoading ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <RefreshCw className={`w-6 h-6 text-muted-foreground ${isFetching ? 'animate-spin' : ''}`} />
                <p className="text-sm text-muted-foreground">
                  Список операторов ещё собирается из Mango — это может занять до минуты.
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  Обновить
                </Button>
              </div>
            ) : error ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
                <p className="text-sm text-muted-foreground">Не удалось получить список операторов.</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>Повторить</Button>
              </div>
            ) : (operators ?? []).length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  В группе Mango пока нет операторов. Обратитесь к руководителю.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {(operators ?? []).map((op) => (
                  <li key={op.memberId} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-sm">{op.memberName}</p>
                      <p className="text-xs text-muted-foreground">Оператор Mango Office</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={claimingId !== null}
                      onClick={() => handleClaim(op.memberId, op.memberName)}
                    >
                      {claimingId === op.memberId ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      Это я
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <button
          onClick={onDone}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Пропустить — выбрать позже
        </button>
      </div>
    </div>
  );
}
