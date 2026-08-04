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
import { Settings, LogIn, Cookie, AlertCircle, CheckCircle2, RefreshCw, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useGetMoizvonkiStatus,
  usePutMoizvonkiSession,
  usePutMoizvonkiCredentials,
  useDeleteMoizvonkiConnection,
  useGetMoizvonkiSettings,
  usePutMoizvonkiSettings,
  useGetMoizvonkiMangoStatus,
  usePutMoizvonkiMangoCredentials,
  useDeleteMoizvonkiMangoCredentials,
  getGetMoizvonkiStatusQueryKey,
  getGetMoizvonkiMetricsQueryKey,
  getGetMoizvonkiHistoryQueryKey,
  getGetMoizvonkiSettingsQueryKey,
  getGetMoizvonkiMangoStatusQueryKey,
  getGetMoizvonkiMangoKpiQueryKey,
} from '@workspace/api-client-react';

const sessionSchema = z.object({
  cookies: z.string().min(1, 'Обязательное поле'),
  reportUrl: z.string().url('Введите корректный URL').min(1, 'Обязательное поле'),
});

const credentialsSchema = z.object({
  login: z.string().min(1, 'Обязательное поле'),
  password: z.string().min(1, 'Обязательное поле'),
});

const mangoCredentialsSchema = z.object({
  email: z.string().email('Введите корректный email').min(1, 'Обязательное поле'),
  password: z.string().min(1, 'Обязательное поле'),
});

const settingsSchema = z.object({
  shiftHours: z.coerce.number().min(0.5).max(24),
  refreshIntervalMinutes: z.coerce.number().min(1).max(240),
});

export function ConnectionSettings({
  open,
  onOpenChange,
  defaultTab = 'mz',
  role = 'employee'
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultTab?: string;
  role?: 'admin' | 'manager' | 'employee';
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManageMango = role === 'admin' || role === 'manager';
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Sync tab when prop changes (never land an employee on the Mango tab)
  useEffect(() => {
    if (open) setActiveTab(defaultTab === 'mango' && !canManageMango ? 'mz' : defaultTab);
  }, [open, defaultTab, canManageMango]);

  const { data: statusMz, isLoading: statusMzLoading } = useGetMoizvonkiStatus({ query: { queryKey: getGetMoizvonkiStatusQueryKey() } });
  const { data: statusMango, isLoading: statusMangoLoading } = useGetMoizvonkiMangoStatus({ query: { queryKey: getGetMoizvonkiMangoStatusQueryKey() } });
  const { data: settings } = useGetMoizvonkiSettings({ query: { queryKey: getGetMoizvonkiSettingsQueryKey() } });

  const putSession = usePutMoizvonkiSession();
  const putCredentials = usePutMoizvonkiCredentials();
  const deleteConnection = useDeleteMoizvonkiConnection();
  
  const putMangoCredentials = usePutMoizvonkiMangoCredentials();
  const deleteMangoCredentials = useDeleteMoizvonkiMangoCredentials();
  
  const putSettings = usePutMoizvonkiSettings();

  const sessionForm = useForm({
    resolver: zodResolver(sessionSchema),
    defaultValues: { cookies: '', reportUrl: '' },
  });

  const credentialsForm = useForm({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { login: '', password: '' },
  });

  const mangoForm = useForm({
    resolver: zodResolver(mangoCredentialsSchema),
    defaultValues: { email: '', password: '' },
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
        toast({ title: 'Подключение сохранено', description: 'Данные сессии Мои Звонки обновлены.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
      },
      onError: () => toast({ title: 'Ошибка', description: 'Не удалось сохранить сессию Мои Звонки.', variant: 'destructive' })
    });
  };

  const onCredentialsSubmit = (data: z.infer<typeof credentialsSchema>) => {
    putCredentials.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Данные сохранены', description: 'Учетные данные Мои Звонки обновлены.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
      },
      onError: () => toast({ title: 'Ошибка', description: 'Не удалось сохранить учетные данные Мои Звонки.', variant: 'destructive' })
    });
  };

  const onMangoSubmit = (data: z.infer<typeof mangoCredentialsSchema>) => {
    putMangoCredentials.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Mango подключен', description: 'Учетные данные проверены и сохранены.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMangoStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMangoKpiQueryKey() });
      },
      onError: (err: any) => {
        const msg = err?.response?.status === 401 ? 'Неверный логин или пароль.' : 'Сбой проверки. Попробуйте позже.';
        toast({ title: 'Ошибка подключения Mango', description: msg, variant: 'destructive' });
      }
    });
  };

  const onSettingsSubmit = (data: z.infer<typeof settingsSchema>) => {
    putSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Настройки сохранены' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMangoKpiQueryKey() });
      },
      onError: () => toast({ title: 'Ошибка', description: 'Не удалось сохранить настройки.', variant: 'destructive' })
    });
  };

  const handleDisconnectMz = () => {
    deleteConnection.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Отключено', description: 'Подключение к Мои Звонки удалено.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
      }
    });
  };

  const handleDisconnectMango = () => {
    deleteMangoCredentials.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Отключено', description: 'Подключение к Mango Office удалено.' });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMangoStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMangoKpiQueryKey() });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Настройки дашборда</DialogTitle>
          <DialogDescription>
            Управляйте подключениями к телефониям и общими параметрами.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-2">
          <TabsList className={`grid w-full ${canManageMango ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="mz" className="gap-1.5"><Phone className="w-4 h-4" /> Мои Звонки</TabsTrigger>
            {canManageMango && (
              <TabsTrigger value="mango" className="gap-1.5"><Phone className="w-4 h-4 text-teal-600" /> Mango</TabsTrigger>
            )}
            <TabsTrigger value="settings" className="gap-1.5"><Settings className="w-4 h-4" /> Общие</TabsTrigger>
          </TabsList>
          
          <div className="py-4 min-h-[350px]">
            {/* Мои Звонки */}
            <TabsContent value="mz" className="m-0 space-y-4">
              {statusMzLoading ? (
                <div className="flex justify-center p-4"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Статус:</span>
                        {statusMz?.isConfigured ? (
                          <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Подключено
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                            <AlertCircle className="w-4 h-4" /> Не настроено
                          </span>
                        )}
                      </div>
                      {statusMz?.isConfigured && (
                        <div className="text-xs text-muted-foreground">
                          Метод: {statusMz.hasCookies ? 'Сессия (Cookies)' : 'Учетные данные'} 
                          {statusMz.lastSource && ` • Источник: ${statusMz.lastSource}`}
                        </div>
                      )}
                      {statusMz?.lastError && (
                        <div className="text-xs text-destructive mt-1">Ошибка: {statusMz.lastError}</div>
                      )}
                    </div>
                    {statusMz?.isConfigured && (
                      <Button variant="destructive" size="sm" onClick={handleDisconnectMz} disabled={deleteConnection.isPending}>
                        Отключить
                      </Button>
                    )}
                  </div>

                  <Tabs defaultValue="session" className="w-full border rounded-lg overflow-hidden">
                    <TabsList className="w-full flex justify-start rounded-none border-b bg-transparent p-0">
                      <TabsTrigger value="session" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"><Cookie className="w-4 h-4 mr-2" /> Сессия (Надёжно)</TabsTrigger>
                      <TabsTrigger value="credentials" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"><LogIn className="w-4 h-4 mr-2" /> Логин / Пароль</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="session" className="p-4 m-0 space-y-4 bg-card">
                      <Form {...sessionForm}>
                        <form onSubmit={sessionForm.handleSubmit(onSessionSubmit)} className="space-y-4">
                          <FormField
                            control={sessionForm.control}
                            name="reportUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>URL отчета</FormLabel>
                                <FormControl><Input placeholder="https://moizvonki.ru/api/v1/..." {...field} /></FormControl>
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
                                <FormControl><Input placeholder="session_id=..." {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button type="submit" disabled={putSession.isPending} className="w-full">
                            {putSession.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                            Сохранить сессию
                          </Button>
                        </form>
                      </Form>
                    </TabsContent>

                    <TabsContent value="credentials" className="p-4 m-0 space-y-4 bg-card">
                      <Form {...credentialsForm}>
                        <form onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)} className="space-y-4">
                          <FormField
                            control={credentialsForm.control}
                            name="login"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Логин (Email)</FormLabel>
                                <FormControl><Input placeholder="manager@company.ru" {...field} /></FormControl>
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
                                <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button type="submit" disabled={putCredentials.isPending} className="w-full">
                            {putCredentials.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                            Сохранить учетные данные
                          </Button>
                        </form>
                      </Form>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </TabsContent>

            {/* Mango Office — shared connection, manager/admin only */}
            {canManageMango && (
            <TabsContent value="mango" className="m-0 space-y-4">
              {statusMangoLoading ? (
                <div className="flex justify-center p-4"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 bg-teal-500/5 dark:bg-teal-900/10 rounded-lg border border-teal-500/20">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Статус:</span>
                        {statusMango?.isConnected ? (
                          <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Подключено
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                            <AlertCircle className="w-4 h-4" /> Не настроено
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Интеграция с личным кабинетом Mango Office (lk.mango-office.ru)
                      </div>
                    </div>
                    {statusMango?.isConnected && (
                      <Button variant="destructive" size="sm" onClick={handleDisconnectMango} disabled={deleteMangoCredentials.isPending}>
                        Отключить
                      </Button>
                    )}
                  </div>

                  <Alert className="border-teal-500/30 bg-teal-500/5 text-teal-900 dark:text-teal-200">
                    <AlertCircle className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    <AlertTitle className="text-teal-800 dark:text-teal-300">Авторизация Mango</AlertTitle>
                    <AlertDescription className="text-xs mt-1 leading-relaxed opacity-90">
                      Укажите email и пароль. Проверка может занять до 60 секунд. Дашборд будет получать живые данные о ваших звонках.
                    </AlertDescription>
                  </Alert>

                  <Form {...mangoForm}>
                    <form onSubmit={mangoForm.handleSubmit(onMangoSubmit)} className="space-y-4">
                      <FormField
                        control={mangoForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email (Логин Mango)</FormLabel>
                            <FormControl><Input placeholder="manager@company.ru" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={mangoForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Пароль</FormLabel>
                            <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={putMangoCredentials.isPending} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                        {putMangoCredentials.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                        {putMangoCredentials.isPending ? 'Проверка...' : 'Подключить Mango'}
                      </Button>
                    </form>
                  </Form>
                </>
              )}
            </TabsContent>
            )}

            {/* Общие настройки */}
            <TabsContent value="settings" className="m-0 pt-2">
              <Form {...settingsForm}>
                <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-4">
                  <FormField
                    control={settingsForm.control}
                    name="shiftHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Продолжительность смены (часы)</FormLabel>
                        <FormControl><Input type="number" step="0.5" {...field} /></FormControl>
                        <DialogDescription className="text-[11px] mt-1">
                          Используется для расчёта плотности работы (звонки в час).
                        </DialogDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={settingsForm.control}
                    name="refreshIntervalMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Интервал фонового автообновления (мин)</FormLabel>
                        <FormControl><Input type="number" step="1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={putSettings.isPending} className="w-full">
                    {putSettings.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                    Сохранить параметры
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
