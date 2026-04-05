import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Car {
    id: string;
    brand: string;
    model: string;
    city: string;
    price_per_day: number;
    body_style: string;
    body_style_en?: string; body_style_tr?: string; body_style_de?: string; body_style_pl?: string; body_style_ar?: string; body_style_fa?: string;
    transmission: string;
    transmission_en?: string; transmission_tr?: string; transmission_de?: string; transmission_pl?: string; transmission_ar?: string; transmission_fa?: string;
    fuel_type: string;
    fuel_type_en?: string; fuel_type_tr?: string; fuel_type_de?: string; fuel_type_pl?: string; fuel_type_ar?: string; fuel_type_fa?: string;
    description: string;
    description_en?: string; description_tr?: string; description_de?: string; description_pl?: string; description_ar?: string; description_fa?: string;
    image_url: string;
    image_urls: string[];
}

interface Transfer {
    id: string;
    from_location: string;
    from_location_en?: string; from_location_tr?: string; from_location_de?: string; from_location_pl?: string; from_location_ar?: string; from_location_fa?: string;
    to_location: string;
    to_location_en?: string; to_location_tr?: string; to_location_de?: string; to_location_pl?: string; to_location_ar?: string; to_location_fa?: string;
    car_type: string;
    price: number;
    description: string;
    description_en?: string; description_tr?: string; description_de?: string; description_pl?: string; description_ar?: string; description_fa?: string;
    image_url: string;
}

const UI_TRANSLATIONS: any = {
    car_rental: { ru: 'Аренда авто', en: 'Car Rental', tr: 'Araç Kiralama', de: 'Mietwagen', pl: 'Wynajem aut', ar: 'تأجير السيارات', fa: 'اجاره خودرو' },
    transfers: { ru: 'Трансферы', en: 'Transfers', tr: 'Transferler', de: 'Transfers', pl: 'Transfery', ar: 'النقل', fa: 'ترانسفر' },
    book_now: { ru: 'Забронировать', en: 'Book Now', tr: 'Şimdi Rezervasyon Yap', de: 'Jetzt buchen', pl: 'Zarezerwuj teraz', ar: 'احجز الآن', fa: 'رزرو کنید' },
    booking_form: { ru: 'Оформление заявки', en: 'Booking Form', tr: 'Rezervasyon Formu', de: 'Buchungsformular', pl: 'Formularz rezerwacji', ar: 'نموذج الحجز', fa: 'فرم رزرو' },
    placeholder_name: { ru: 'ФИО / Full Name', en: 'Full Name', tr: 'Ad Soyad', de: 'Vollständiger Name', pl: 'Imię и Nazwisko', ar: 'الاسم الكامل', fa: 'نام کامل' },
    placeholder_phone: { ru: 'Телефон / Phone', en: 'Phone Number', tr: 'Telefon', de: 'Telefonnummer', pl: 'Numer telefonu', ar: 'رقم الهاتف', fa: 'شماره تلفن' },
    placeholder_date: { ru: 'Дата / Date', en: 'Date', tr: 'Tarih', de: 'Datum', pl: 'Data', ar: 'التاريخ', fa: 'تاریخ' },
    placeholder_pickup: { ru: 'Место подачи', en: 'Pickup Location', tr: 'Alış Yeri', de: 'Abholort', pl: 'Miejsce odbioru', ar: 'مكان الاستلام', fa: 'مکان تحویل' },
    placeholder_from: { ru: 'Откуда', en: 'From', tr: 'Nereden', de: 'Von', pl: 'Z', ar: 'من', fa: 'از' },
    placeholder_to: { ru: 'Куда', en: 'To', tr: 'Nereye', de: 'Nach', pl: 'Do', ar: 'إلى', fa: 'به' },
    placeholder_passengers: { ru: 'Пассажиров', en: 'Passengers', tr: 'Yolcular', de: 'Passagiere', pl: 'Pasażerowie', ar: 'الركاب', fa: 'مسافران' },
    confirm: { ru: 'Подтвердить', en: 'Confirm Order', tr: 'Siparişi Onayla', de: 'Bestellung bestätigen', pl: 'Potwierdź zamówienie', ar: 'تأكيد الطلب', fa: 'تایید سفارش' },
    cancel: { ru: 'Отмена', en: 'Cancel', tr: 'İptal', de: 'Abbrechen', pl: 'Anuluj', ar: 'إلغاء', fa: 'لغو' },
    day: { ru: '/ день', en: '/ day', tr: '/ gün', de: '/ tag', pl: '/ dzień', ar: '/ يوم', fa: '/ روز' }
};

export default function PublicCatalog({ lang }: { t: any, lang: string }) {
    const [serviceType, setServiceType] = useState<'car' | 'transfer'>('car');
    const [cars, setCars] = useState<Car[]>([]);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [bookingItem, setBookingItem] = useState<any>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', date: '', from: '', to: '', passengers: '1' });

    const tg = window.Telegram?.WebApp;
    const currentLang = (lang || 'ru').toLowerCase() as string;
    const t = (key: string) => UI_TRANSLATIONS[key]?.[currentLang] || UI_TRANSLATIONS[key]?.['en'] || key;

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
            tg?.showAlert(currentLang === 'ru' ? 'Заполните обязательные поля' : 'Please fill all fields');
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

    const getItemField = (item: any, field: string) => {
        const localized = item[`${field}_${currentLang}`];
        return localized || item[field];
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Tabs */}
            <div className="flex p-1 bg-[#1a1a1d] rounded-2xl border border-white/5 mx-1">
                <button 
                    onClick={() => setServiceType('car')}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${serviceType === 'car' ? 'bg-primary text-on-primary shadow-lg' : 'text-slate-400'}`}
                >
                    {t('car_rental')}
                </button>
                <button 
                    onClick={() => setServiceType('transfer')}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${serviceType === 'transfer' ? 'bg-primary text-on-primary shadow-lg' : 'text-slate-400'}`}
                >
                    {t('transfers')}
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
                            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
                                {getItemField(car, 'body_style')} • {getItemField(car, 'transmission')}
                            </p>
                            <div className="flex items-center justify-between mt-4">
                                <div className="text-primary font-black text-2xl">${car.price_per_day} <span className="text-xs text-slate-500 font-normal">{t('day')}</span></div>
                                <button className="bg-white/5 px-4 py-2 rounded-xl text-[10px] font-bold uppercase text-white border border-white/5">Details</button>
                            </div>
                        </div>
                    </div>
                )) : transfers.map(t_item => (
                    <div key={t_item.id} onClick={() => setSelectedItem(t_item)} className="bg-[#1a1a1d] rounded-[32px] overflow-hidden border border-white/5 shadow-2xl active:scale-[0.98] transition-all cursor-pointer">
                        {t_item.image_url && (
                             <div className="relative aspect-[16/8]">
                                 <img src={t_item.image_url} className="w-full h-full object-cover" alt="" />
                             </div>
                        )}
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="flex-1 text-center">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">{t('placeholder_from')}</p>
                                    <p className="font-bold text-white leading-tight">{getItemField(t_item, 'from_location')}</p>
                                </div>
                                <div className="text-primary">→</div>
                                <div className="flex-1 text-center">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">{t('placeholder_to')}</p>
                                    <p className="font-bold text-white leading-tight">{getItemField(t_item, 'to_location')}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <p className="text-xs text-slate-400">{t_item.car_type}</p>
                                <p className="text-xl font-black text-primary">${t_item.price}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {selectedItem && (
                <div className="fixed inset-0 z-[100] bg-[#0f0f11] overflow-y-auto p-6">
                     <button onClick={() => setSelectedItem(null)} className="absolute top-6 right-6 w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white border border-white/5 z-10">
                         <span className="material-symbols-outlined">close</span>
                     </button>
                     <img src={selectedItem.image_url || selectedItem.image_urls?.[0]} className="w-full aspect-video object-cover rounded-3xl mb-6 shadow-2xl" alt="" />
                     <h2 className="text-3xl font-black text-white mb-2">
                        {serviceType === 'car' ? `${selectedItem.brand} ${selectedItem.model}` : `${getItemField(selectedItem, 'from_location')} → ${getItemField(selectedItem, 'to_location')}`}
                     </h2>

                     {serviceType === 'transfer' && (
                        <div className="flex items-center gap-2 mb-4 bg-white/5 p-2 rounded-xl border border-white/5">
                            <span className="material-symbols-outlined text-primary text-sm tracking-widest uppercase">AirportShuttle</span>
                            <span className="text-xs text-slate-300 font-bold tracking-widest uppercase">{selectedItem.car_type} • ${selectedItem.price}</span>
                        </div>
                     )}

                     <p className="text-slate-400 text-sm leading-relaxed mb-8">{getItemField(selectedItem, 'description') || (currentLang === 'ru' ? 'Описание скоро появится...' : 'Description coming soon...')}</p>
                     
                     <div className="sticky bottom-4">
                        <button 
                            onClick={() => { setBookingItem(selectedItem); setSelectedItem(null); }}
                            className="w-full bg-primary text-on-primary py-5 rounded-3xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all"
                        >
                            {t('book_now')}
                        </button>
                     </div>
                </div>
            )}

            {bookingItem && (
                <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setBookingItem(null)} />
                    <div className="relative w-full max-w-sm bg-[#1a1a1d] rounded-[32px] p-8 border border-white/5 shadow-2xl space-y-6">
                        <h4 className="text-xl font-black text-white text-center">
                            {t('booking_form')}
                        </h4>
                        
                        <div className="space-y-4">
                            <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder={t('placeholder_name')} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder={t('placeholder_phone')} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder={t('placeholder_date')} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                            {serviceType === 'car' ? (
                                <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder={t('placeholder_pickup')} value={formData.from} onChange={e => setFormData({...formData, from: e.target.value})} />
                            ) : (
                                <>
                                    <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder={t('placeholder_from')} value={formData.from} onChange={e => setFormData({...formData, from: e.target.value})} />
                                    <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder={t('placeholder_to')} value={formData.to} onChange={e => setFormData({...formData, to: e.target.value})} />
                                    <input className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm outline-none focus:border-primary" placeholder={t('placeholder_passengers')} value={formData.passengers} onChange={e => setFormData({...formData, passengers: e.target.value})} />
                                </>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                             <button onClick={() => setBookingItem(null)} className="flex-1 py-4 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold uppercase">{t('cancel')}</button>
                             <button onClick={handleBook} className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all">{t('confirm')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
