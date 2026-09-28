"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Focus, Maximize2, Minus, Plus, RefreshCcw, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;

type ViewState = { scale: number; x: number; y: number };
type ImageSize = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactElement }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-xl text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {children}
    </button>
  );
}

export function ImageLightbox({ src, alt, children }: { src: string; alt: string; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const imageSizeRef = useRef(imageSize);
  const fitScaleRef = useRef(fitScale);
  const isFitRef = useRef(true);
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0 });

  const commitView = useCallback((next: ViewState) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const constrain = useCallback((next: ViewState) => {
    const stage = stageRef.current;
    const size = imageSizeRef.current;
    if (!stage || !size.width || !size.height) return next;

    const displayedWidth = size.width * next.scale;
    const displayedHeight = size.height * next.scale;
    const maxX = Math.max(0, (displayedWidth - stage.clientWidth) / 2);
    const maxY = Math.max(0, (displayedHeight - stage.clientHeight) / 2);
    return { ...next, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, []);

  const calculateFit = useCallback(() => {
    const stage = stageRef.current;
    const size = imageSizeRef.current;
    if (!stage || !size.width || !size.height) return 1;

    // Reserve space for the toolbar while still using nearly all of the viewport width.
    const availableWidth = stage.clientWidth * 0.92;
    const availableHeight = Math.max(160, (stage.clientHeight - 116) * 0.94);
    return clamp(Math.min(availableWidth / size.width, availableHeight / size.height), MIN_SCALE, MAX_SCALE);
  }, []);

  const fitToWindow = useCallback(() => {
    const nextFit = calculateFit();
    fitScaleRef.current = nextFit;
    setFitScale(nextFit);
    isFitRef.current = true;
    commitView({ scale: nextFit, x: 0, y: 0 });
  }, [calculateFit, commitView]);

  const zoomAt = useCallback((targetScale: number, clientX?: number, clientY?: number) => {
    const stage = stageRef.current;
    const current = viewRef.current;
    if (!stage) return;

    const scale = clamp(targetScale, MIN_SCALE, MAX_SCALE);
    const rect = stage.getBoundingClientRect();
    const anchorX = clientX === undefined ? 0 : clientX - (rect.left + rect.width / 2);
    const anchorY = clientY === undefined ? 0 : clientY - (rect.top + rect.height / 2);
    const ratio = scale / current.scale;
    const next = constrain({
      scale,
      x: anchorX - (anchorX - current.x) * ratio,
      y: anchorY - (anchorY - current.y) * ratio,
    });

    isFitRef.current = Math.abs(scale - fitScaleRef.current) < 0.001 && next.x === 0 && next.y === 0;
    commitView(next);
  }, [commitView, constrain]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setDragging(false);
      isFitRef.current = true;
      commitView({ scale: 1, x: 0, y: 0 });
    }
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const nextSize = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
    imageSizeRef.current = nextSize;
    setImageSize(nextSize);
    requestAnimationFrame(fitToWindow);
  };

  useEffect(() => {
    if (!open) return;
    const stage = stageRef.current;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(viewRef.current.scale * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
    stage?.addEventListener("wheel", wheel, { passive: false });
    return () => stage?.removeEventListener("wheel", wheel);
  }, [open, zoomAt]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const next = constrain({
      ...viewRef.current,
      x: dragRef.current.originX + event.clientX - dragRef.current.startX,
      y: dragRef.current.originY + event.clientY - dragRef.current.startY,
    });
    isFitRef.current = false;
    commitView(next);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.pointerId = -1;
    setDragging(false);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLImageElement>) => {
    event.stopPropagation();
    if (!isFitRef.current) {
      fitToWindow();
      return;
    }
    const enlargedScale = Math.min(MAX_SCALE, Math.max(1, fitScaleRef.current * 2));
    zoomAt(enlargedScale, event.clientX, event.clientY);
  };

  const showOriginalSize = () => {
    isFitRef.current = false;
    commitView(constrain({ scale: 1, x: 0, y: 0 }));
  };

  useEffect(() => {
    if (!open) return;

    const handleResize = () => {
      const nextFit = calculateFit();
      fitScaleRef.current = nextFit;
      setFitScale(nextFit);
      if (isFitRef.current) commitView({ scale: nextFit, x: 0, y: 0 });
      else commitView(constrain(viewRef.current));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateFit, commitView, constrain, open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-black/88 p-0 text-white shadow-none sm:max-w-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">放大查看题目原图</DialogTitle>

        <div
          ref={stageRef}
          role="presentation"
          className="relative h-full w-full overflow-hidden overscroll-none select-none"
          onClick={(event) => { if (event.target === event.currentTarget) handleOpenChange(false); }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={handleImageLoad}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onDoubleClick={handleDoubleClick}
            className={`absolute top-1/2 left-1/2 max-w-none touch-none rounded-sm bg-white shadow-2xl will-change-transform ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{
              width: imageSize.width || undefined,
              height: imageSize.height || undefined,
              transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px)) scale(${view.scale})`,
              transition: dragging ? "none" : "transform 160ms ease-out",
            }}
          />
        </div>

        <button
          type="button"
          title="关闭预览 (Esc)"
          aria-label="关闭预览"
          onClick={() => handleOpenChange(false)}
          className="absolute top-4 right-4 grid size-11 place-items-center rounded-full border border-white/15 bg-black/55 text-white/90 shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <X className="size-5" />
        </button>

        <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border border-white/15 bg-slate-950/80 p-1.5 shadow-2xl backdrop-blur-xl">
          <ToolButton label="缩小" onClick={() => zoomAt(viewRef.current.scale / ZOOM_STEP)}><Minus className="size-5" /></ToolButton>
          <span className="w-16 shrink-0 text-center text-sm font-medium tabular-nums text-white" aria-live="polite">{Math.round(view.scale * 100)}%</span>
          <ToolButton label="放大" onClick={() => zoomAt(viewRef.current.scale * ZOOM_STEP)}><Plus className="size-5" /></ToolButton>
          <span className="mx-1 h-6 w-px shrink-0 bg-white/15" />
          <ToolButton label={`适应窗口 (${Math.round(fitScale * 100)}%)`} onClick={fitToWindow}><Maximize2 className="size-4.5" /></ToolButton>
          <ToolButton label="原始比例 (100%)" onClick={showOriginalSize}><Focus className="size-4.5" /></ToolButton>
          <ToolButton label="重置预览" onClick={fitToWindow}><RefreshCcw className="size-4.5" /></ToolButton>
        </div>

        <p className="pointer-events-none absolute top-5 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/35 px-3 py-1.5 text-xs text-white/65 backdrop-blur sm:block">
          滚轮缩放 · 拖动查看 · 双击放大或还原
        </p>
      </DialogContent>
    </Dialog>
  );
}
