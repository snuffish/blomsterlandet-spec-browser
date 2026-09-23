const KR = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

export const formatPrice = (value: number): string => `${KR.format(value)} kr`;

export const formatPriceSpan = (min: number, max: number): string =>
  min === max ? formatPrice(min) : `${KR.format(min)}–${formatPrice(max)}`;

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

/** Product images are served by an imaging pipeline that honours width/format hints. */
export const thumbnail = (url: string, width = 320): string =>
  url ? `${url}${url.includes('?') ? '&' : '?'}width=${width}&format=webp&quality=80` : '';
