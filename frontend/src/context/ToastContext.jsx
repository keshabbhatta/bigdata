import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, CloudOff, AlertTriangle } from 'lucide-react';
import { cx } from '../components/ui.jsx';

const ToastContext = createContext(() => {});

const TONES = {
  ok: { bar: 'border-l-[#3ccfa9]', Icon: CheckCircle2 },
  pending: { bar: 'border-l-marigold', Icon: CloudOff },
  bad: { bar: 'border-l-[#ff6b86]', Icon: AlertTriangle },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed bottom-5 left-1/2 z-[80] flex w-[min(440px,calc(100%-24px))] -translate-x-1/2 flex-col gap-2 md:bottom-5">
        {toasts.map(({ id, message, tone }) => {
          const { bar, Icon } = TONES[tone] || TONES.ok;
          return (
            <div key={id} className={cx('flex animate-rise items-center gap-2.5 rounded-[10px] border-l-4 bg-ink px-4 py-3 text-sm text-white shadow-2xl', bar)}>
              <Icon size={18} className="flex-none" /> {message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
