import { useState, useEffect } from 'react';
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
    const [formData, setFormData] = useState<any>({ ...EMPTY_TRANS });

    useEffect(() => { fetchTransfers(); }, []);

    const fetchTransfers = async () => {
        setLoading(true);
        const { data } = await supabase.from('transfers').select('*').order('sort_number');
        setTransfers(data || []);
        setLoading(false);
    };

    const handleSave = async () => {
        const { error } = isEditing 
            ? await supabase.from('transfers').update(formData).eq('id', isEditing.id)
            : await supabase.from('transfers').insert([formData]);
        
        if (error) { alert(error.message); return; }
        setIsEditing(null);
        setFormData({ ...EMPTY_TRANS });
        fetchTransfers();
    };

    if (loading) return <div className="text-center py-10 text-white opacity-50">Loading transfers...</div>;

    return (
        <div className="space-y-6 pb-20">
            <div className="bg-[#1a1a1d] rounded-3xl border border-white/5 p-5 space-y-6">
                <h2 className="text-sm font-bold text-slate-200">{isEditing ? 'Edit Transfer' : 'Add New Transfer'}</h2>
                
                <div className="grid grid-cols-2 gap-3">
                    <input placeholder="From Location" value={formData.from_location} onChange={e => setFormData({...formData, from_location: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                    <input placeholder="To Location" value={formData.to_location} onChange={e => setFormData({...formData, to_location: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Car Type" value={formData.car_type} onChange={e => setFormData({...formData, car_type: e.target.value})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                    <input type="number" placeholder="Price ($)" value={formData.price} onChange={e => setFormData({...formData, price: parseInt(e.target.value)})} className="bg-black/20 border border-white/5 p-3 rounded-xl text-sm" />
                </div>

                <div className="flex gap-3">
                    {isEditing && <button onClick={() => { setIsEditing(null); setFormData({...EMPTY_TRANS}); }} className="flex-1 py-4 bg-white/5 rounded-2xl font-black uppercase text-[10px]">Cancel</button>}
                    <button onClick={handleSave} className="flex-[2] py-4 bg-primary text-black rounded-2xl font-black uppercase text-[10px] shadow-xl">Save Route</button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {transfers.map(t => (
                    <div key={t.id} className="bg-[#1a1a1d] p-4 rounded-3xl border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-white uppercase">{t.from_location} ➡️ {t.to_location}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">{t.car_type} • ${t.price}</p>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => { setIsEditing(t); setFormData(t); }} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-400"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                             <button onClick={async () => { if(confirm('Delete?')) { await supabase.from('transfers').delete().eq('id', t.id); fetchTransfers(); } }} className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
