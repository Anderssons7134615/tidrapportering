import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

type Options = {
  root: RefObject<HTMLElement>;
  jobs: RefObject<HTMLDivElement>;
  onStart: (row: number) => boolean;
  onHover: (job: number | null) => void;
  onDrop: (job: number) => void;
  onCancel: () => void;
};
type Gesture = { id: number; row: number; target: HTMLButtonElement; startX: number; startY: number; x: number; y: number; active: boolean };

/** Touch/pen adapter only. Assignment rules and desktop drag stay in the caller. */
export function usePlanningTouchDrag(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number>();
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ row: number; x: number; y: number } | null>(null);

  function reset() {
    const current = gesture.current;
    gesture.current = null;
    if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    frame.current = undefined;
    if (current?.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
  }
  function cancel() { reset(); setPreview(null); }
  function jobAt(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-planning-job]');
    return element && latest.current.root.current?.contains(element) ? Number(element.dataset.planningJob) : null;
  }
  function track() {
    const current = gesture.current;
    if (!current?.active) return;
    const { x, y } = current;
    const list = latest.current.jobs.current;
    const bounds = list?.getBoundingClientRect();
    const speed = (position: number, low: number, high: number) => position < low + 48 ? -10 : position > high - 48 ? 10 : 0;
    let scrolledList = false;
    if (list && bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
      const before = list.scrollTop;
      list.scrollTop += speed(y, Math.max(0, bounds.top), Math.min(window.innerHeight, bounds.bottom));
      scrolledList = list.scrollTop !== before;
    }
    if (!scrolledList) {
      const delta = speed(y, 0, window.innerHeight);
      if (delta) window.scrollBy(0, delta);
    }
    latest.current.onHover(jobAt(x, y));
    frame.current = window.requestAnimationFrame(track);
  }
  useEffect(() => {
    const abort = () => { if (gesture.current) { cancel(); latest.current.onCancel(); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') abort(); };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', abort);
    return () => { reset(); window.removeEventListener('keydown', escape); window.removeEventListener('blur', abort); };
  }, []);

  function bindings(row: number) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') { suppressClick.current = false; return; }
        if (event.isPrimary === false || event.button !== 0 || gesture.current || event.currentTarget.disabled) return;
        suppressClick.current = false;
        gesture.current = { id: event.pointerId, row, target: event.currentTarget, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        current.x = event.clientX; current.y = event.clientY;
        if (!current.active) {
          if (Math.hypot(current.x - current.startX, current.y - current.startY) < 8) return;
          if (!latest.current.onStart(current.row)) { cancel(); return; }
          current.active = true;
          suppressClick.current = true;
          frame.current = window.requestAnimationFrame(track);
        }
        event.preventDefault();
        latest.current.onHover(jobAt(current.x, current.y));
        setPreview({ row, x: current.x, y: current.y });
      },
      onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const job = current.active ? jobAt(event.clientX, event.clientY) : null;
        cancel();
        if (current.active && job !== null) latest.current.onDrop(job);
        else latest.current.onCancel();
      },
      onPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
        if (gesture.current?.id === event.pointerId) { cancel(); latest.current.onCancel(); }
      },
      onLostPointerCapture(event: ReactPointerEvent<HTMLButtonElement>) {
        if (gesture.current?.id === event.pointerId) { cancel(); latest.current.onCancel(); }
      },
      onClickCapture(event: React.MouseEvent<HTMLButtonElement>) {
        if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
      },
    };
  }
  return { bindings, cancel, preview, isTracking: () => gesture.current !== null };
}
