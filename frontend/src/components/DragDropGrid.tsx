import React, { useState, useCallback, useMemo } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { motion } from 'framer-motion';
import { GripVertical, X, Settings, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { DashboardWidget } from '../types/dashboard';
import { WIDGET_COMPONENTS } from './widgets';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DragDropGridProps {
  widgets: DashboardWidget[];
  isEditing: boolean;
  onLayoutChange: (layout: Layout[]) => void;
  onWidgetRemove: (widgetId: string) => void;
  onWidgetConfigure: (widgetId: string) => void;
  employees: any[];
  className?: string;
}

interface WidgetWrapperProps {
  isEditing: boolean;
  onRemove: () => void;
  onConfigure: () => void;
  children: React.ReactNode;
}

const WidgetWrapper: React.FC<WidgetWrapperProps> = ({
  isEditing,
  onRemove,
  onConfigure,
  children
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        "relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200",
        isEditing && "ring-2 ring-blue-500/20",
        isHovered && isEditing && "ring-blue-500/40"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Widget Controls */}
      {isEditing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.7 }}
          className="absolute top-2 right-2 z-50 flex items-center space-x-1"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onConfigure();
            }}
            className="p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Configure Widget"
          >
            <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRemove();
            }}
            className="p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Remove Widget"
          >
            <X className="w-3 h-3 text-red-600 dark:text-red-400" />
          </button>
        </motion.div>
      )}

      {/* Drag Handle */}
      {isEditing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.5 }}
          className="absolute top-2 left-2 z-50 cursor-move drag-handle"
        >
          <div className="p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-sm">
            <GripVertical className="w-3 h-3 text-gray-400" />
          </div>
        </motion.div>
      )}

      {/* Widget Content */}
      <div className="h-full w-full">
        {children}
      </div>

      {/* Resize Indicator */}
      {isEditing && (
        <div className="absolute bottom-1 right-1 text-gray-400">
          <Maximize2 className="w-3 h-3" />
        </div>
      )}
    </div>
  );
};

export const DragDropGrid: React.FC<DragDropGridProps> = ({
  widgets,
  isEditing,
  onLayoutChange,
  onWidgetRemove,
  onWidgetConfigure,
  employees,
  className
}) => {
  const [isDragging, setIsDragging] = useState(false);

  // Convert widgets to grid layout format
  const layouts = useMemo(() => {
    const layout = widgets.map(widget => ({
      i: widget.id,
      x: widget.position.x,
      y: widget.position.y,
      w: widget.position.w,
      h: widget.position.h,
      minW: widget.config?.minWidth ? Math.ceil(widget.config.minWidth / 100) : 2,
      minH: widget.config?.minHeight ? Math.ceil(widget.config.minHeight / 100) : 2,
      maxW: 12,
      maxH: 10
    }));

    return {
      lg: layout,
      md: layout.map(item => ({ ...item, w: Math.min(item.w, 8) })),
      sm: layout.map(item => ({ ...item, w: Math.min(item.w, 6) })),
      xs: layout.map(item => ({ ...item, w: 12, h: Math.max(item.h, 3) })),
      xxs: layout.map(item => ({ ...item, w: 12, h: Math.max(item.h, 3) }))
    };
  }, [widgets]);

  // Grid breakpoints
  const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
  const cols = { lg: 12, md: 8, sm: 6, xs: 4, xxs: 2 };

  // Handle layout changes
  const handleLayoutChange = useCallback((layout: Layout[]) => {
    if (!isEditing) return;
    onLayoutChange(layout);
  }, [isEditing, onLayoutChange]);

  // Handle drag events
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragStop = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Render widget content
  const renderWidget = useCallback((widget: DashboardWidget) => {
    const WidgetComponent = WIDGET_COMPONENTS[widget.type as keyof typeof WIDGET_COMPONENTS];
    
    if (!WidgetComponent) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <Settings className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">Widget not found</p>
            <p className="text-xs">{widget.type}</p>
          </div>
        </div>
      );
    }

    return (
      <WidgetComponent
        widget={widget}
        employees={employees}
        className="h-full"
      />
    );
  }, [employees]);

  return (
    <div className={cn("w-full h-full", className)}>
      <ResponsiveGridLayout
        className={cn(
          "layout transition-all duration-200 h-full",
          isDragging && "dragging"
        )}
        layouts={layouts}
        breakpoints={breakpoints}
        cols={cols}
        rowHeight={60}
        margin={[16, 16]}
        containerPadding={[16, 16]}
        isDraggable={isEditing}
        isResizable={isEditing}
        onLayoutChange={handleLayoutChange}
        onDragStart={handleDragStart}
        onDragStop={handleDragStop}
        // dragHandleClassName="drag-handle" // Not supported in react-grid-layout
        resizeHandles={['se']}
        compactType="vertical"
        preventCollision={true}
        useCSSTransforms={true}
        autoSize={true}
      >
        {widgets.map(widget => (
          <div key={widget.id} className="widget-container">
            <WidgetWrapper
              isEditing={isEditing}
              onRemove={() => onWidgetRemove(widget.id)}
              onConfigure={() => onWidgetConfigure(widget.id)}
            >
              {renderWidget(widget)}
            </WidgetWrapper>
          </div>
        ))}
      </ResponsiveGridLayout>

      {/* Empty State */}
      {widgets.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center min-h-96 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
        >
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <Settings className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No widgets added yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {isEditing 
                ? "Click 'Add Widget' in the toolbar to get started"
                : "Enable customization mode to add widgets"
              }
            </p>
          </div>
        </motion.div>
      )}

      {/* Custom Styles */}
      <style>{`
        .react-grid-layout {
          position: relative;
          height: 100%;
          overflow: hidden;
        }
        
        .react-grid-item {
          transition: all 200ms ease;
          transition-property: left, top, width, height;
        }
        
        .react-grid-item.cssTransforms {
          transition-property: transform, width, height;
        }
        
        .react-grid-item > .react-resizable-handle {
          position: absolute;
          width: 20px;
          height: 20px;
          bottom: 0;
          right: 0;
          background: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNiIgaGVpZ2h0PSI2IiB2aWV3Qm94PSIwIDAgNiA2IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8ZG90cyBmaWxsPSIjOTk5IiBkPSJtMTUgMTJjMCAuNTUyLS40NDggMS0xIDFzLTEtLjQ0OC0xLTEgLjQ0OC0xIDEtMSAxIC40NDggMSAxem0wIDRjMCAuNTUyLS40NDggMS0xIDFzLTEtLjQ0OC0xLTEgLjQ0OC0xIDEtMSAxIC40NDggMSAxem0wIDRjMCAuNTUyLS40NDggMS0xIDFzLTEtLjQ0OC0xLTEgLjQ0OC0xIDEtMSAxIC40NDggMSAxem0tNS00YzAtLjU1Mi40NDgtMSAxLTFzMSAuNDQ4IDEgMS0uNDQ4IDEtMSAxLTEtLjQ0OC0xLTF6bTAgNGMwLS41NTIuNDQ4LTEgMS0xczEgLjQ0OCAxIDEtLjQ0OCAxLTEgMS0xLS40NDgtMS0xem0wIDRjMC0uNTUyLjQ0OC0xIDEtMXMxIC40NDggMSAxLS40NDggMS0xIDEtMS0uNDQ4LTEtMXptLTUtNGMwLS41NTIuNDQ4LTEgMS0xczEgLjQ0OCAxIDEtLjQ0OCAxLTEgMS0xLS40NDgtMS0xem0wIDRjMC0uNTUyLjQ0OC0xIDEtMXMxIC40NDggMSAxLS40NDggMS0xIDEtMS0uNDQ4LTEtMXoiLz4KPHN2Zz4K') no-repeat;
          background-position: bottom right;
          padding: 0 3px 3px 0;
          background-repeat: no-repeat;
          background-origin: content-box;
          box-sizing: border-box;
          cursor: se-resize;
          opacity: 0.4;
          transition: opacity 0.2s;
        }
        
        .react-grid-item:hover > .react-resizable-handle {
          opacity: 0.8;
        }
        
        .react-grid-item.react-grid-placeholder {
          background: rgb(59 130 246 / 0.1);
          border: 2px dashed rgb(59 130 246 / 0.4);
          opacity: 0.2;
          transition-duration: 100ms;
          z-index: 2;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          -o-user-select: none;
          user-select: none;
        }
        
        .react-grid-item.react-draggable-dragging {
          transition: none;
          z-index: 3;
          opacity: 0.8;
        }
        
        .react-grid-item.react-grid-placeholder {
          background: rgb(59 130 246 / 0.1);
          opacity: 0.2;
          transition-duration: 100ms;
          z-index: 2;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          -o-user-select: none;
          user-select: none;
        }
        
        .layout.dragging .widget-container {
          pointer-events: none;
        }
        
        .layout.dragging .widget-container .absolute {
          pointer-events: auto;
        }
        
        .widget-container {
          height: 100%;
          width: 100%;
        }
        
        @media (max-width: 768px) {
          .react-grid-layout {
            margin: 0 -8px;
          }
          
          .react-grid-item {
            margin: 8px;
          }
        }
      `}</style>
    </div>
  );
};