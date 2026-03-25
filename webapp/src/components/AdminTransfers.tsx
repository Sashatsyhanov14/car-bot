import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AdminTransfers: React.FC<{ t?: any }> = () => {
    const [transfers, setTransfers] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [formData, setFormData] = useState({
        car_info: '', price: 0, conditions: '', image_url: '', sort_number: 1, is_active: true
    });

    useEffect(() => {
        fetchTransfers();
    }, []);

    const fetchTransfers = async () => {
        setLoading(true);
        const { data } = await supabase.from('transfers').select('*').order('sort_number', { ascending: true });
        setTransfers(data || []);
        setLoading(false);
    };

    const handleSave = async () => {
        if (isEditing) {
            await supabase.from('transfers').update(formData).eq('id', isEditing.id);
        } else {
            await supabase.from('transfers').insert([formData]);
        }
        setIsEditing(null);
        setFormData({ car_info: '', price: 0, conditions: '', image_url: '', sort_number: 1, is_active: true });
        fetchTransfers();
    };

    const startEdit = (tr: any) => {
        setIsEditing(tr);
        setFormData({ ...tr });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (confirm('Удалить трансфер?')) {
            await supabase.from('transfers').delete().eq('id', id);
            fetchTransfers();
        }
    };

    if (loading) return <div className="text-center py-10 opacity-50">Загрузка трансферов...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* FORM */}
            <div className="bg-[#1a1a1d] p-6 rounded-3xl border border-white/5 space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">{isEditing ? 'edit' : 'add_circle'}</span>
                    {isEditing ? 'Редактировать трансфер' : 'Добавить трансфер'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Информация об авто (Класс/Модель)</label>
                        <input value={formData.car_info} onChange={e => setFormData({ ...formData, car_info: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm" placeholder="Бизнес-класс / Mercedes E-class" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Цена (₽)</label>
                        <input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: parseInt(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Порядок</label>
                        <input type="number" value={formData.sort_number} onChange={e => setFormData({ ...formData, sort_number: parseInt(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Условия / Описание</label>
                        <textarea value={formData.conditions} onChange={e => setFormData({ ...formData, conditions: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm h-24" placeholder="Встреча с табличкой, ожидание 60 мин..." />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">URL Фото</label>
                        <input value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm" placeholder="https://..." />
                    </div>
                </div>

                <div className="flex gap-2 pt-4">
                    <button onClick={handleSave} className="flex-1 bg-primary text-black font-bold py-3 rounded-2xl active:scale-95 transition-all">
                        {isEditing ? 'Обновить' : 'Создать'}
                    </button>
                    {isEditing && (
                        <button onClick={() => setIsEditing(null)} className="px-6 bg-white/5 border border-white/10 py-3 rounded-2xl font-bold">Отмена</button>
                    )}
                </div>
            </div>

            {/* LIST */}
            <div className="space-y-4">
                {transfers.map(tr => (
                    <div key={tr.id} className="bg-[#1a1a1d] p-4 rounded-3xl border border-white/5 flex gap-4 items-center">
                        <div className="w-16 h-16 bg-black/40 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0">
                            {tr.image_url ? <img src={tr.image_url} alt="" className="object-cover w-full h-full" /> : <span className="material-symbols-outlined text-slate-600">airport_shuttle</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold truncate text-slate-200">{tr.car_info}</h4>
                            <p className="text-xs text-slate-400">{tr.price}₽</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => startEdit(tr)} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                            <button onClick={() => handleDelete(tr.id)} className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminTransfers;
