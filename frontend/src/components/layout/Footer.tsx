import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ExternalLink, Mail } from 'lucide-react';

export function Footer(): React.ReactElement {
  const currentYear = new Date().getFullYear();
  const appVersion = "1.0.0"; // You can make this dynamic if needed

  const handleExternalLink = (url: string) => {
    // Open in new tab for web application
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.footer 
      className="app-footer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
    >
      <div className="max-w-[1600px] mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center py-2">
          <div className="mb-2 md:mb-0">
            <span className="font-medium text-neutral">
              ChurnVision
            </span>
            <span className="mx-2 text-neutral-subtle">|</span>
            <span>
              © {currentYear} All rights reserved
            </span>
            <span className="mx-2 text-neutral-subtle">|</span>
            <span className="text-xs text-neutral-muted">
              v{appVersion}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => handleExternalLink('https://churnvision.tech')}
              className="footer-link flex items-center gap-1"
              aria-label="ChurnVision Website"
            >
              <ExternalLink size={16} />
              <span className="hidden sm:inline">Website</span>
            </button>
            <a 
              href="mailto:support@churnvision.tech" 
              className="footer-link flex items-center gap-1"
              aria-label="Contact"
            >
              <Mail size={16} />
              <span className="hidden sm:inline">Contact</span>
            </a>
            <Link 
              to="/privacy" 
              className="footer-link"
            >
              Privacy
            </Link>
            <Link 
              to="/terms" 
              className="footer-link"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </motion.footer>
  );
} 
