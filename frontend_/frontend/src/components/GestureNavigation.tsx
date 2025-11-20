import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, 
  Brain, 
  PlayCircle, 
  Database, 
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface GestureNavigationProps {
  children: React.ReactNode;
}

const navigationItems = [
  { path: '/', icon: Home, label: 'Dashboard', color: 'from-blue-400 to-blue-600' },
  { path: '/ai-assistant', icon: Brain, label: 'AI Assistant', color: 'from-purple-400 to-purple-600' },
  { path: '/playground', icon: PlayCircle, label: 'Playground', color: 'from-green-400 to-green-600' },
  { path: '/data-management', icon: Database, label: 'Data', color: 'from-orange-400 to-orange-600' },
  { path: '/settings', icon: Settings, label: 'Settings', color: 'from-gray-400 to-gray-600' }
];

export const GestureNavigation: React.FC<GestureNavigationProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [gestureDirection, setGestureDirection] = useState<'left' | 'right' | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0.7, 1, 0.7]);
  const scale = useTransform(x, [-200, 0, 200], [0.95, 1, 0.95]);

  // Update current index based on location
  useEffect(() => {
    const index = navigationItems.findIndex(item => item.path === location.pathname);
    if (index !== -1) {
      setCurrentIndex(index);
    }
  }, [location.pathname]);

  const handlePanStart = () => {
    setIsGestureActive(true);
  };

  const handlePan = (_: any, info: PanInfo) => {
    const threshold = 50;
    
    if (Math.abs(info.offset.x) > threshold) {
      const direction = info.offset.x > 0 ? 'right' : 'left';
      setGestureDirection(direction);
    } else {
      setGestureDirection(null);
    }
  };

  const handlePanEnd = (_: any, info: PanInfo) => {
    setIsGestureActive(false);
    setGestureDirection(null);
    
    const threshold = 100;
    const velocity = Math.abs(info.velocity.x);
    
    if (Math.abs(info.offset.x) > threshold || velocity > 500) {
      if (info.offset.x > 0 && currentIndex > 0) {
        // Swipe right - go to previous page
        const newIndex = currentIndex - 1;
        setCurrentIndex(newIndex);
        navigate(navigationItems[newIndex].path);
      } else if (info.offset.x < 0 && currentIndex < navigationItems.length - 1) {
        // Swipe left - go to next page
        const newIndex = currentIndex + 1;
        setCurrentIndex(newIndex);
        navigate(navigationItems[newIndex].path);
      }
    }
    
    // Reset position
    controls.start({ x: 0 });
  };

  const navigateToPage = (index: number) => {
    setCurrentIndex(index);
    navigate(navigationItems[index].path);
  };

  return (
    <div className="relative h-full overflow-hidden">
      {/* Gesture overlay */}
      <motion.div
        ref={containerRef}
        className="h-full"
        drag="x"
        dragConstraints={{ left: -300, right: 300 }}
        dragElastic={0.2}
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        animate={controls}
        style={{ x, opacity, scale }}
        whileDrag={{ cursor: 'grabbing' }}
      >
        {children}
      </motion.div>

      {/* Gesture indicators */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isGestureActive ? 1 : 0 }}
        className="absolute inset-0 pointer-events-none z-40"
      >
        {/* Left indicator */}
        {gestureDirection === 'right' && currentIndex > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute left-8 top-1/2 transform -translate-y-1/2"
          >
            <div className="flex items-center space-x-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-2xl">
              <ChevronLeft className="w-6 h-6 text-blue-600" />
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {navigationItems[currentIndex - 1].label}
                </div>
                <div className="text-xs text-gray-500">Swipe to navigate</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Right indicator */}
        {gestureDirection === 'left' && currentIndex < navigationItems.length - 1 && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute right-8 top-1/2 transform -translate-y-1/2"
          >
            <div className="flex items-center space-x-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-2xl">
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {navigationItems[currentIndex + 1].label}
                </div>
                <div className="text-xs text-gray-500">Swipe to navigate</div>
              </div>
              <ChevronRight className="w-6 h-6 text-blue-600" />
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Bottom navigation dots */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-30"
      >
        <div className="flex items-center space-x-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full p-3 shadow-lg">
          {navigationItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === currentIndex;
            
            return (
              <motion.button
                key={item.path}
                onClick={() => navigateToPage(index)}
                className={`
                  relative p-3 rounded-full transition-all duration-300
                  ${isActive 
                    ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-lg' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  }
                `}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                animate={{
                  scale: isActive ? 1.1 : 1,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Icon size={20} />
                
                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                {/* Tooltip */}
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  whileHover={{ opacity: 1, y: -40, scale: 1 }}
                  className="absolute left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none"
                >
                  {item.label}
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Swipe hint for first-time users */}
      <SwipeHint />
    </div>
  );
};

// Component to show swipe hint for new users
const SwipeHint: React.FC = () => {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const hasSeenHint = localStorage.getItem('hasSeenSwipeHint');
    if (!hasSeenHint) {
      setTimeout(() => setShowHint(true), 2000);
    }
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    localStorage.setItem('hasSeenSwipeHint', 'true');
  };

  if (!showHint) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-40"
    >
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-2xl shadow-2xl">
        <div className="flex items-center space-x-3">
          <motion.div
            animate={{ x: [-10, 10, -10] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-2xl"
          >
            👆
          </motion.div>
          <div>
            <div className="font-semibold text-sm">Swipe to navigate</div>
            <div className="text-xs opacity-90">Try swiping left or right</div>
          </div>
          <button
            onClick={dismissHint}
            className="text-white/80 hover:text-white ml-2"
          >
            ×
          </button>
        </div>
      </div>
    </motion.div>
  );
};