import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { useGetMoizvonkiHistory, getGetMoizvonkiHistoryQueryKey } from '@workspace/api-client-react';

export function MetricsChart() {
  const [metricType, setMetricType] = useState<'calls' | 'density'>('calls');
  
  const { data: history, isLoading } = useGetMoizvonkiHistory({ 
    query: { queryKey: getGetMoizvonkiHistoryQueryKey() } 
  });

  const chartData = useMemo(() => {
    if (!history) return [];
    
    // Reverse to show chronological order (assuming API returns descending or we want ascending)
    // Actually API usually returns desc, let's sort by date asc
    return [...history].sort((a, b) => {
      // Simple date sort assuming DD.MM.YYYY
      const [d1, m1, y1] = a.date.split('.');
      const [d2, m2, y2] = b.date.split('.');
      return new Date(`${y1}-${m1}-${d1}`).getTime() - new Date(`${y2}-${m2}-${d2}`).getTime();
    }).map(item => ({
      ...item,
      // Short date for x-axis
      shortDate: item.date.split('.').slice(0, 2).join('.'),
      // Convert traffic to hours for better chart reading if needed, or keep seconds
      trafficHours: (item.trafficSeconds / 3600).toFixed(1)
    }));
  }, [history]);

  if (isLoading) {
    return (
      <Card className="h-[400px] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-2 text-muted-foreground">
          <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <span className="text-sm">Загрузка истории...</span>
        </div>
      </Card>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <Card className="h-[400px] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Нет данных за последние 30 дней</p>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold">Тренды за 30 дней</CardTitle>
          <CardDescription>Динамика активности по дням</CardDescription>
        </div>
        <div className="flex bg-muted/50 p-1 rounded-md border">
          <Button 
            variant={metricType === 'calls' ? 'secondary' : 'ghost'} 
            size="sm" 
            className="h-7 text-xs px-3 shadow-none"
            onClick={() => setMetricType('calls')}
          >
            Звонки & Трафик
          </Button>
          <Button 
            variant={metricType === 'density' ? 'secondary' : 'ghost'} 
            size="sm" 
            className="h-7 text-xs px-3 shadow-none"
            onClick={() => setMetricType('density')}
          >
            Плотность
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6 pl-2 pr-6 h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          {metricType === 'calls' ? (
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="shortDate" 
                tickLine={false} 
                axisLine={false} 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
                dy={10}
              />
              <YAxis 
                yAxisId="left"
                tickLine={false} 
                axisLine={false} 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tickLine={false} 
                axisLine={false} 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(val) => `${val}ч`}
              />
              <Tooltip 
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                formatter={(value: any, name: string) => [value, name === 'calls' ? 'Звонков' : 'Трафик (часы)']}
                labelFormatter={(label) => `Дата: ${label}`}
              />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
              <Bar yAxisId="left" dataKey="calls" name="Кол-во звонков" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line yAxisId="right" type="monotone" dataKey="trafficHours" name="Трафик (ч)" stroke="hsl(var(--chart-3))" strokeWidth={3} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="shortDate" 
                tickLine={false} 
                axisLine={false} 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
                dy={10}
              />
              <YAxis 
                tickLine={false} 
                axisLine={false} 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip 
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                formatter={(value: any) => [Number(value).toFixed(2), 'Плотность (зв/час)']}
                labelFormatter={(label) => `Дата: ${label}`}
              />
              <Bar dataKey="density" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
