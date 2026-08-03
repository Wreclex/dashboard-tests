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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      <div className="relative z-10 glass rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden">
        <div className="absolute -top-24 -left-24 w-56 h-56 rounded-full opacity-25 pointer-events-none"
          style={{ background: 'radial-gradient(circle, hsl(210 80% 60% / 0.5), transparent)' }} />
        <div className="relative flex items-center justify-between px-5 py-4">
          <span className="text-sm font-bold tracking-tight text-foreground">
            {mode === 'list' ? 'Telegram' : mode === 'add' ? 'Добавить канал' : 'Редактировать канал'}
          </span>
          <button
            onClick={mode === 'list' ? onClose : () => setMode('list')}
            className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-white/[0.1] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <Show when="signed-out">
          <div className="relative px-5 py-10 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
              Войдите, чтобы управлять каналами
            </p>
          </div>
        </Show>

        <Show when="signed-in">
          <>
            {mode === 'list' && (
              <>
                <div className="relative flex flex-col max-h-72 overflow-y-auto px-3 pb-1">
                  {isLoading && (
                    <div className="px-3 py-8 text-center text-muted-foreground text-xs uppercase tracking-[0.16em]">
                      Загрузка...
                    </div>
                  )}
                  {!isLoading && channels.length === 0 && (
                    <div className="px-3 py-8 text-center text-muted-foreground text-xs uppercase tracking-[0.16em]">
                      Каналы не настроены
                    </div>
                  )}
                  {channels.map((ch, idx) => {
                    const st = sendStatus[ch.id] ?? 'idle';
                    return (
                      <div key={ch.id}
                        className={`flex items-center justify-between px-3 py-3 gap-2 rounded-2xl transition-colors hover:bg-white/[0.04] ${idx === channels.length - 1 ? '' : 'mb-1'}`}>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground truncate">{ch.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{ch.chatId}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => openEdit(ch)}
                            className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-white/[0.08] transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(ch.id)}
                            className="press-sm w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.04] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            onClick={() => handleSend(ch.id)}
                            disabled={st === 'sending'}
                            className={`press-spring w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                              st === 'ok'
                                ? 'bg-green-500/15 text-green-400'
                                : st === 'err'
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-primary/15 text-primary hover:bg-primary/25'
                            }`}
                          >
                            {st === 'ok' ? (
                              <Check size={13} />
                            ) : st === 'sending' ? (
                              <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Send size={13} />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="relative p-4 pt-3">
                  <button
                    onClick={openAdd}
                    className="press-sm w-full h-11 rounded-full bg-white/[0.05] border border-white/[0.06] text-[12px] font-semibold text-foreground hover:bg-white/[0.08] transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={14} />
                    Добавить канал
                  </button>
                </div>
              </>
            )}

            {(mode === 'add' || mode === 'edit') && (
              <div className="relative p-5 flex flex-col gap-3">
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
                <div className="flex gap-2.5 pt-2">
                  <button
                    onClick={() => setMode('list')}
                    className="press-sm flex-1 h-11 rounded-full bg-white/[0.05] text-[12px] font-semibold text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSaveChannel}
                    disabled={createChannel.isPending || updateChannel.isPending}
                    className="press-spring flex-1 h-11 rounded-full text-[12px] font-bold text-primary-foreground transition-shadow hover:shadow-[0_8px_24px_hsl(var(--primary)/0.4)] disabled:opacity-40"
                    style={{ background: 'linear-gradient(180deg, hsl(22 100% 56%), hsl(22 100% 44%))' }}
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
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-1">
        {label}
      </label>
      <input
        type={isSecret ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={isSecret ? 'new-password' : undefined}
        className="h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-foreground text-sm px-4 outline-none font-mono placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-white/[0.06] transition-colors"
      />
    </div>
  );
}
