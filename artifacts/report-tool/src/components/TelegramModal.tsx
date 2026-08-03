import React, { useState } from 'react';
import { X, Plus, Trash2, Send, Edit2, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListTelegramChannels,
  getListTelegramChannelsQueryKey,
  useCreateTelegramChannel,
  useUpdateTelegramChannel,
  useDeleteTelegramChannel,
  useSendTelegramMessage,
} from '@workspace/api-client-react';
import { Show } from '@clerk/react';

interface Props {
  open: boolean;
  onClose: () => void;
  previewText: string;
}

type Mode = 'list' | 'add' | 'edit';

interface ChannelItem {
  id: number;
  name: string;
  chatId: string;
  createdAt: string;
}

export default function TelegramModal({ open, onClose, previewText }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('list');
  const [editingChannel, setEditingChannel] = useState<ChannelItem | null>(null);
  const [form, setForm] = useState({ name: '', chatId: '', botToken: '' });
  const [sendStatus, setSendStatus] = useState<Record<number, 'idle' | 'sending' | 'ok' | 'err'>>({});

  const { data: channels = [], isLoading } = useListTelegramChannels({
    query: { enabled: open, queryKey: getListTelegramChannelsQueryKey() },
  });

  const createChannel = useCreateTelegramChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTelegramChannelsQueryKey() });
        setMode('list');
      },
    },
  });

  const updateChannel = useUpdateTelegramChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTelegramChannelsQueryKey() });
        setMode('list');
      },
    },
  });

  const deleteChannel = useDeleteTelegramChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTelegramChannelsQueryKey() });
      },
    },
  });

  const sendMessage = useSendTelegramMessage();

  if (!open) return null;

  const openAdd = () => {
    setForm({ name: '', chatId: '', botToken: '' });
    setMode('add');
  };

  const openEdit = (ch: ChannelItem) => {
    setEditingChannel(ch);
    setForm({ name: ch.name, chatId: ch.chatId, botToken: '' });
    setMode('edit');
  };

  const handleSaveChannel = () => {
    if (!form.name.trim() || !form.chatId.trim()) return;
    if (mode === 'add') {
      if (!form.botToken.trim()) return;
      createChannel.mutate({
        data: { name: form.name.trim(), chatId: form.chatId.trim(), botToken: form.botToken.trim() },
      });
    } else if (mode === 'edit' && editingChannel) {
      const update: { name?: string; chatId?: string; botToken?: string } = {
        name: form.name.trim(),
        chatId: form.chatId.trim(),
      };
      if (form.botToken.trim()) update.botToken = form.botToken.trim();
      updateChannel.mutate({ id: editingChannel.id, data: update });
    }
  };

  const handleDelete = (id: number) => {
    deleteChannel.mutate({ id });
  };

  const handleSend = async (channelId: number) => {
    setSendStatus(prev => ({ ...prev, [channelId]: 'sending' }));
    sendMessage.mutate(
      { data: { channelId, text: previewText } },
      {
        onSuccess: () => {
          setSendStatus(prev => ({ ...prev, [channelId]: 'ok' }));
          setTimeout(() => setSendStatus(prev => ({ ...prev, [channelId]: 'idle' })), 2000);
        },
        onError: () => {
          setSendStatus(prev => ({ ...prev, [channelId]: 'err' }));
          setTimeout(() => setSendStatus(prev => ({ ...prev, [channelId]: 'idle' })), 2000);
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-card border border-border w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">
            {mode === 'list' ? 'Telegram' : mode === 'add' ? 'Добавить канал' : 'Редактировать канал'}
          </span>
          <button
            onClick={mode === 'list' ? onClose : () => setMode('list')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Must be signed in to use */}
        <Show when="signed-out">
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              Войдите, чтобы управлять каналами
            </p>
          </div>
        </Show>

        <Show when="signed-in">
          <>
            {mode === 'list' && (
              <>
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {isLoading && (
                    <div className="px-4 py-6 text-center text-muted-foreground text-xs uppercase tracking-widest">
                      Загрузка...
                    </div>
                  )}
                  {!isLoading && channels.length === 0 && (
                    <div className="px-4 py-6 text-center text-muted-foreground text-xs uppercase tracking-widest">
                      Каналы не настроены
                    </div>
                  )}
                  {channels.map((ch) => {
                    const st = sendStatus[ch.id] ?? 'idle';
                    return (
                      <div key={ch.id} className="flex items-center justify-between px-4 py-3 gap-2">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm text-foreground truncate">{ch.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{ch.chatId}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openEdit(ch)}
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(ch.id)}
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                          <button
                            onClick={() => handleSend(ch.id)}
                            disabled={st === 'sending'}
                            className={`w-7 h-7 flex items-center justify-center transition-colors ${
                              st === 'ok'
                                ? 'text-green-500'
                                : st === 'err'
                                ? 'text-destructive'
                                : 'text-primary hover:text-primary/80'
                            }`}
                          >
                            {st === 'ok' ? (
                              <Check size={12} />
                            ) : st === 'sending' ? (
                              <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Send size={12} />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 border-t border-border">
                  <button
                    onClick={openAdd}
                    className="w-full h-9 border border-border text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={12} />
                    Добавить канал
                  </button>
                </div>
              </>
            )}

            {(mode === 'add' || mode === 'edit') && (
              <div className="p-4 flex flex-col gap-3">
                <TgField
                  label="Название"
                  value={form.name}
                  onChange={v => setForm(f => ({ ...f, name: v }))}
                  placeholder="Мой канал"
                />
                <TgField
                  label="Chat ID"
                  value={form.chatId}
                  onChange={v => setForm(f => ({ ...f, chatId: v }))}
                  placeholder="-100123456789"
                />
                <TgField
                  label={mode === 'edit' ? 'Bot Token (оставьте пустым, чтобы не менять)' : 'Bot Token'}
                  value={form.botToken}
                  onChange={v => setForm(f => ({ ...f, botToken: v }))}
                  placeholder={mode === 'edit' ? '••••••••' : '1234:abc...'}
                  isSecret
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setMode('list')}
                    className="flex-1 h-9 border border-border text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSaveChannel}
                    disabled={createChannel.isPending || updateChannel.isPending}
                    className="flex-1 h-9 bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {createChannel.isPending || updateChannel.isPending ? '...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            )}
          </>
        </Show>
      </div>
    </div>
  );
}

function TgField({
  label, value, onChange, placeholder, isSecret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  isSecret?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        type={isSecret ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={isSecret ? 'new-password' : undefined}
        className="h-9 bg-input border border-border text-foreground text-sm px-3 outline-none font-mono placeholder:text-muted-foreground/50 focus:border-primary/50 transition-colors"
      />
    </div>
  );
}
