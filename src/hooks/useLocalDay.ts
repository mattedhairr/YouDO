import { useEffect, useState } from 'react';
import { nextLocalMidnight, todayISO } from '../lib/dates';

export function useLocalDay() {
  const [day, setDay] = useState(todayISO);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setDay(todayISO());
      clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(50, nextLocalMidnight(Date.now()) - Date.now() + 25));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return day;
}
