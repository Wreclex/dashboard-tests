import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileUp, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUploadMoizvonkiCsv,
  getGetMoizvonkiMetricsQueryKey,
  getGetMoizvonkiHistoryQueryKey
} from '@workspace/api-client-react';

export function CsvUploadDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uploadCsv = useUploadMoizvonkiCsv();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      uploadCsv.mutate({ data: { csv: text } }, {
        onSuccess: () => {
          toast({ title: 'Файл загружен', description: 'Данные успешно обновлены из CSV.' });
          setOpen(false);
          setFile(null);
          queryClient.invalidateQueries({ queryKey: getGetMoizvonkiMetricsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMoizvonkiHistoryQueryKey() });
        },
        onError: (err: any) => {
          toast({ 
            title: 'Ошибка парсинга', 
            description: err?.response?.data?.message || 'Не удалось обработать CSV файл.', 
            variant: 'destructive' 
          });
        }
      });
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" data-testid="button-open-csv">
          <Upload className="w-4 h-4" />
          Загрузить CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Ручная загрузка CSV</DialogTitle>
          <DialogDescription>
            Если автоматический сбор не работает, скачайте отчет из «Мои Звонки» в формате CSV и загрузите его здесь.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6 space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center flex flex-col items-center justify-center bg-muted/20">
            <div className="bg-muted p-3 rounded-full mb-4">
              <FileUp className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">Выберите файл CSV</p>
            <p className="text-xs text-muted-foreground mb-4">Поддерживаются стандартные разделители</p>
            
            <input 
              type="file" 
              accept=".csv" 
              id="csv-upload" 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <label htmlFor="csv-upload">
              <Button asChild variant="outline" size="sm">
                <span>Обзор...</span>
              </Button>
            </label>
            
            {file && (
              <div className="mt-4 pt-4 border-t w-full">
                <p className="text-sm text-primary font-medium">{file.name}</p>
              </div>
            )}
          </div>
          
          <Button 
            className="w-full" 
            disabled={!file || uploadCsv.isPending} 
            onClick={handleUpload}
            data-testid="button-upload-csv"
          >
            {uploadCsv.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Обработать данные
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
