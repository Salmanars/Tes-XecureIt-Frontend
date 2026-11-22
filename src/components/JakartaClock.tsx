'use client';

import { useEffect, useState } from 'react';
import { formatJakartaDateTime } from '@/lib/date-time';

export function JakartaClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) return <time aria-label="Waktu saat ini">Memuat waktu…</time>;
  return <time dateTime={now.toISOString()}>{formatJakartaDateTime(now)}</time>;
}
