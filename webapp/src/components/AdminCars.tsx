import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AdminCars: React.FC<{ t?: any }> = () => {
    const [cars, setCars] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [formData, setFormData] = useState({
        city: '', title: '', description: '', price_per_day: 0, conditions: '', image_url: '', sort_number: 1, is_active: true
    });

    useEffect(() => {
        fetchCars();
    }, []);

    const fetchCars = async () => {
        setLoading(true);
        const { data } = await supabase.from('cars').select('*').order('sort_number', { ascending: true });
        setCars(data || []);
        setLoading(false);
    };

    const handleSave = async () => {
        if (isEditing) {
            await supabase.from('cars').update(formData).eq('id', isEditing.id);
        } else {
            await supabase.from('cars').insert([formData]);
        }
        setIsEditing(null);
        setFormData({ city: '', title: '', description: '', price_per_day: 0, conditions: '', image_url: '', sort_number: 1, is_active: true });
        fetchCars();
    };

    const startEdit = (car: any) => {
        setIsEditing(car);
        setFormData({ ...car });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (confirm('Удалить автомобиль?')) {
            await supabase.from('cars').delete().eq('id', id);
            fetchCars();
        }
    };

    if (loading) return <div className="text-center py-10 opacity-50">Загрузка автомобилей...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* FORM */}
            <div className="bg-[#1a1a1d] p-6 rounded-3xl border border-white/5 space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">{isEditing ? 'edit' : 'add_circle'}</span>
                    {isEditing ? 'Редактировать авто' : 'Добавить авто'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Город</label>
                        <input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm" placeholder="Москва" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Название авто</label>
                        <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm" placeholder="Toyota Camry" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Описание</label>
                        <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm h-24" placeholder="Краткое описание..." />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Цена (₽/сутки)</label>
                        <input type="number" value={formData.price_per_day} onChange={e => setFormData({ ...formData, price_per_day: parseInt(e.target.value) })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Условия аренды</label>
                        <textarea value={formData.conditions} onChange={e => setFormData({ ...formData, conditions: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm h-20" placeholder="Стаж от 3 лет, залог..." />
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
                {cars.map(car => (
                    <div key={car.id} className="bg-[#1a1a1d] p-4 rounded-3xl border border-white/5 flex gap-4 items-center">
                        <div className="w-16 h-16 bg-black/40 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0">
                            {car.image_url ? <img src={car.image_url} alt="" className="object-cover w-full h-full" /> : <span className="material-symbols-outlined text-slate-600">image</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">{car.city}</span>
                                <span className="text-[10px] text-slate-500">#{car.sort_number}</span>
                            </div>
                            <h4 className="font-bold truncate text-slate-200 mt-1">{car.title}</h4>
                            <p className="text-xs text-slate-400">{car.price_per_day}₽/сутки</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => startEdit(car)} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                            <button onClick={() => handleDelete(car.id)} className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminCars;
