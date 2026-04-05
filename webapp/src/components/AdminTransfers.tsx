import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const EMPTY_TRANS = {
    from_location: '', to_location: '', car_type: 'Standard',
    price: 0, description: '', image_url: '',
    sort_number: 1, is_active: true
};

export default function AdminTransfers() {
    const [transfers, setTransfers] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState<any>({ ...EMPTY_TRANS });
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchTransfers(); }, []);

    const fetchTransfers = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('transfers').select('*').order('sort_number');
        if (error) console.error('Fetch error:', error);
        setTransfers(data || []);
        setLoading(false);
    };

    const handleFilesSelect = async (files: FileList) => {
        setUploading(true);
        try {
            const file = files[0];
            const ext = file.name.split('.').pop();
            const fileName = `trans_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('car_photos').upload(fileName, file);
            if (error) throw error;
            const { data: urlData } = supabase.storage.from('car_photos').getPublicUrl(fileName);
            setFormData((prev: any) => ({ ...prev, image_url: urlData.publicUrl }));
        } catch (e: any) { alert('Ошибка фото: ' + e.message); } finally { setUploading(false); }
    };

    const handleSave = async () => {
        const { error } = isEditing 
            ? await supabase.from('transfers').update(formData).eq('id', isEditing.id)
            : await supabase.from('transfers').insert([formData]);
        
        if (error) {
            alert('ОШИБКА СОХРАНЕНИЯ: ' + error.message + '\n\n(Скорее всего вы не добавили колонку description в базу!)');
            return;
        }
        setIsEditing(null); setFormData({ ...EMPTY_TRANS }); fetchTransfers();
    };

    if (loading) return <div className="text-center py-10 text-white/50">Загрузка...</div>;

    return (
        <div className="space-y-6 pb-20">
            <div className="bg-[#1a1a1d] rounded-[32px] border border-white/5 p-6 space-y-5 shadow-2xl">
                <h2 className="text-xs font-black text-primary uppercase tracking-widest">{isEditing ? 'Изменение маршрута' : 'Новый маршрут'}</h2>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">Откуда</label>
                        <input value={formData.from_location} onChange={e => setFormData({ ...formData, from_location: e.target.value })} className="bg-black/40 border border-white/5 p-4 rounded-2xl text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">Куда</label>
                        <input value={formData.to_location} onChange={e => setFormData({ ...formData, to_location: e.target.value })} className="bg-black/40 border border-white/5 p-4 rounded-2xl text-sm" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">Тип (Vito, Бизнес и т.д.)</label>
                        <input value={formData.car_type} onChange={e => setFormData({ ...formData, car_type: e.target.value })} className="bg-black/40 border border-white/5 p-4 rounded-2xl text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold ml-1">Цена ($)</label>
                        <input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: parseInt(e.target.value) })} className="bg-black/40 border border-white/5 p-4 rounded-2xl text-sm" />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] text-primary uppercase font-black ml-1">Описание маршрута (Важно!)</label>
                    <textarea 
                        placeholder="Напишите здесь подробности для клиента..." 
                        value={formData.description || ''} 
                        onChange={e => setFormData({ ...formData, description: e.target.value })} 
                        className="w-full bg-black/40 border border-primary/20 p-4 rounded-2xl text-sm min-h-[100px] focus:border-primary transition-all"
                    />
                </div>

                {formData.image_url && (
                    <div className="flex justify-center relative group">
                        <img src={formData.image_url} className="w-full aspect-video rounded-2xl object-cover border border-white/10 shadow-lg" alt="" />
                        <button onClick={() => setFormData({...formData, image_url: ''})} className="absolute top-2 right-2 bg-red-500 w-8 h-8 rounded-full flex items-center justify-center text-white">×</button>
                    </div>
                )}

                <div className="flex gap-3 pt-2">
                    <button onClick={handleSave} className="flex-1 py-5 bg-primary text-black rounded-3xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">СОХРАНИТЬ</button>
                    <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center border border-white/5 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-white">{uploading ? 'sync' : 'photo_camera'}</span>
                    </button>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={e => e.target.files && handleFilesSelect(e.target.files)} />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {transfers.map(t => (
                    <div key={t.id} className="bg-[#1a1a1d] p-5 rounded-[32px] border border-white/5 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <img src={t.image_url} className="w-14 h-14 rounded-2xl object-cover bg-black/20" alt="" />
                            <div>
                                <p className="text-sm font-black text-white uppercase">{t.from_location} → {t.to_location}</p>
                                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{t.car_type} • ${t.price}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setIsEditing(t); setFormData(t); window.scrollTo(0, 0); }} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 active:bg-primary active:text-black transition-all"><span className="material-symbols-outlined">edit</span></button>
                            <button onClick={async () => { if(confirm('Удалить?')) { await supabase.from('transfers').delete().eq('id', t.id); fetchTransfers(); } }} className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 active:bg-red-500 active:text-white transition-all"><span className="material-symbols-outlined">delete</span></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
