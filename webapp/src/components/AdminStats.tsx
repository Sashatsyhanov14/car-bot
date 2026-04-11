import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PAYOUT_PREFIX = 'PAYOUT_RECORD:';

const AdminStats: React.FC<{ t: any, isAdmin?: boolean }> = ({ t, isAdmin }) => {
    const [stats, setStats] = useState({ totalUsers: 0, totalRequests: 0, newRequests: 0, totalRevenue: 0 });
    const [referralRows, setReferralRows] = useState<any[]>([]);
    const [managers, setManagers] = useState<any[]>([]);
    
    const [newManagerId, setNewManagerId] = useState('');
    const [newManagerRole, setNewManagerRole] = useState<'manager' | 'admin'>('manager');
    const [newManagerNote, setNewManagerNote] = useState('');
    const [managerMsg, setManagerMsg] = useState('');
    const [loading, setLoading] = useState(true);
    const [payoutMsg, setPayoutMsg] = useState<{ [id: number]: string }>({});
    const [requests, setRequests] = useState<any[]>([]);
    const [reqLoading, setReqLoading] = useState(false);
    const [reqFilter, setReqFilter] = useState<'all'|'new'>('new');



    useEffect(() => { 
        fetchAll(); 
        fetchRequests();
        const channel = supabase.channel('requests-dashboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
                fetchRequests();
                fetchStats();
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        if (isAdmin) {
            await Promise.all([fetchStats(), fetchReferralRows(), fetchManagers()]);
        } else {
            await fetchStats();
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        const { count: uCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { data: allReqs, count: rCount } = await supabase.from('requests').select('*');
        if (allReqs) {
            const newReqs = allReqs.filter((r: any) => r.status === 'new').length;
            const revenue = allReqs.filter((r: any) => r.status !== 'cancelled').reduce((acc: number, curr: any) => acc + (Number(curr.price_usd) || 0), 0);
            setStats({ totalUsers: uCount || 0, totalRequests: rCount || 0, newRequests: newReqs, totalRevenue: revenue });
        }
    };

    const fetchReferralRows = async () => {
        // 1. Get all users who have been referred (have referrer_id set)
        const { data: invitedUsers } = await supabase
            .from('users')
            .select('telegram_id, username, referrer_id')
            .not('referrer_id', 'is', null);

        if (!invitedUsers || invitedUsers.length === 0) return;

        // 2. Get unique referrer IDs
        const referrerIds = [...new Set(invitedUsers.map((u: any) => u.referrer_id))];

        // 3. Fetch referrer profiles
        const { data: referrers } = await supabase
            .from('users')
            .select('telegram_id, username, balance, note')
            .in('telegram_id', referrerIds);

        if (!referrers) return;

        // 4. Fetch all payout history for these referrers in one query
        const { data: allPayouts } = await supabase
            .from('chat_history')
            .select('user_id, content, created_at')
            .in('user_id', referrerIds)
            .like('content', `${PAYOUT_PREFIX}%`)
            .order('created_at', { ascending: false });

        // 5. Fetch all requests from invitees in one query (with full details)
        const inviteeIds = invitedUsers.map((u: any) => u.telegram_id);
        const { data: allReqs } = await supabase
            .from('requests')
            .select('user_id, price_usd, status, excursion_title, tour_date, full_name, created_at, service_type')
            .in('user_id', inviteeIds)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false });

        // 6. Build rows
        const rows = referrers.map((ref: any) => {
            const myInvitees = invitedUsers.filter((u: any) => u.referrer_id === ref.telegram_id);
            const myInviteeIds = myInvitees.map((u: any) => u.telegram_id);
            const myReqs = (allReqs || []).filter((r: any) => myInviteeIds.includes(r.user_id));
            
            const revenue = myReqs.reduce((sum: number, r: any) => sum + (Number(r.price_usd) || 0), 0);
            const carRev = myReqs.filter((r: any) => r.service_type === 'car').reduce((sum: number, r: any) => sum + (Number(r.price_usd) || 0), 0);
            const transRev = myReqs.filter((r: any) => r.service_type === 'transfer').reduce((sum: number, r: any) => sum + (Number(r.price_usd) || 0), 0);
            
            const conversion = myInvitees.length > 0 ? ((myReqs.length / myInvitees.length) * 100).toFixed(1) : '0';

            const myPayouts = (allPayouts || []).filter((p: any) => p.user_id === ref.telegram_id);
            const totalPaid = myPayouts.reduce((sum: number, p: any) => {
                const match = p.content.match(/\$?([\d.]+)/);
                return sum + (match ? parseFloat(match[1]) : 0);
            }, 0);

            return {
                telegram_id: ref.telegram_id,
                username: ref.username,
                balance: ref.balance || 0,
                invitedCount: myInvitees.length,
                invitees: myInvitees, // list of invited users
                requestCount: myReqs.length,
                revenue,
                carRev,
                transRev,
                conversion,
                totalPaid,
                note: ref.note || '',
                payouts: myPayouts,
                requests: myReqs
            };
        });

        const finalRows = rows; // Managers and Admins see everything
        setReferralRows(finalRows);
    };

    const fetchManagers = async () => {
        const { data } = await supabase.from('users').select('telegram_id, username, role, note').in('role', ['manager', 'admin', 'founder']);
        setManagers(data || []);
    };

    const handlePayout = async (ref: any) => {
        if (ref.balance <= 0) {
            setPayoutMsg(prev => ({ ...prev, [ref.telegram_id]: 'Ошибка: Баланс равен 0' }));
            return;
        }
        const amount = ref.balance;
        // Zero out balance
        await supabase.from('users').update({ balance: 0 }).eq('telegram_id', ref.telegram_id);
        // Log payout in chat_history
        await supabase.from('chat_history').insert({
            user_id: ref.telegram_id,
            role: 'assistant',
            content: `${PAYOUT_PREFIX} $${amount} — выплачено ${new Date().toLocaleDateString('ru-RU')}`
        });
        setPayoutMsg(prev => ({ ...prev, [ref.telegram_id]: `Успешно: Выплачено $${amount}` }));
        fetchReferralRows();
    };

    const handleAddManager = async () => {
        if (!newManagerId || !isAdmin) return;
        
        let query = supabase.from('users').select('*');
        const input = newManagerId.trim();
        
        if (/^\d+$/.test(input)) {
            query = query.eq('telegram_id', parseInt(input));
        } else {
            const username = input.startsWith('@') ? input.substring(1) : input;
            query = query.eq('username', username);
        }

        const { data: existingUser } = await query.single();
        
        if (!existingUser) {
            setManagerMsg(t.managerAddError || 'Пользователь не найден.');
            return;
        }

        await supabase.from('users').update({ role: newManagerRole, note: newManagerNote }).eq('telegram_id', existingUser.telegram_id);
        
        const roleName = newManagerRole === 'admin' ? (t.adminBadge || 'Admin') : (t.managerBadge || 'Manager');
        setManagerMsg(`Успешно: ${existingUser.username || existingUser.telegram_id} теперь ${roleName}.`);
        setNewManagerId('');
        setNewManagerNote('');
        fetchManagers();
    };

    const handleUpdateNote = async (tgId: number, newNote: string) => {
        await supabase.from('users').update({ note: newNote }).eq('telegram_id', tgId);
        fetchManagers();
    };

    const handleUpdateRole = async (tgId: number, newRole: 'manager' | 'admin') => {
        await supabase.from('users').update({ role: newRole }).eq('telegram_id', tgId);
        setManagerMsg(`✅ Роль обновлена.`);
        fetchManagers();
    };

    const handleRemoveManager = async (id: number) => {
        await supabase.from('users').update({ role: 'user' }).eq('telegram_id', id);
        setManagerMsg((t.managerRemoveSuccess || 'Сотрудник {id} удалён.').replace('{id}', String(id)));
        fetchManagers();
    };

    const fetchRequests = async () => {
        setReqLoading(true);
        const { data } = await supabase.from('requests').select('*, users(username, referrer_id)').order('created_at', { ascending: false }).limit(200);
        setRequests(data || []);
        setReqLoading(false);
    };

    const updateStatus = async (id: string, status: string) => {
        await supabase.from('requests').update({ status }).eq('id', id);
        fetchRequests();
        fetchStats();
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'new': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'contacted': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'done': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-slate-500/20 text-slate-400';
        }
    };

    if (loading) return <div className="text-center py-20 opacity-50 animate-pulse">{t.analyzing || 'Анализ данных...'}</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-white/10 to-transparent p-[1px] rounded-[2rem] overflow-hidden shadow-lg">
                    <div className="bg-black/40 backdrop-blur-md p-5 h-full rounded-[2rem] border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-[40px] group-hover:bg-blue-500/20 transition-all -z-10" />
                        <span className="material-symbols-outlined text-blue-400 mb-2 block">group</span>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t.statsTotalUsers}</p>
                        <p className="text-3xl font-black text-white">{stats.totalUsers}</p>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-white/10 to-transparent p-[1px] rounded-[2rem] overflow-hidden shadow-lg">
                    <div className="bg-black/40 backdrop-blur-md p-5 h-full rounded-[2rem] border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-[40px] group-hover:bg-green-500/20 transition-all -z-10" />
                        <span className="material-symbols-outlined text-green-400 mb-2 block">receipt_long</span>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t.statsTotalRequests}</p>
                        <p className="text-3xl font-black text-white">{stats.totalRequests}</p>
                    </div>
                </div>
                {isAdmin && (
                    <div className="col-span-2 bg-gradient-to-r from-primary/20 to-primary/5 p-[1px] rounded-[2rem] overflow-hidden shadow-lg shadow-primary/5">
                        <div className="bg-black/40 backdrop-blur-xl p-5 sm:p-6 h-full rounded-[2rem] relative overflow-hidden group flex justify-between items-center">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/10 rounded-full blur-[60px] group-hover:bg-primary/20 transition-all -z-10" />
                            <div>
                                <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">{t.statsRevenue}</p>
                                <p className="text-4xl sm:text-5xl font-black text-white">${stats.totalRevenue.toLocaleString()}</p>
                            </div>
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0 relative overflow-hidden">
                                <div className="absolute inset-0 bg-primary/20 animate-pulse" />
                                <span className="material-symbols-outlined text-[32px] text-primary relative z-10">monitoring</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* New requests alert */}
            {stats.newRequests > 0 && (
                <div className="bg-gradient-to-r from-blue-500/20 to-transparent p-[1px] rounded-[1.5rem] overflow-hidden">
                    <div className="bg-[#121214] p-4 rounded-[1.5rem] border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                                <span className="material-symbols-outlined text-blue-400 text-[18px]">notifications_active</span>
                            </div>
                            <p className="text-xs font-bold text-blue-100 uppercase tracking-wide">{t.statsNewRequests}</p>
                        </div>
                        <span className="bg-blue-500 text-black text-[11px] font-black px-3 py-1 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]">{stats.newRequests}</span>
                    </div>
                </div>
            )}

            {/* Manager Management */}
            {isAdmin && (
                <div className="bg-gradient-to-b from-white/[0.05] to-transparent p-[1px] rounded-[2rem] overflow-hidden">
                    <div className="bg-black/60 backdrop-blur-md p-6 rounded-[2rem] border border-white/5 space-y-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-secondary/10 rounded-2xl flex items-center justify-center border border-secondary/20 shadow-[0_0_20px_rgba(var(--secondary-rgb),0.1)]">
                                <span className="material-symbols-outlined text-secondary text-[20px]">manage_accounts</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white tracking-tight">{t.manageManagers || 'Команда'}</h3>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Управление доступом</p>
                            </div>
                        </div>
                        <div className="space-y-4 bg-white/[0.02] p-4 rounded-[1.5rem] border border-white/5">
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">fingerprint</span>
                                    <input
                                        type="text"
                                        value={newManagerId}
                                        onChange={e => setNewManagerId(e.target.value)}
                                        placeholder={t.enterTgId || 'Telegram ID'}
                                        className="w-full bg-black/60 border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white outline-none focus:border-secondary/50 transition-all placeholder:text-slate-600 shadow-inner"
                                    />
                                </div>
                                <button onClick={handleAddManager} className="px-6 py-4 bg-secondary/10 text-secondary border border-secondary/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-secondary/20 transition-all active:scale-95 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-2xl border border-white/5 bg-black/40">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Уровень:</span>
                                <div className="flex gap-2 flex-1">
                                    <button 
                                        onClick={() => setNewManagerRole('manager')}
                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${newManagerRole === 'manager' ? 'bg-secondary text-black shadow-secondary/20' : 'bg-white/5 text-slate-400 hover:text-white'}`}
                                    >
                                        {t.selectManager || 'Manager'}
                                    </button>
                                    <button 
                                        onClick={() => setNewManagerRole('admin')}
                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${newManagerRole === 'admin' ? 'bg-primary text-black shadow-primary/20' : 'bg-white/5 text-slate-400 hover:text-white'}`}
                                    >
                                        {t.selectAdmin || 'Admin'}
                                    </button>
                                </div>
                            </div>


                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">edit_note</span>
                            <input
                                type="text"
                                value={newManagerNote}
                                onChange={e => setNewManagerNote(e.target.value)}
                                placeholder="Личная заметка к сотруднику (подпись)..."
                                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white outline-none focus:border-secondary/50 transition-all placeholder:text-slate-600"
                            />
                        </div>
                    </div>
                    {managerMsg && <p className="text-xs text-primary/80 bg-primary/10 border border-primary/20 p-3 rounded-xl">{managerMsg}</p>}
                    {managers.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-white/5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t.activeEmployees || 'Сотрудники'}</p>
                            {managers.map(m => (
                                <div key={m.telegram_id} className="flex items-center justify-between bg-white/[0.02] p-4 rounded-2xl border border-white/5 transition-all hover:bg-white/[0.04]">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <p className="text-sm font-black text-slate-200">@{m.username || '—'}</p>
                                            <span className="bg-white/5 text-[8px] font-mono text-slate-600 px-1.5 py-0.5 rounded border border-white/5">{m.telegram_id}</span>
                                        </div>
                                        <div className="relative group max-w-[200px]">
                                            <div className="absolute inset-y-0 left-0 w-0.5 bg-secondary rounded-full opacity-0 group-focus-within:opacity-100 transition-all blur-[1px]" />
                                            <div className="flex items-center gap-2 bg-secondary/5 border border-secondary/20 rounded-xl px-3 py-1.5">
                                                <span className="material-symbols-outlined text-[14px] text-secondary/60">badge</span>
                                                <input 
                                                    className="text-[11px] font-bold text-secondary bg-transparent border-none outline-none w-full placeholder:text-secondary/30"
                                                    placeholder="Подпись менеджера..."
                                                    defaultValue={m.note}
                                                    onBlur={(e) => handleUpdateNote(m.telegram_id, e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {m.role === 'founder' ? (
                                            <span className="text-[9px] font-black px-2 py-1 rounded-lg uppercase bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                                                {t.ownerBadge || 'Владелец'}
                                            </span>
                                        ) : (
                                            <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/5">
                                                <button 
                                                    onClick={() => handleUpdateRole(m.telegram_id, 'manager')}
                                                    className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${m.role === 'manager' ? 'bg-secondary text-black' : 'text-slate-500 hover:text-white'}`}
                                                >
                                                    M
                                                </button>
                                                <button 
                                                    onClick={() => handleUpdateRole(m.telegram_id, 'admin')}
                                                    className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${m.role === 'admin' ? 'bg-primary text-black' : 'text-slate-500 hover:text-white'}`}
                                                >
                                                    A
                                                </button>
                                            </div>
                                        )}
                                        {m.role !== 'founder' && (
                                            <button onClick={() => handleRemoveManager(m.telegram_id)} className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 transition-all flex items-center justify-center border border-red-500/20 active:scale-95 ml-1">
                                                <span className="material-symbols-outlined text-[18px]">person_remove</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

            {/* Referral Analytics + Payouts */}
            {isAdmin && referralRows.length > 0 && (
                <div className="bg-[#1a1a1d] rounded-3xl border border-white/5 overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[18px]">payments</span>
                        <h3 className="text-sm font-bold text-slate-200">{t.refAnalytics}</h3>
                    </div>
                    <div className="divide-y divide-white/5">
                        {referralRows.map(ref => (
                            <div key={ref.telegram_id} className="p-4 space-y-3">
                                {/* Header row */}
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-primary/20">
                                        <span className="material-symbols-outlined text-primary text-[24px]">person</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-base font-black text-white truncate">
                                                {ref.note || `@${ref.username}`}
                                            </p>
                                            {ref.note && <span className="text-[10px] text-slate-500 font-bold">(@{ref.username})</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-white/5 text-[9px] font-mono text-slate-500 px-2 py-0.5 rounded-md border border-white/5">{ref.telegram_id}</span>
                                            <div className="flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                                                <span className="material-symbols-outlined text-[10px] text-primary">label</span>
                                                <input 
                                                    className="text-[9px] font-bold text-primary bg-transparent border-none outline-none w-24 placeholder:text-primary/30"
                                                    placeholder="Edit Tag..."
                                                    defaultValue={ref.note}
                                                    onBlur={(e) => handleUpdateNote(ref.telegram_id, e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-black text-primary tracking-tighter">${ref.balance}</p>
                                        <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">{t.refBalance}</p>
                                    </div>
                                </div>

                                {/* Stats row */}
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { label: t.refInvited, value: ref.invitedCount, color: 'text-blue-400' },
                                        { label: t.refRequests, value: ref.requestCount, color: 'text-green-400' },
                                        { label: t.refConversion, value: `${ref.conversion}%`, color: 'text-purple-400' },
                                        { label: t.refRevenue, value: `$${ref.revenue}`, color: 'text-primary' },
                                    ].map(s => (
                                        <div key={s.label} className="bg-black/20 p-2 rounded-xl text-center">
                                            <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
                                            <p className="text-[8px] text-slate-600 uppercase font-bold">{s.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Revenue Breakdown */}
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 flex items-center justify-between">
                                        <span className="text-[9px] font-bold uppercase text-slate-500">Cars</span>
                                        <span className="text-xs font-black text-blue-300">${ref.carRev}</span>
                                    </div>
                                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 flex items-center justify-between">
                                        <span className="text-[9px] font-bold uppercase text-slate-500">Transfers</span>
                                        <span className="text-xs font-black text-green-300">${ref.transRev}</span>
                                    </div>
                                </div>

                                {/* Action row */}
                                <div className="flex items-center gap-2 mt-4">
                                    <button
                                        onClick={() => handlePayout(ref)}
                                        disabled={ref.balance <= 0}
                                        className="flex-1 py-3 bg-gradient-to-r from-green-500/20 to-green-500/10 text-green-400 border border-green-500/30 rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all hover:border-green-500/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                                        {t.refPayoutBtn} ${ref.balance}
                                    </button>
                                    {ref.totalPaid > 0 && (
                                        <div className="px-4 py-2.5 bg-black/40 border border-white/5 rounded-2xl text-center min-w-[90px]">
                                            <p className="text-xs font-black text-slate-300 tracking-tight">${ref.totalPaid.toFixed(0)}</p>
                                            <p className="text-[8px] text-slate-600 uppercase font-bold tracking-widest mt-0.5">{t.refPaid}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Payout feedback */}
                                {payoutMsg[ref.telegram_id] && (
                                    <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2 rounded-xl">{payoutMsg[ref.telegram_id]}</p>
                                )}

                                {/* Collapsible Details */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Bookings from this referral's invitees */}
                                    {ref.requests && ref.requests.length > 0 && (
                                        <details className="text-[10px]">
                                            <summary className="text-slate-400 cursor-pointer hover:text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1 outline-none">
                                                <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                                                {t.refOrders} ({ref.requests.length})
                                            </summary>
                                            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                                {ref.requests.map((r: any, i: number) => (
                                                    <div key={i} className="bg-black/30 p-2 rounded-xl flex items-center justify-between border border-white/5">
                                                        <div className="min-w-0">
                                                            <p className="text-slate-200 font-bold truncate">{r.excursion_title || '—'}</p>
                                                            <p className="text-slate-500">{r.full_name || '—'} · {r.tour_date || '—'}</p>
                                                        </div>
                                                        <div className="text-right flex-shrink-0 ml-2">
                                                            <p className="text-primary font-black">${r.price_usd || 0}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}

                                    {/* Invited Users List */}
                                    {ref.invitees && ref.invitees.length > 0 && (
                                        <details className="text-[10px]">
                                            <summary className="text-slate-400 cursor-pointer hover:text-slate-200 font-bold uppercase tracking-wider flex items-center gap-1 outline-none">
                                                <span className="material-symbols-outlined text-[14px]">group</span>
                                                {t.refInvitedUsers} ({ref.invitees.length})
                                            </summary>
                                            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                                {ref.invitees.map((u: any, i: number) => (
                                                    <div key={i} className="bg-black/30 p-2 rounded-xl flex items-center justify-between border border-white/5">
                                                        <p className="text-slate-300 font-bold truncate">@{u.username || 'user'}</p>
                                                        <p className="text-[9px] text-slate-600 px-2">{new Date(u.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}
                                </div>

                                {/* Payout history */}
                                {ref.payouts.length > 0 && (
                                    <details className="text-[10px]">
                                        <summary className="text-slate-500 cursor-pointer hover:text-slate-300 font-bold uppercase tracking-wider">{t.refHistory} ({ref.payouts.length})</summary>
                                        <div className="mt-2 space-y-1 pl-2">
                                            {ref.payouts.map((p: any, i: number) => (
                                                <p key={i} className="text-slate-400 font-mono">{p.content.replace(PAYOUT_PREFIX, '').trim()}</p>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Detailed Requests Section */}
            <div className="bg-gradient-to-b from-white/[0.05] to-transparent p-[1px] rounded-[2rem] overflow-hidden">
                <div className="bg-[#121214] rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl">
                    <div className="px-6 py-5 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-black/40">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]">
                                <span className="material-symbols-outlined text-primary text-[24px]">receipt_long</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white tracking-tight">Панель заявок</h3>
                                <p className="text-[10px] text-primary uppercase tracking-widest font-bold">Очередь обработки</p>
                            </div>
                        </div>
                    <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-2xl border border-white/5">
                        <button
                            onClick={() => setReqFilter('new')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${reqFilter === 'new' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-slate-400 hover:bg-white/5 disabled:opacity-50'}`}
                        >
                            Активные ({requests.filter(r => r.status === 'new' || r.status === 'contacted').length})
                        </button>
                        <button
                            onClick={() => setReqFilter('all')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${reqFilter === 'all' ? 'bg-slate-700/50 text-slate-200 border border-slate-600/50' : 'text-slate-400 hover:bg-white/5 disabled:opacity-50'}`}
                        >
                            Все
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    {reqLoading ? <div className="text-center py-10 opacity-50"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto"></div></div> : 
                    requests.filter(req => reqFilter === 'all' || (reqFilter === 'new' && (req.status === 'new' || req.status === 'contacted'))).length === 0 ? 
                    <div className="text-center py-12 bg-black/20 rounded-2xl border border-dashed border-white/10">
                        <span className="material-symbols-outlined text-[40px] text-slate-600 mb-2">inbox</span>
                        <p className="text-sm font-bold text-slate-400">{t.noRequests}</p>
                    </div> 
                    : requests.filter(req => reqFilter === 'all' || (reqFilter === 'new' && (req.status === 'new' || req.status === 'contacted'))).map(req => {
                        const meta = req.meta_data || {};
                        const isTransfer = req.service_type === 'transfer';
                        const isCar = req.service_type === 'car';

                        return (
                            <div key={req.id} className="bg-gradient-to-br from-black/40 to-[#121214] p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                                {/* Header */}
                                <div className="flex justify-between items-start gap-4">
                                    <div className="space-y-2 flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border shadow-sm ${getStatusStyle(req.status)}`}>
                                                {req.status === 'new' ? 'НОВАЯ' : req.status === 'contacted' ? 'СВЯЗАЛСЯ' : req.status === 'done' ? 'ГОТОВО' : 'ОТМЕНЕНА'}
                                            </span>
                                            <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                                {new Date(req.created_at).toLocaleString('ru-RU', {day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                            <span className="text-[10px] font-black text-primary uppercase bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">{req.service_type || 'car'}</span>
                                        </div>
                                        <h4 className="font-bold text-slate-100 text-lg sm:text-xl leading-tight">
                                            {isTransfer ? `${meta.from || '---'} ⟶ ${meta.to || '---'}` : (req.excursion_title || t.recentRequests)}
                                        </h4>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-3xl font-black text-primary tracking-tighter">${req.price_usd}</p>
                                        <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Ожидаемо</p>
                                    </div>
                                </div>

                                {/* Body stats */}
                                <div className="grid grid-cols-2 gap-3 mt-4">
                                    <div className="bg-black/30 p-3.5 rounded-2xl border border-white/[0.03]">
                                        <p className="text-slate-500 mb-2 flex items-center gap-1 uppercase font-black tracking-widest text-[9px]">
                                            <span className="material-symbols-outlined text-[12px]">person</span> {t.client}
                                        </p>
                                        <p className="font-bold text-slate-200 truncate">@{req.users?.username || 'user'}</p>
                                        <p className="text-slate-400 mt-1 text-xs truncate">{req.full_name}</p>
                                        <div className="mt-2 text-[10px]">
                                            {meta.phone && <a href={`https://wa.me/${meta.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="text-green-400 hover:underline flex items-center gap-1 font-mono">
                                                <span className="material-symbols-outlined text-[12px]">chat</span> {meta.phone}
                                            </a>}
                                        </div>
                                    </div>
                                    
                                    <div className="bg-black/30 p-3.5 rounded-2xl border border-white/[0.03]">
                                        <p className="text-slate-500 mb-2 flex items-center gap-1 uppercase font-black tracking-widest text-[9px]">
                                            <span className="material-symbols-outlined text-[12px]">info</span> Детали заказа
                                        </p>
                                        {isTransfer ? (
                                            <div className="space-y-1 text-xs text-slate-300">
                                                <p className="flex justify-between"><span>Океан/Дата:</span> <span className="font-bold text-white">{req.tour_date || meta.date || '—'}</span></p>
                                                <p className="flex justify-between"><span>Людей:</span> <span className="font-bold text-white">{meta.passengers || '—'}</span></p>
                                            </div>
                                        ) : isCar ? (
                                            <div className="space-y-1 text-xs text-slate-300">
                                                <p className="flex justify-between"><span>Авто:</span> <span className="font-bold text-white truncate max-w-[100px]">{req.excursion_title}</span></p>
                                                <p className="flex justify-between"><span>Дата:</span> <span className="font-bold text-white">{req.tour_date || meta.date || '—'}</span></p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1 text-xs text-slate-300">
                                                <p className="flex justify-between"><span>Дата:</span> <span className="font-bold text-white">{req.tour_date || '—'}</span></p>
                                                <p className="flex justify-between"><span>Отель:</span> <span className="font-bold text-white truncate max-w-[100px]">{req.hotel_name || '—'}</span></p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {req.comment && (
                                    <div className="bg-blue-500/5 p-3 rounded-2xl border border-blue-500/10 flex gap-2 items-start mt-2">
                                        <span className="material-symbols-outlined text-blue-400 text-[16px] mt-0.5">format_quote</span>
                                        <p className="text-blue-200/80 text-[11px] font-medium italic">
                                            {req.comment}
                                        </p>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                                    <button 
                                        onClick={() => updateStatus(req.id, 'contacted')} 
                                        className="flex-1 min-w-[100px] py-3 text-[10px] font-black bg-yellow-500/10 text-yellow-500 rounded-xl hover:bg-yellow-500/20 active:scale-95 transition-all uppercase tracking-widest border border-yellow-500/20 flex items-center justify-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">support_agent</span>
                                        Взят в работу
                                    </button>
                                    <button 
                                        onClick={() => updateStatus(req.id, 'done')} 
                                        className="flex-1 min-w-[100px] py-3 text-[10px] font-black bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500/20 active:scale-95 transition-all uppercase tracking-widest border border-green-500/20 flex items-center justify-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">task_alt</span>
                                        Сделка закрыта
                                    </button>
                                    <button 
                                        onClick={() => updateStatus(req.id, 'cancelled')} 
                                        className="flex-shrink-0 w-12 py-3 bg-red-500/5 text-red-500 rounded-xl hover:bg-red-500/10 active:scale-95 transition-all border border-red-500/10 flex items-center justify-center"
                                        title="Отменить заказ"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        </div>
    );
};

export default AdminStats;

