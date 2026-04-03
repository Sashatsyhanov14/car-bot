import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Car {
    id: string;
    brand: string;
    model: string;
    city: string;
    price_per_day: number;
    body_style: string;
    transmission: string;
    fuel_type: string;
    description: string;
    image_url: string;
    image_urls: string[];
}

interface Transfer {
    id: string;
    from_location: string;
    to_location: string;
    car_type: string;
    price: number;
    description: string;
    image_url: string;
}

export default function PublicCatalog({ lang }: { t: any, lang: string }) {
    const [serviceType, setServiceType] = useState<'car' | 'transfer'>('car');
    const [cars, setCars] = useState<Car[]>([]);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [bookingItem, setBookingItem] = useState<any>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', date: '', from: '', to: '', passengers: '1' });

    const tg = window.Telegram?.WebApp;

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const { data: carsData } = await supabase.from('cars').select('*').eq('is_active', true).order('sort_number');
        const { data: transData } = await supabase.from('transfers').select('*').eq('is_active', true).order('sort_number');
        if (carsData) setCars(carsData);
        if (transData) setTransfers(transData);
        setLoading(false);
    };

    const handleBook = () => {
        if (!formData.name || !formData.phone || !formData.date || !bookingItem) {
            tg?.showAlert('Заполните обязательные поля');
            return;
        }

        const data = {
            type: 'quick_book',
            serviceType,
            itemId: bookingItem.id,
            itemTitle: serviceType === 'car' ? `${bookingItem.brand} ${bookingItem.model}` : `${bookingItem.from_location} - ${bookingItem.to_location}`,
            fullName: formData.name,
            phone: formData.phone,
            date: formData.date,
            price: serviceType === 'car' ? bookingItem.price_per_day : bookingItem.price,
            from: formData.from,
            to: formData.to,
            passengers: formData.passengers
        };

        tg?.sendData(JSON.stringify(data));
        setTimeout(() => tg?.close(), 100);
    };

    if (loading) return <div className="text-center p-10 text-slate-400">Loading catalog...</div>;

    return (
        <div className="space-y-6 pb-20">
            {/* Tabs */}
            <div className="flex p-1 bg-[#1a1a1d] rounded-2xl border border-white/5 mx-1">
                <button 
                    onClick={() => setServiceType('car')}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${serviceType === 'car' ? 'bg-primary text-on-primary shadow-lg' : 'text-slate-400'}`}
                >
                    🚗 {lang === 'ru' ? 'Аренда авто' : 'Car Rental'}
                </button>
                <button 
                    onClick={() => setServiceType('transfer')}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${serviceType === 'transfer' ? 'bg-primary text-on-primary shadow-lg' : 'text-slate-400'}`}
                >
                    ✈️ {lang === 'ru' ? 'Трансферы' : 'Transfers'}
                </button>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 gap-6">
                {serviceType === 'car' ? cars.map(car => (
                    <div key={car.id} onClick={() => setSelectedItem(car)} className="bg-[#1a1a1d] rounded-[32px] overflow-hidden border border-white/5 shadow-2xl active:scale-[0.98] transition-all cursor-pointer">
                        <div className="relative aspect-[16/10]">
                            <img src={car.image_url || car.image_urls?.[0]} className="w-full h-full object-cover" alt="" />
                            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase border border-white/10">
                                {car.city}
                            </div>
                        </div>
                        <div className="p-6">
                            <h3 className="text-xl font-black text-white">{car.brand} {car.model}</h3>
                            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">{car.body_style} • {car.transmission}</p>
                            <div className="flex items-center justify-between mt-4">
                                <div className="text-primary font-black text-2xl">${car.price_per_day} <span className="text-xs text-slate-500 font-normal">/ day</span></div>
                                <button className="bg-white/5 px-4 py-2 rounded-xl text-[10px] font-bold uppercase text-white border border-white/5">Details</button>
                            </div>
                        </div>
                    </div>
                )) : transfers.map(t => (
                    <div key={t.id} onClick={() => setSelectedItem(t)} className="bg-[#1a1a1d] rounded-[32px] overflow-hidden border border-white/5 shadow-2xl active:scale-[0.98] transition-all cursor-pointer">
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="flex-1 text-center">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">From</p>
                                    <p className="font-bold text-white leading-tight">{t.from_location}</p>
                                </div>
                                <div className="text-primary">➡️</div>
                                <div className="flex-1 text-center">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">To</p>
                                    <p className="font-bold text-white leading-tight">{t.to_location}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <p className="text-xs text-slate-400">{t.car_type}</p>
                                <p className="text-xl font-black text-primary">${t.price}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal & Booking Form... (omitting detailed UI for brevity in replace call, but keeping core logic) */}
            {selectedItem && (
                <div className="fixed inset-0 z-[100] bg-[#0f0f11] overflow-y-auto p-6">
                     <button onClick={() => setSelectedItem(null)} className="absolute top-6 right-6 w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white border border-white/5 z-10">
                         <span className="material-symbols-outlined">close</span>
                     </button>
                     <img src={selectedItem.image_url || selectedItem.image_urls?.[0]} className="w-full aspect-video object-cover rounded-3xl mb-6 shadow-2xl" alt="" />
                     <h2 className="text-3xl font-black text-white mb-2">
                        {serviceType === 'car' ? `${selectedItem.brand} ${selectedItem.model}` : `${selectedItem.from_location} ➡️ ${selectedItem.to_location}`}
                     </h2>
                     <p className="text-slate-400 text-sm leading-relaxed mb-8">{selectedItem.description}</p>
                     
                     <div className="sticky bottom-4">
                        <button 
                            onClick={() => { setBookingItem(selectedItem); setSelectedItem(null); }}
                            className="w-full bg-primary text-on-primary py-5 rounded-3xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all"
                        >
                            {lang === 'ru' ? 'Забронировать' : 'Book Now'}
                        </button>
                     </div>
                </div>
            )}

            {bookingItem && (
                <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setBookingItem(null)} />
                    <div className="relative w-full max-w-sm bg-[#1a1a1d] rounded-[32px] p-8 border border-white/5 shadow-2xl space-y-6">
                        <h4 className="text-xl font-black text-white text-center">
                            {lang === 'ru' ? 'Оформление заявки' : 'Booking Form'}
                        </h4>
                        
                        <div className="space-y-4">
                            <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder="ФИО / Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder="Телефон / Phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder="Дата / Date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                            {serviceType === 'car' ? (
                                <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder="Место подачи / Pickup Location" value={formData.from} onChange={e => setFormData({...formData, from: e.target.value})} />
                            ) : (
                                <>
                                    <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder="Откуда / From" value={formData.from} onChange={e => setFormData({...formData, from: e.target.value})} />
                                    <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder="Куда / To" value={formData.to} onChange={e => setFormData({...formData, to: e.target.value})} />
                                    <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder="Пассажиров / Passengers" value={formData.passengers} onChange={e => setFormData({...formData, passengers: e.target.value})} />
                                </>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                             <button onClick={() => setBookingItem(null)} className="flex-1 py-4 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold uppercase">Cancel</button>
                             <button onClick={handleBook} className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all">Confirm Order</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
