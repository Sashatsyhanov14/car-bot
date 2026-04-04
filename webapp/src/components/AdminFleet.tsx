import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Shared bucket for all fleet photos
const BUCKET = 'car_photos';

const EMPTY_CAR = {
    brand: '',
    model: '',
    city: '',
    price_per_day: 0,
    body_style: '',
    transmission: 'Automatic',
    fuel_type: 'Petrol',
    description: '',
    image_url: '',
    image_urls: [] as string[],
    is_active: true
};

const EMPTY_TRANS = {
    from_location: '',
    to_location: '',
    car_type: 'Standard',
    price: 0,
    description: '',
    image_url: '',
    is_active: true
};

const AdminFleet: React.FC = () => {
    const [view, setView] = useState<'cars' | 'transfers'>('cars');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [formData, setFormData] = useState<any>(EMPTY_CAR);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        fetchItems();
    }, [view]);

    const fetchItems = async () => {
        setLoading(true);
        const { data } = await supabase
            .from(view === 'cars' ? 'cars' : 'transfers')
            .select('*')
            .order('created_at', { ascending: false });
        setItems(data || []);
        setLoading(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const { error } = await supabase.storage.from(BUCKET).upload(fileName, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
            
            if (view === 'cars') {
                const newUrls = [...(formData.image_urls || []), publicUrl];
                setFormData({ ...formData, image_urls: newUrls, image_url: newUrls[0] });
            } else {
                setFormData({ ...formData, image_url: publicUrl });
            }
        } catch (err: any) {
            alert('Upload error: ' + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = async () => {
        const table = view === 'cars' ? 'cars' : 'transfers';
        if (isEditing && isEditing !== 'new') {
            await supabase.from(table).update(formData).eq('id', isEditing);
        } else {
            await supabase.from(table).insert([formData]);
        }
        setIsEditing(null);
        setFormData(view === 'cars' ? EMPTY_CAR : EMPTY_TRANS);
        fetchItems();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        await supabase.from(view === 'cars' ? 'cars' : 'transfers').delete().eq('id', id);
        fetchItems();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* View Switcher */}
            <div className="flex bg-[#1a1a1d] p-1 rounded-2xl border border-white/5 shadow-inner">
                <button 
                    onClick={() => { setView('cars'); setFormData(EMPTY_CAR); setIsEditing(null); }}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'cars' ? 'bg-primary text-black shadow-lg' : 'text-slate-500'}`}
                >
                    Cars
                </button>
                <button 
                    onClick={() => { setView('transfers'); setFormData(EMPTY_TRANS); setIsEditing(null); }}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'transfers' ? 'bg-primary text-black shadow-lg' : 'text-slate-500'}`}
                >
                    Transfers
                </button>
            </div>

            {/* Form */}
            {isEditing && (
                <div className="bg-[#1a1a1d] p-6 rounded-3xl border border-primary/20 space-y-4 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[40px] -z-10" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <span className="material-symbols-outlined">{isEditing === 'new' ? 'add_circle' : 'edit'}</span>
                        {isEditing === 'new' ? 'Add Item' : 'Edit Item'}
                    </h3>
                    
                    {view === 'cars' ? (
                        <>
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
                                            <img src={url} className="w-16 h-16 rounded-xl object-cover border border-white/10" alt="" />
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
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder="From" value={formData.from_location} onChange={e => setFormData({...formData, from_location: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                                <input placeholder="To" value={formData.to_location} onChange={e => setFormData({...formData, to_location: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                            </div>
                            <input type="number" placeholder="Price ($)" value={formData.price} onChange={e => setFormData({...formData, price: parseInt(e.target.value)})} className="w-full bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                            
                            {formData.image_url && (
                                <div className="flex justify-center">
                                    <div className="relative">
                                        <img src={formData.image_url} className="w-24 h-24 rounded-2xl object-cover border border-white/10 shadow-xl" alt="" />
                                        <button onClick={() => setFormData({...formData, image_url: ''})} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold">×</button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <div className="flex items-center gap-3">
                        <label className="flex-1 h-12 bg-white/5 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all border border-dashed border-white/10">
                            <input type="file" onChange={handleFileUpload} className="hidden" accept="image/*" />
                            {isUploading ? <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /> : <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Add Photo</span>}
                        </label>
                        <button onClick={handleSave} className="flex-[2] h-12 bg-primary text-black rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 transition-all">Save {view === 'cars' ? 'Car' : 'Route'}</button>
                    </div>
                </div>
            )}

            {/* List */}
            {!isEditing && (
                <div className="space-y-4">
                    <button 
                        onClick={() => { setIsEditing('new'); setFormData(view === 'cars' ? EMPTY_CAR : EMPTY_TRANS); }}
                        className="w-full py-4 bg-primary/10 text-primary border border-primary/30 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                        <span className="material-symbols-outlined text-[18px]">add_circle</span>
                        Add New {view === 'cars' ? 'Car' : 'Transfer'}
                    </button>

                    <div className="space-y-3">
                        {loading ? <div className="text-center py-10 opacity-50">Loading...</div> : items.map(item => (
                            <div key={item.id} className="bg-[#1a1a1d] p-4 rounded-3xl border border-white/5 flex items-center gap-4 group hover:border-primary/20 transition-all">
                                {item.image_url ? (
                                    <img src={item.image_url} className="w-16 h-16 rounded-2xl object-cover shadow-lg" alt="" />
                                ) : (
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-slate-700">image_not_supported</span>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-200 truncate">
                                        {view === 'cars' ? `${item.brand} ${item.model}` : `${item.from_location} → ${item.to_location}`}
                                    </h4>
                                    <p className="text-primary font-black text-xs">${view === 'cars' ? item.price_per_day : item.price}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setIsEditing(item.id); setFormData(item); }} className="w-9 h-9 rounded-xl bg-white/5 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                    </button>
                                    <button onClick={() => handleDelete(item.id)} className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 flex items-center justify-center transition-all">
                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminFleet;
