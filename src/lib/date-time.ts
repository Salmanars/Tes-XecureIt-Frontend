export function formatJakartaDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const datePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const timeParts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => timeParts.find((item) => item.type === type)?.value || '00';

  return `${datePart}, ${part('hour')}:${part('minute')}:${part('second')}`;
}
