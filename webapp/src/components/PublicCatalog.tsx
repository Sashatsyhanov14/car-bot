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
    sending: { ru: 'Отправка...', en: 'Sending...', tr: 'Gönderiliyor...', de: 'Senden...', pl: 'Wysyłanie...', ar: 'جاري الإرسال...', fa: 'در حال ارسال...' },
    day: { ru: '/ день', en: '/ day', tr: '/ gün', de: '/ tag', pl: '/ dzień', ar: '/ يوم', fa: '/ روز' },
    search_placeholder: { ru: 'Поиск по городу...', en: 'Search by city...', tr: 'Şehre göre ara...', de: 'Suche nach Stadt...', pl: 'Szukaj według miasta...', ar: 'بحث حسب المدينة...', fa: 'جستجو بر اساس شهر...' }
};

export default function PublicCatalog({ lang }: { t: any, lang: string }) {
    const [serviceType, setServiceType] = useState<'car' | 'transfer'>('car');
    const [cars, setCars] = useState<Car[]>([]);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [bookingItem, setBookingItem] = useState<any>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', phone: '', date: '', from: '', to: '', passengers: '1' });
    const [searchQuery, setSearchQuery] = useState('');

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

    const handleBook = async () => {
        if (isSubmitting) return;
        
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

        const initDataUnsafe = window.Telegram?.WebApp?.initDataUnsafe;
        const telegramId = initDataUnsafe?.user?.id;
        const userName = initDataUnsafe?.user?.username || initDataUnsafe?.user?.first_name || 'WebAppUser';

        setIsSubmitting(true);

        try {
            await fetch('/api/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId, userName, lang: currentLang, data })
            });

            // Also try sendData as a fallback for closing mechanisms in some clients
            tg?.sendData(JSON.stringify(data));
        } catch (e) {
            console.error('Booking failed:', e);
        }

        setTimeout(() => {
            setIsSubmitting(false); // In case tg?.close() fails
            tg?.close();
        }, 100);
    };


    if (loading) return <div className="text-center p-10 text-slate-400">Loading catalog...</div>;
    
    const getFlagData = (countryName: string) => {
        if (!countryName) return { emoji: '🏳️', code: '' };
        const c = countryName.toLowerCase();
        if (c.includes('turk') || c.includes('турц') || c.includes('türkiye') || c.includes('alanya') || c.includes('istanbul')) return { emoji: '🇹🇷', code: 'tr' };
        if (c.includes('europ') || c.includes('европ') || c.includes('avrupa')) return { emoji: '🇪🇺', code: 'eu' };
        if (c.includes('usa') || c.includes('сша') || c.includes('abd')) return { emoji: '🇺🇸', code: 'us' };
        if (c.includes('thai') || c.includes('таил')) return { emoji: '🇹🇭', code: 'th' };
        if (c.includes('viet') || c.includes('вьет')) return { emoji: '🇻🇳', code: 'vn' };
        if (c.includes('isra') || c.includes('изра') || c.includes('israil')) return { emoji: '🇮🇱', code: 'il' };
        if (c.includes('emir') || c.includes('оаэ') || c.includes('bae') || c.includes('dubai') || c.includes('uae')) return { emoji: '🇦🇪', code: 'ae' };
        if (c.includes('egypt') || c.includes('егип') || c.includes('mısır')) return { emoji: '🇪🇬', code: 'eg' };
        if (c.includes('georg') || c.includes('груз')) return { emoji: '🇬🇪', code: 'ge' };
        if (c.includes('armen') || c.includes('армен')) return { emoji: '🇦🇲', code: 'am' };
        if (c.includes('kazak') || c.includes('казак')) return { emoji: '🇰🇿', code: 'kz' };
        if (c.includes('azer') || c.includes('азер')) return { emoji: '🇦🇿', code: 'az' };
        if (c.includes('uzbek') || c.includes('узбек')) return { emoji: '🇺🇿', code: 'uz' };
        if (c.includes('ru') || c.includes('rus') || c.includes('рф') || c.includes('russia') || c.includes('россия')) return { emoji: '🇷🇺', code: 'ru' };
        if (c.includes('saudi') || c.includes('сауд')) return { emoji: '🇸🇦', code: 'sa' };
        if (c.includes('chin') || c.includes('кит')) return { emoji: '🇨🇳', code: 'cn' };
        if (c.includes('ukraine') || c.includes('украин')) return { emoji: '🇺🇦', code: 'ua' };
        if (c.includes('middle east') || c.includes('восток') || c.includes('орта доғу')) return { emoji: '🏜️', code: 'un' };
        if (c.includes('asia') || c.includes('азия')) return { emoji: '🌏', code: 'un' };
        if (c.includes('africa') || c.includes('африка')) return { emoji: '🌍', code: 'un' };
        if (c.includes('latin') || c.includes('латин')) return { emoji: '🌎', code: 'un' };
        return { emoji: '📍', code: '' };
    };

    const FlagIcon = ({ country }: { country: string }) => {
        const data = getFlagData(country);
        const flagCode = data.code || 'un'; // Fallback to UN for real flag look
        return (
            <img 
                src={`https://flagcdn.com/w40/${flagCode}.png`} 
                alt={country}
                className="w-4 h-3 object-cover rounded-[1px] shadow-sm border border-white/10"
                onError={(e) => {
                    (e.target as any).style.display = 'none';
                    const span = document.createElement('span');
                    span.innerText = data.emoji;
                    span.className = "text-[10px]";
                    (e.target as any).parentNode.appendChild(span);
                }}
            />
        );
    };

    const getItemField = (item: any, field: string) => {
        const localized = item[`${field}_${currentLang}`];
        return localized || item[field];
    };

    return (
        <div className="space-y-6 pb-20 px-2 animate-in fade-in duration-500">
            {/* Premium segmented control */}
            <div className="sticky top-0 z-50 pt-2 pb-4 bg-[#0f0f11]/80 backdrop-blur-xl">
                <div className="relative flex p-1 bg-[#1a1a1d]/60 backdrop-blur-md rounded-2xl border border-white/5 mx-1 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                    <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-primary shadow-lg transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${serviceType === 'car' ? 'translate-x-0' : 'translate-x-[calc(100%+8px)]'}`} />
                    <button 
                        onClick={() => setServiceType('car')}
                        className={`relative flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-colors duration-300 z-10 flex items-center justify-center gap-2 ${serviceType === 'car' ? 'text-on-primary' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <span className="material-symbols-outlined text-[16px]">directions_car</span>
                        {t('car_rental')}
                    </button>
                    <button 
                        onClick={() => setServiceType('transfer')}
                        className={`relative flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-colors duration-300 z-10 flex items-center justify-center gap-2 ${serviceType === 'transfer' ? 'text-on-primary' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <span className="material-symbols-outlined text-[16px]">route</span>
                        {t('transfers')}
                    </button>
                </div>
            </div>

            {/* Premium Search Bar */}
            <div className="px-1 -mt-2 mb-2">
                <div className="relative group">
                    <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-xl group-focus-within:bg-primary/10 transition-all duration-500" />
                    <div className="relative flex items-center bg-[#1a1a1d]/80 rounded-2xl border border-white/5 backdrop-blur-md overflow-hidden transition-all duration-300 focus-within:border-primary/30 group">
                        <span className="material-symbols-outlined absolute left-4 text-slate-500 group-focus-within:text-primary transition-colors text-[20px]">search</span>
                        <input 
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('search_placeholder')}
                            className="w-full bg-transparent border-none py-4 pl-12 pr-12 text-sm font-bold text-white placeholder:text-slate-600 outline-none"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-4 text-slate-500 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 gap-6">
                {serviceType === 'car' ? cars.filter(car => 
                    !searchQuery || car.city.toLowerCase().includes(searchQuery.toLowerCase())
                ).map(car => (
                    <div key={car.id} onClick={() => setSelectedItem(car)} className="group relative bg-[#1a1a1d] rounded-[32px] overflow-hidden border border-white/[0.08] shadow-2xl active:scale-[0.98] transition-all duration-300 cursor-pointer hover:shadow-primary/10">
                        {/* Glow effect behind the card */}
                        <div className="absolute inset-0 bg-gradient-to-b from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        
                        <div className="relative aspect-[16/10] overflow-hidden">
                            <img src={car.image_url || car.image_urls?.[0]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1d] via-[#1a1a1d]/20 to-transparent" />
                            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-xl px-3 py-1.5 rounded-full text-[10px] font-bold text-white uppercase border border-white/10 flex items-center gap-2 shadow-lg">
                                <FlagIcon country={car.city} />
                                {car.city}
                            </div>
                        </div>
                        <div className="p-6 pt-2 relative z-10">
                            <h3 className="text-2xl font-black text-white tracking-tight">{car.brand} <span className="font-medium text-slate-300">{car.model}</span></h3>
                            {getItemField(car, 'body_style') && (
                                <div className="flex gap-2 mt-3">
                                    <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-[9px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px] text-primary">directions_car</span>
                                        {getItemField(car, 'body_style')}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-end justify-between mt-6">
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">От</p>
                                    <div className="text-primary font-black text-3xl leading-none">${car.price_per_day} <span className="text-xs text-slate-500 font-bold">{t('day')}</span></div>
                                </div>
                                <div className="w-12 h-12 rounded-2xl bg-primary text-black flex items-center justify-center shadow-lg shadow-primary/20 group-hover:bg-primary-light transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )) : transfers.filter(t_item => 
                    !searchQuery || 
                    t_item.from_location.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    t_item.to_location.toLowerCase().includes(searchQuery.toLowerCase())
                ).map(t_item => (
                    <div key={t_item.id} onClick={() => setSelectedItem(t_item)} className="group relative bg-gradient-to-br from-[#1a1a1d] to-[#141416] rounded-[32px] overflow-hidden border border-white/5 shadow-2xl active:scale-[0.98] transition-all duration-300 cursor-pointer">
                        {t_item.image_url && (
                             <div className="relative aspect-[16/7] overflow-hidden">
                                 <img src={t_item.image_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                                 <div className="absolute inset-0 bg-gradient-to-t from-[#141416] to-transparent opacity-80" />
                             </div>
                        )}
                        <div className="p-6 relative z-10">
                            {/* Route Visualizer */}
                            <div className="flex items-center gap-4 mb-6">
                                <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-4 text-center relative overflow-hidden backdrop-blur-md">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-2xl" />
                                    <p className="text-[9px] font-black tracking-widest text-slate-500 uppercase flex items-center justify-center gap-1 mb-1">
                                        <span className="material-symbols-outlined text-[14px]">flight_land</span> {t('placeholder_from')}
                                    </p>
                                    <p className="font-bold text-white text-sm">{getItemField(t_item, 'from_location')}</p>
                                </div>
                                <div className="flex-shrink-0 flex items-center justify-center relative">
                                    <div className="absolute w-[60px] h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent dashed-line opacity-50" />
                                    <div className="w-8 h-8 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center z-10">
                                        <span className="material-symbols-outlined text-primary text-[14px]">moving</span>
                                    </div>
                                </div>
                                <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-4 text-center relative overflow-hidden backdrop-blur-md">
                                    <div className="absolute top-0 left-0 w-16 h-16 bg-purple-500/10 rounded-full blur-2xl" />
                                    <p className="text-[9px] font-black tracking-widest text-slate-500 uppercase flex items-center justify-center gap-1 mb-1">
                                        <span className="material-symbols-outlined text-[14px]">pin_drop</span> {t('placeholder_to')}
                                    </p>
                                    <p className="font-bold text-white text-sm">{getItemField(t_item, 'to_location')}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <div className="flex items-center gap-2 text-slate-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                                    <span className="material-symbols-outlined text-[16px]">airport_shuttle</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{t_item.car_type}</span>
                                </div>
                                <div className="text-3xl font-black text-primary">${t_item.price}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {selectedItem && (
                <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#0f0f11] animate-in slide-in-from-bottom-full duration-500">
                    <div className="relative min-h-[50vh]">
                        <img src={selectedItem.image_url || selectedItem.image_urls?.[0]} className="w-full h-[50vh] object-cover" alt="" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f11] via-[#0f0f11]/60 to-transparent" />
                        <button onClick={() => setSelectedItem(null)} className="absolute top-6 right-6 w-12 h-12 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center text-white border border-white/10 z-10 hover:bg-white/10 transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    
                    <div className="px-6 -mt-16 relative z-20 pb-32">
                        <h2 className="text-4xl font-black text-white tracking-tight mb-2 flex flex-col">
                            {serviceType === 'car' ? (
                                <>
                                    <span>{selectedItem.brand}</span>
                                    <span className="text-slate-300 font-medium text-3xl">{selectedItem.model}</span>
                                </>
                            ) : (
                                <span className="text-2xl">{getItemField(selectedItem, 'from_location')} → {getItemField(selectedItem, 'to_location')}</span>
                            )}
                        </h2>

                        {serviceType === 'transfer' && (
                            <div className="flex items-center gap-3 mt-6 bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
                                <span className="material-symbols-outlined text-primary mb-1">airport_shuttle</span>
                                <div>
                                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Класс авто</p>
                                    <p className="text-sm text-slate-200 font-bold uppercase">{selectedItem.car_type}</p>
                                </div>
                            </div>
                        )}

                        <div className="mt-8 bg-[#1a1a1d] p-6 rounded-[32px] border border-white/5 shadow-xl">
                            <h4 className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-3">{currentLang === 'ru' ? 'Об автомобиле' : 'About Vehicle'}</h4>
                            <p className="text-slate-300 text-sm leading-relaxed">{getItemField(selectedItem, 'description') || (currentLang === 'ru' ? 'Описание скоро появится...' : 'Description coming soon...')}</p>
                        </div>
                    </div>
                     
                     <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0f0f11] via-[#0f0f11] to-transparent z-30 pt-10">
                        <div className="max-w-md mx-auto flex items-center gap-4 bg-[#1a1a1d]/90 backdrop-blur-2xl p-2 pl-6 rounded-[32px] border border-white/10 shadow-2xl">
                            <div className="flex-shrink-0">
                                <span className="text-xs text-slate-500 block font-bold mb-0.5 tracking-widest">{serviceType === 'car' ? t('day') : 'Price'}</span>
                                <span className="text-3xl font-black text-white">${serviceType === 'car' ? selectedItem.price_per_day : selectedItem.price}</span>
                            </div>
                            <button 
                                onClick={() => { setBookingItem(selectedItem); setSelectedItem(null); }}
                                className="flex-1 bg-primary text-black py-4 rounded-3xl font-black uppercase text-sm tracking-widest shadow-xl active:scale-95 transition-all hover:brightness-110 flex items-center justify-center gap-2"
                            >
                                {t('book_now')} <span className="material-symbols-outlined text-[18px]">verified</span>
                            </button>
                        </div>
                     </div>
                </div>
            )}

            {bookingItem && (
                <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={() => setBookingItem(null)} />
                    <div className="relative w-full max-w-sm bg-gradient-to-b from-[#222226] to-[#1a1a1d] rounded-[36px] p-6 border border-white/10 shadow-[0_0_60px_-15px_rgba(255,255,255,0.1)] space-y-6 animate-in slide-in-from-bottom-8">
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-2" />
                        
                        <div className="text-center">
                            <h4 className="text-xl font-black text-white">{t('booking_form')}</h4>
                            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-1">Оставьте контактные данные</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">person</span>
                                <input className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600" placeholder={t('placeholder_name')} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">call</span>
                                <input className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600" placeholder={t('placeholder_phone')} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            </div>
                            <div className="relative group">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">calendar_month</span>
                                <input className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600" placeholder={t('placeholder_date')} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                            </div>
                            
                            {serviceType === 'transfer' && (
                                <div className="space-y-4 pt-2 border-t border-white/5">
                                    <div className="flex gap-2">
                                        <input className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold text-white outline-none focus:border-primary/50 placeholder:text-slate-600 delay-100" placeholder={t('placeholder_from')} value={formData.from} onChange={e => setFormData({...formData, from: e.target.value})} />
                                        <span className="material-symbols-outlined text-primary self-center">east</span>
                                        <input className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold text-white outline-none focus:border-primary/50 placeholder:text-slate-600 delay-100" placeholder={t('placeholder_to')} value={formData.to} onChange={e => setFormData({...formData, to: e.target.value})} />
                                    </div>
                                    <div className="relative group">
                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">group</span>
                                        <input type="number" min="1" max="10" className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600" placeholder={t('placeholder_passengers')} value={formData.passengers} onChange={e => setFormData({...formData, passengers: e.target.value})} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-4">
                             <button onClick={() => setBookingItem(null)} disabled={isSubmitting} className={`w-1/3 py-4 bg-white/5 text-slate-400 rounded-2xl text-[10px] tracking-widest font-bold uppercase transition-all ${isSubmitting ? 'opacity-50' : 'hover:bg-white/10'}`}>{t('cancel')}</button>
                             <button onClick={handleBook} disabled={isSubmitting} className={`flex-1 py-4 ${isSubmitting ? 'bg-primary/50' : 'bg-primary'} text-black rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] active:scale-95 transition-all flex justify-center items-center gap-2`}>
                                 {isSubmitting ? <span className="material-symbols-outlined animate-spin text-[16px]">sync</span> : <span className="material-symbols-outlined text-[16px]">send</span>}
                                 {isSubmitting ? t('sending') : t('confirm')}
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

