import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const EMPTY_CAR = {
    brand: '', model: '', city: '', price_per_day: 0,
    body_style: '', transmission: 'Automatic', fuel_type: 'Petrol',
    description: '', image_url: '', image_urls: [] as string[],
    sort_number: 1, is_active: true
};

const ConfirmDialog: React.FC<{
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-28 px-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
        <div className="w-full max-w-sm bg-[#1a1a1d] rounded-3xl border border-white/10 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-slate-200 text-center font-semibold">{message}</p>
            <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 py-3 bg-white/5 rounded-2xl text-sm font-bold text-slate-300">Cancel</button>
                <button onClick={onConfirm} className="flex-1 py-3 bg-red-500/20 rounded-2xl text-sm font-black text-red-400">Delete</button>
            </div>
        </div>
    </div>
);

export default function AdminCars() {
    const [cars, setCars] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isTranslating, setIsTranslating] = useState(false);
    const [formData, setFormData] = useState<any>({ ...EMPTY_CAR });
    const [confirmTarget, setConfirmTarget] = useState<any>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchCars(); }, []);

    const fetchCars = async () => {
        setLoading(true);
        const { data } = await supabase.from('cars').select('*').order('sort_number', { ascending: true });
        setCars(data || []);
        setLoading(false);
    };

    const handleAutoTranslate = async () => {
        if (!formData.city && !formData.description) {
            alert('Сначала введите город или описание на русском!');
            return;
        }
        setIsTranslating(true);
        try {
            const res = await fetch('/api/translate-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'car', data: { 
                    city: formData.city, 
                    description: formData.description,
                    body_style: formData.body_style,
                    transmission: formData.transmission,
                    fuel_type: formData.fuel_type
                } })
            });
            if (!res.ok) throw new Error('Failed to translate');
            const translations = await res.json();
            setFormData(prev => ({ ...prev, ...translations }));
        } catch (e: any) {
            alert('Ошибка AI перевода: ' + e.message);
        } finally {
            setIsTranslating(false);
        }
    };

    const handleFilesSelect = async (files: FileList) => {
        setUploading(true);
        const newUrls: string[] = [];
        try {
            for (const file of Array.from(files)) {
                const ext = file.name.split('.').pop();
                const fileName = `car_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                const { error } = await supabase.storage.from('car_photos').upload(fileName, file);
                if (error) throw error;
                const { data: urlData } = supabase.storage.from('car_photos').getPublicUrl(fileName);
                newUrls.push(urlData.publicUrl);
            }
            setFormData((prev: any) => ({
                ...prev,
                image_urls: [...(prev.image_urls || []), ...newUrls],
                image_url: prev.image_url || newUrls[0] || ''
            }));
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        const { error } = isEditing 
            ? await supabase.from('cars').update(formData).eq('id', isEditing.id)
            : await supabase.from('cars').insert([formData]);
        
        if (error) { alert(error.message); return; }
        setIsEditing(null);
        setFormData({ ...EMPTY_CAR });
        fetchCars();
    };

    if (loading) return <div className="text-center py-10 text-white opacity-50">Loading cars...</div>;

    return (
        <div className="space-y-6 pb-20">
            {confirmTarget && <ConfirmDialog message={`Delete ${confirmTarget.brand} ${confirmTarget.model}?`} onConfirm={async () => {
                await supabase.from('cars').delete().eq('id', confirmTarget.id);
                setConfirmTarget(null);
                fetchCars();
            }} onCancel={() => setConfirmTarget(null)} />}

            {/* Form */}
            <div className="bg-[#1a1a1d] rounded-3xl border border-white/5 p-5 space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-200">{isEditing ? 'Edit Car' : 'Add New Car'}</h2>
                    <button 
                        onClick={handleAutoTranslate} 
                        disabled={isTranslating} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isTranslating ? 'bg-primary/20 text-primary/40' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                    >
                        <span className="material-symbols-outlined text-[16px]">{isTranslating ? 'sync' : 'auto_fix'}</span>
                        {isTranslating ? 'Translating...' : 'AI Translate (7 languages)'}
                    </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Brand" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                    <input placeholder="Model" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <input placeholder="City" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                    <input type="number" placeholder="Price / Day" value={formData.price_per_day} onChange={e => setFormData({...formData, price_per_day: parseInt(e.target.value)})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                </div>

                <textarea placeholder="Description" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />

                {/* Photo Preview Gallery */}
                {formData.image_urls && formData.image_urls.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {formData.image_urls.map((url: string, idx: number) => (
                            <div key={idx} className="relative flex-shrink-0">
                                <img src={url} className="w-20 h-20 rounded-xl object-cover border border-white/10" alt="" />
                                <button 
                                    onClick={() => setFormData({
                                        ...formData, 
                                        image_urls: formData.image_urls.filter((_: any, i: number) => i !== idx),
                                        image_url: formData.image_url === url ? (formData.image_urls[idx+1] || formData.image_urls[idx-1] || '') : formData.image_url
                                    })}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-3">
                    {isEditing && <button onClick={() => { setIsEditing(null); setFormData({...EMPTY_CAR}); }} className="flex-1 py-4 bg-white/5 rounded-2xl font-black uppercase text-[10px]">Cancel</button>}
                    <button onClick={handleSave} className="flex-[2] py-4 bg-primary text-black rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 transition-all">Save Car</button>
                    <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center"><span className="material-symbols-outlined">add_a_photo</span></button>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleFilesSelect(e.target.files)} />
                </div>
            </div>

            {/* List */}
            <div className="space-y-4">
                {cars.map(car => (
                    <div key={car.id} className="bg-[#1a1a1d] p-4 rounded-3xl border border-white/5 flex items-center gap-4">
                        <img src={car.image_url} className="w-16 h-16 rounded-2xl object-cover bg-black/20" alt="" />
                        <div className="flex-1 min-w-0">
                            <h4 className="text-white font-bold truncate">{car.brand} {car.model}</h4>
                            <p className="text-[10px] text-primary font-bold uppercase">{car.city} • ${car.price_per_day}/d</p>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => { setIsEditing(car); setFormData(car); }} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-400"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                             <button onClick={() => setConfirmTarget(car)} className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
