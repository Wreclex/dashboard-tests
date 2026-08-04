import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Settings, LogIn, Cookie, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useGetMoizvonkiStatus,
  usePutMoizvonkiSession,
  usePutMoizvonkiCredentials,
  useDeleteMoizvonkiConnection,
  useGetMoizvonkiSettings,
  usePutMoizvonkiSettings,
  getGetMoizvonkiStatusQueryKey,
  getGetMoizvonkiMetricsQueryKey,
  getGetMoizvonkiHistoryQueryKey,
  getGetMoizvonkiSettingsQueryKey,
} from '@workspace/api-client-react';

const sessionSchema = z.object({
  cookies: z.string().min(1, 'Обязательное поле'),
  reportUrl: z.string().url('Введите корректный URL').min(1, 'Обязательное поле'),
});

const credentialsSchema = z.object({
  login: z.string().min(1, 'Обязательное поле'),
  password: z.string().min(1, 'Обязательное поле'),
});

const settingsSchema = z.object({
  shiftHours: z.coerce.number().min(0.5).max(24),
  refreshIntervalMinutes: z.coerce.number().min(1).max(240),
});

export function ConnectionSettings({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useGetMoizvonkiStatus({ query: { queryKey: getGetMoizvonkiStatusQueryKey() } });
  const { data: settings } = useGetMoizvonkiSettings({ query: { queryKey: getGetMoizvonkiSettingsQueryKey() } });

  const putSession = usePutMoizvonkiSession();
  const putCredentials = usePutMoizvonkiCredentials();
  const deleteConnection = useDeleteMoizvonkiConnection();
  const putSettings = usePutMoizvonkiSettings();

  const sessionForm = useForm({
    resolver: zodResolver(sessionSchema),
    defaultValues: { cookies: '', reportUrl: '' },
  });

  const credentialsForm = useForm({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { login: '', password: '' },
  });

  const settingsForm = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: { shiftHours: 9.5, refreshIntervalMinutes: 15 },
  });

  useEffect(() => {
    if (settings) {
      settingsForm.reset({
        shiftHours: settings.shiftHours,
        refreshIntervalMinutes: settings.refreshIntervalMinutes,
      });
    }
  }, [settings, settingsForm]);

  const onSessionSubmit = (data: z.infer<typeof sessionSchema>) => {
    putSession.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Подключение сохранено', description: 'Данные сессии успешно обновлены.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiHistoryQueryKey() });
      },
      onError: () => toast({ title: 'Ошибка', description: 'Не удалось сохранить сессию.', variant: 'destructive' })
    });
  };

  const onCredentialsSubmit = (data: z.infer<typeof credentialsSchema>) => {
    putCredentials.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Данные сохранены', description: 'Учетные данные успешно обновлены.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiHistoryQueryKey() });
      },
      onError: () => toast({ title: 'Ошибка', description: 'Не удалось сохранить учетные данные.', variant: 'destructive' })
    });
  };

  const onSettingsSubmit = (data: z.infer<typeof settingsSchema>) => {
    putSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Настройки сохранены' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiHistoryQueryKey() });
      },
      onError: () => toast({ title: 'Ошибка', description: 'Не удалось сохранить настройки.', variant: 'destructive' })
    });
  };

  const handleDisconnect = () => {
    deleteConnection.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Отключено', description: 'Подключение удалено.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiHistoryQueryKey() });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-open-settings">
          <Settings className="w-4 h-4" />
          Настройки
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Настройки подключения</DialogTitle>
          <DialogDescription>
            Настройте интеграцию с системой «Мои Звонки» для автоматического сбора данных.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {statusLoading ? (
            <div className="flex justify-center p-4"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Статус:</span>
                    {status?.isConfigured ? (
                      <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-500 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        Подключено
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                        <AlertCircle className="w-4 h-4" />
                        Не настроено
                      </span>
                    )}
                  </div>
                  {status?.isConfigured && (
                    <div className="text-xs text-muted-foreground">
                      Метод: {status.hasCookies ? 'Сессия (Cookies)' : 'Учетные данные'} 
                      {status.lastSource && ` • Посл. источник: ${status.lastSource}`}
                    </div>
                  )}
                  {status?.lastError && (
                    <div className="text-xs text-destructive mt-1">
                      Ошибка: {status.lastError}
                    </div>
                  )}
                </div>
                {status?.isConfigured && (
                  <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={deleteConnection.isPending} data-testid="button-disconnect">
                    Отключить
                  </Button>
                )}
              </div>

              <Tabs defaultValue="session" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="session" className="gap-2"><Cookie className="w-4 h-4" /> Сессия</TabsTrigger>
                  <TabsTrigger value="credentials" className="gap-2"><LogIn className="w-4 h-4" /> Логин</TabsTrigger>
                  <TabsTrigger value="preferences" className="gap-2"><Settings className="w-4 h-4" /> Параметры</TabsTrigger>
                </TabsList>
                
                <TabsContent value="session" className="pt-4 space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Настройка через сессию</AlertTitle>
                    <AlertDescription className="text-xs mt-1 leading-relaxed">
                      Авторизуйтесь в «Мои Звонки» в браузере. Откройте DevTools (F12) → Network, найдите запрос отчета и скопируйте значения <code>Cookie</code> и <code>Request URL</code>. Это самый надежный метод.
                    </AlertDescription>
                  </Alert>

                  <Form {...sessionForm}>
                    <form onSubmit={sessionForm.handleSubmit(onSessionSubmit)} className="space-y-4">
                      <FormField
                        control={sessionForm.control}
                        name="reportUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>URL отчета</FormLabel>
                            <FormControl>
                              <Input placeholder="https://moizvonki.ru/api/v1/..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={sessionForm.control}
                        name="cookies"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Заголовок Cookie</FormLabel>
                            <FormControl>
                              <Input placeholder="session_id=..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={putSession.isPending} className="w-full" data-testid="button-save-session">
                        {putSession.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Сохранить сессию
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="credentials" className="pt-4 space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Вход по паролю</AlertTitle>
                    <AlertDescription className="text-xs mt-1 leading-relaxed">
                      Укажите ваши логин и пароль от «Мои Звонки». Система попытается автоматически авторизоваться через браузер в фоне.
                    </AlertDescription>
                  </Alert>

                  <Form {...credentialsForm}>
                    <form onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)} className="space-y-4">
                      <FormField
                        control={credentialsForm.control}
                        name="login"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Логин (Email)</FormLabel>
                            <FormControl>
                              <Input placeholder="manager@company.ru" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={credentialsForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Пароль</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={putCredentials.isPending} className="w-full" data-testid="button-save-credentials">
                        {putCredentials.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Сохранить учетные данные
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="preferences" className="pt-4">
                  <Form {...settingsForm}>
                    <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-4">
                      <FormField
                        control={settingsForm.control}
                        name="shiftHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Продолжительность смены (часы)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.5" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={settingsForm.control}
                        name="refreshIntervalMinutes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Интервал автообновления (минуты)</FormLabel>
                            <FormControl>
                              <Input type="number" step="1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={putSettings.isPending} className="w-full" data-testid="button-save-settings">
                        {putSettings.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Сохранить параметры
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
