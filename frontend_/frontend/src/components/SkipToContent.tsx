import React from 'react';

export function SkipToContent(): React.ReactElement {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:shadow-lg focus:rounded-md"
    >
      Skip to main content
    </a>
  );
} 