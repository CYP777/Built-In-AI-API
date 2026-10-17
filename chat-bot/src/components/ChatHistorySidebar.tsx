import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  History,
  SquarePen,
  Search,
  X,
  MessageSquare,
  Edit2,
  Trash2,
  Check,
  PanelLeftClose,
  PanelLeft,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { ChatSession } from '../types/chat-history';
import {
  getRelativeDateGroup,
  formatSessionTime,
} from '../services/chat-history-service';

interface ChatHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (session: ChatSession) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onClearAllSessions: () => void;
  onTogglePin?: () => void;
}

export const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onClearAllSessions,
  onTogglePin,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [sessionToDeleteId, setSessionToDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Target session selected for deletion
  const targetSession = useMemo(() => {
    if (!sessionToDeleteId) return null;
    return sessions.find((s) => s.id === sessionToDeleteId) || null;
  }, [sessions, sessionToDeleteId]);

  // Close delete modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sessionToDeleteId) setSessionToDeleteId(null);
        if (showClearConfirm) setShowClearConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionToDeleteId, showClearConfirm]);

  // Expanded state: true if pinned (isOpen) OR hovered
  const isExpanded = isOpen || isHovered;

  // Auto-focus input when entering rename mode
  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;

    return sessions.filter((s) => {
      const matchTitle = (s.title || '').toLowerCase().includes(q);
      const matchMessage = s.messages.some((m) =>
        (m.text || '').toLowerCase().includes(q)
      );
      return matchTitle || matchMessage;
    });
  }, [sessions, searchQuery]);

  // Group filtered sessions chronologically
  const groupedSessions = useMemo(() => {
    const groups: Record<string, ChatSession[]> = {};
    for (const session of filteredSessions) {
      const groupName = getRelativeDateGroup(session.updatedAt);
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(session);
    }
    return groups;
  }, [filteredSessions]);

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title || '');
    setSessionToDeleteId(null);
  };

  const handleSaveRename = (sessionId: string, e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (editingTitle.trim()) {
      onRenameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleCancelRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const handleDeleteClick = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDeleteId(sessionId);
    setEditingSessionId(null);
  };

  const handleConfirmDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteSession(sessionId);
    setSessionToDeleteId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDeleteId(null);
  };

  return (
    <>
      {/* Mobile Backdrop overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Desktop spacer in document flow to keep chat layout stable without jumping */}
      <div
        className={`hidden md:block shrink-0 transition-all duration-300 ease-in-out ${
          isOpen ? 'w-72 sm:w-80' : 'w-16'
        }`}
        aria-hidden="true"
      />

      {/* Instagram-style Hover Rail & Expandable Sidebar */}
      <aside
        id="chat-history-sidebar"
        aria-label="ประวัติการแชท"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200/80 bg-white/95 text-slate-800 backdrop-blur-md transition-all duration-300 ease-in-out will-change-[width,transform] ${
          isOpen
            ? 'w-72 sm:w-80 translate-x-0 shadow-xl md:shadow-none'
            : isHovered
            ? 'w-72 sm:w-80 translate-x-0 shadow-2xl'
            : '-translate-x-full md:translate-x-0 md:w-16 md:shadow-xs'
        }`}
      >
        {!isExpanded ? (
          <div className="hidden md:flex h-full w-16 flex-col items-center justify-start gap-2.5 py-3.5 select-none animate-in fade-in duration-150">
            {/* Pin/Toggle Sidebar Button */}
            <button
              type="button"
              onClick={() => {
                if (onTogglePin) onTogglePin();
                else setIsHovered(true);
              }}
              aria-label={isOpen ? 'พับเก็บแถบประวัติ' : 'เปิดและปักหมุดแถบประวัติ'}
              title={isOpen ? 'พับเก็บแถบประวัติ' : 'เปิดและปักหมุดแถบประวัติ'}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-emerald-700 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <PanelLeft className="h-4.5 w-4.5" />
            </button>

            <div className="w-8 h-px bg-slate-200/70 my-0.5" />

            {/* New Chat Icon Button */}
            <button
              type="button"
              onClick={onNewChat}
              aria-label="เริ่มบทสนทนาใหม่"
              title="เริ่มบทสนทนาใหม่"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-r from-emerald-600 via-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-950/20 hover:brightness-105 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <SquarePen className="h-4.5 w-4.5" />
            </button>

            {/* History Icon Button */}
            <button
              type="button"
              onClick={() => {
                if (onTogglePin) onTogglePin();
                else setIsHovered(true);
              }}
              aria-label={`ดูประวัติการแชททั้งหมด (${sessions.length} รายการ)`}
              title={`ดูประวัติการแชททั้งหมด (${sessions.length} รายการ)`}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <History className="h-4.5 w-4.5" />
              {sessions.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white shadow-2xs">
                  {sessions.length > 9 ? '9+' : sessions.length}
                </span>
              )}
            </button>

            {/* Search Icon Button */}
            <button
              type="button"
              onClick={() => {
                if (onTogglePin) onTogglePin();
                setIsHovered(true);
                setTimeout(() => searchInputRef.current?.focus(), 150);
              }}
              aria-label="ค้นหาประวัติการแชท"
              title="ค้นหาประวัติการแชท"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <Search className="h-4.5 w-4.5" />
            </button>
          </div>
        ) : (
          <div className="flex h-full w-72 sm:w-80 flex-col animate-in fade-in duration-150">
            {/* Header */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <History className="h-4.5 w-4.5 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-800">ประวัติการแชท</h2>
                {sessions.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {sessions.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Close / Collapse button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsHovered(false);
                    onClose();
                  }}
                  title="พับเก็บแถบประวัติ"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* New Chat Button & Search */}
            <div className="p-3 space-y-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() => {
                  onNewChat();
                  if (window.innerWidth < 768) {
                    onClose();
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-emerald-600 via-emerald-600 to-teal-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 hover:brightness-105 active:scale-98 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <SquarePen className="h-4 w-4" />
                <span>เริ่มการสนทนาใหม่</span>
              </button>

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาบทสนทนา..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-slate-400">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <p className="text-xs font-medium text-slate-700">
                    {searchQuery ? 'ไม่พบบทสนทนาที่ค้นหา' : 'ยังไม่มีประวัติการสนทนา'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 max-w-45 leading-relaxed">
                    {searchQuery
                      ? 'ลองค้นหาด้วยคำอื่น หรือกดล้างคำค้นหา'
                      : 'เมื่อเริ่มสนทนา ประวัติจะถูกบันทึกไว้ในเครื่องของคุณที่นี่อัตโนมัติ'}
                  </p>
                </div>
              ) : (
                Object.entries(groupedSessions).map(([groupTitle, sessionList]) => (
                  <div key={groupTitle} className="space-y-1">
                    <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {groupTitle}
                    </div>
                    {sessionList.map((session) => {
                      const isActive = session.id === currentSessionId;
                      const isEditing = session.id === editingSessionId;

                      return (
                        <div
                          key={session.id}
                          role="button"
                          tabIndex={0}
                          aria-current={isActive ? 'true' : undefined}
                          onClick={() => {
                            if (!isEditing) {
                              onSelectSession(session);
                              if (window.innerWidth < 768) {
                                onClose();
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
                              e.preventDefault();
                              onSelectSession(session);
                              if (window.innerWidth < 768) {
                                onClose();
                              }
                            }
                          }}
                          className={`group relative flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-950 font-semibold shadow-xs border border-emerald-300 ring-2 ring-emerald-500/10'
                              : 'text-slate-700 hover:bg-slate-100/90 hover:text-slate-900 border border-transparent'
                          }`}
                        >
                          {/* Session Content or Edit Mode */}
                          {isEditing ? (
                            <div
                              className="flex flex-1 items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(session.id, e);
                                  if (e.key === 'Escape') handleCancelRename(e as unknown as React.MouseEvent);
                                }}
                                className="w-full rounded-lg border border-emerald-400 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-hidden shadow-2xs"
                              />
                              <button
                                type="button"
                                onClick={(e) => handleSaveRename(session.id, e)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                                title="บันทึก"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelRename}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                                title="ยกเลิก"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <MessageSquare
                                  className={`h-3.5 w-3.5 shrink-0 ${
                                    isActive ? 'text-emerald-600' : 'text-slate-400'
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium leading-tight">
                                    {session.title || 'บทสนทนาไม่มีชื่อ'}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <span>{formatSessionTime(session.updatedAt)}</span>
                                    <span>•</span>
                                    <span>{session.messages.length} ข้อความ</span>
                                  </p>
                                </div>
                              </div>

                              {/* Action Buttons (Visible on hover, focus, or active) */}
                              <div
                                className={`flex items-center gap-1 shrink-0 ${
                                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                                } transition-opacity`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => handleStartRename(session, e)}
                                  aria-label={`เปลี่ยนชื่อหัวข้อ ${session.title || 'บทสนทนา'}`}
                                  title="เปลี่ยนชื่อหัวข้อ"
                                  className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-emerald-700 shadow-2xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteClick(session.id, e)}
                                  aria-label={`ลบประวัติ ${session.title || 'บทสนทนา'}`}
                                  title="ลบประวัตินี้"
                                  className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-rose-600 shadow-2xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))
            )}
          </div>

          {/* Footer: Clear All Button */}
          {sessions.length > 0 && (
            <div className="border-t border-slate-200/80 p-3 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                aria-label="ล้างประวัติการแชททั้งหมด"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                <span>ล้างประวัติการแชททั้งหมด</span>
              </button>
            </div>
          )}
        </div>
        )}
      </aside>

      {/* ============================================================ */}
      {/* CENTERED MODAL: Delete Single Chat Session                   */}
      {/* ============================================================ */}
      {targetSession && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-session-title"
          aria-describedby="delete-session-desc"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={handleCancelDelete}
        >
          <div
            className="relative w-full max-w-sm sm:max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-150 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={handleCancelDelete}
              aria-label="ปิดหน้าต่างยืนยัน"
              className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              title="ปิด"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              {/* Red Trash Icon Badge */}
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 text-rose-600 shadow-2xs mb-3">
                <Trash2 className="h-5 w-5 sm:h-6 sm:w-6 stroke-[1.75]" />
              </div>

              {/* Title */}
              <h3 id="delete-session-title" className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                ต้องการลบประวัติการสนทนานี้หรือไม่?
              </h3>

              <p id="delete-session-desc" className="mt-1.5 text-xs text-slate-500 max-w-xs leading-relaxed">
                ห้องสนทนาพร้อมข้อความทั้งหมดในเซสชันนี้จะถูกลบออกจากอุปกรณ์อย่างถาวร และไม่สามารถกู้คืนได้
              </p>

              {/* Chat Preview Card */}
              <div className="mt-4 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-left">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100/80 text-rose-700 mt-0.5">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-xs sm:text-sm text-slate-900 truncate leading-snug">
                      {targetSession.title || 'บทสนทนาไม่มีชื่อ'}
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatSessionTime(targetSession.updatedAt)}
                      </span>
                      <span>•</span>
                      <span>{targetSession.messages.length} ข้อความ</span>
                    </div>
                    {targetSession.messages.length > 0 && (
                      <p className="mt-2 text-[11px] text-slate-600 line-clamp-2 bg-white rounded-md p-2 border border-slate-200/60 leading-relaxed italic">
                        "{targetSession.messages[targetSession.messages.length - 1].text.substring(0, 100)}"
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex w-full gap-2.5">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 sm:py-2.5 px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 active:scale-98 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={(e) => handleConfirmDelete(targetSession.id, e)}
                  className="flex-1 rounded-xl bg-rose-600 py-2 sm:py-2.5 px-3 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 active:scale-98 transition flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>ลบห้องสนทนานี้</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* CENTERED MODAL: Clear All Sessions                           */}
      {/* ============================================================ */}
      {showClearConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-all-title"
          aria-describedby="clear-all-desc"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="relative w-full max-w-sm sm:max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-150 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              aria-label="ปิดหน้าต่างยืนยัน"
              className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              title="ปิด"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              {/* Warning Icon Badge */}
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 text-rose-600 shadow-2xs mb-3">
                <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 stroke-[1.75]" />
              </div>

              {/* Title */}
              <h3 id="clear-all-title" className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                ต้องการล้างประวัติการสนทนาทั้งหมดหรือไม่?
              </h3>

              <p id="clear-all-desc" className="mt-1.5 text-xs text-slate-500 max-w-xs leading-relaxed">
                ประวัติการสนทนาทั้งหมดจำนวน{' '}
                <span className="font-semibold text-rose-600">
                  {sessions.length} ห้องแชท
                </span>{' '}
                จะถูกลบออกจากเครื่องอย่างถาวร และไม่สามารถกู้คืนได้
              </p>

              {/* Action Buttons */}
              <div className="mt-5 flex w-full gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 sm:py-2.5 px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 active:scale-98 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllSessions();
                    setShowClearConfirm(false);
                  }}
                  className="flex-1 rounded-xl bg-rose-600 py-2 sm:py-2.5 px-3 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 active:scale-98 transition flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>ล้างประวัติทั้งหมด ({sessions.length} รายการ)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
