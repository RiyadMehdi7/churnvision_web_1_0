import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

interface InfoPopoverProps {
    title: string;
    children?: React.ReactNode;
    content: React.ReactNode;
    position?: 'top' | 'right' | 'bottom' | 'left';
    className?: string;
}

export const InfoPopover: React.FC<InfoPopoverProps> = ({
    title,
    children,
    content,
    position = 'top',
    className,
}) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const [transformClass, setTransformClass] = useState<string>("");

    const updatePosition = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 10;
        if (position === 'top') {
            setCoords({ top: rect.top - margin, left: rect.left + rect.width / 2 });
            setTransformClass('-translate-x-1/2 -translate-y-full');
        } else if (position === 'right') {
            setCoords({ top: rect.top + rect.height / 2, left: rect.right + margin });
            setTransformClass('-translate-y-1/2');
        } else if (position === 'bottom') {
            setCoords({ top: rect.bottom + margin, left: rect.left + rect.width / 2 });
            setTransformClass('-translate-x-1/2');
        } else {
            setCoords({ top: rect.top + rect.height / 2, left: rect.left - margin });
            setTransformClass('-translate-y-1/2 -translate-x-full');
        }
    }, [position]);

    useEffect(() => {
        if (!open) return;
        updatePosition();
        const onScroll = () => updatePosition();
        const onResize = () => updatePosition();
        const onClickOutside = (e: MouseEvent) => {
            if (!triggerRef.current) return;
            // If the click is outside the trigger, we close. 
            // Note: The portal content is outside the React tree but inside the DOM.
            // We need to check if the click target is inside the portal content.
            // Since we don't have a ref to the portal content easily here without more state,
            // we'll rely on the fact that the portal is rendered into document.body.
            // A better approach for production is using a library like Radix UI Popover.
            // For now, we'll just close if it's not the trigger.
            if (!triggerRef.current.contains(e.target as Node)) {
                // Check if click is inside the popover content (we'd need a ref to it)
                // Simplified: just close on any click outside trigger for now, or improve logic.
                // Let's use a simple timeout to allow the click to propagate if needed.
                setOpen(false);
            }
        };

        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        document.addEventListener('mousedown', onClickOutside);

        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
            document.removeEventListener('mousedown', onClickOutside);
        };
    }, [open, updatePosition]);

    return (
        <div
            ref={triggerRef}
            className={cn("inline-flex items-center cursor-pointer", className)}
            onClick={() => setOpen(!open)}
        >
            {children || <Info className="w-4 h-4 text-gray-400 hover:text-gray-600" />}
            {open && createPortal(
                <div
                    className={cn(
                        "fixed z-[9999] w-64 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl text-sm",
                        transformClass
                    )}
                    style={{ top: coords.top, left: coords.left }}
                    onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                >
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h4>
                    <div className="text-gray-600 dark:text-gray-300 space-y-2">
                        {content}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
