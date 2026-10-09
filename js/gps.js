// Jednorázová poloha po stisku tlačítka, žádné watchPosition.
export const locate = () => new Promise((ok, no) => {
  if (!navigator.geolocation) return no({ code: 0 });
  navigator.geolocation.getCurrentPosition(p => ok(p.coords), no, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});
export const gpsMsg = e => e.code === 1 ? 'Pro ověření stanoviště potřebujeme přístup k vaší poloze.'
  : e.code === 3 ? 'Nepodařilo se získat aktuální polohu. Zkuste to znovu.'
  : 'Poloha není dostupná. Povolte prosím přístup k poloze a zkuste to znovu.';
