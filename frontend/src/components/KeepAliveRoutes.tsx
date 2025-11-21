import React, { useMemo, useRef } from 'react';
import { useRoutes, useLocation, type RouteObject } from 'react-router-dom';

interface KeepAliveRoutesProps {
  routes: RouteObject[];
}

interface CacheMap extends Map<string, React.ReactNode> {}

/**
 * Simple keep-alive router that remembers mounted route elements by pathname so
 * navigating away and back preserves component state instead of remounting.
 */
export const KeepAliveRoutes: React.FC<KeepAliveRoutesProps> = ({ routes }) => {
  const location = useLocation();
  const cacheRef = useRef<CacheMap>(new Map());

  const element = useRoutes(routes, location);
  const cacheKey = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash]
  );

  if (element && !cacheRef.current.has(cacheKey)) {
    cacheRef.current.set(cacheKey, element);
  }

  const cachedEntries = Array.from(cacheRef.current.entries());

  return (
    <>
      {cachedEntries.map(([key, cachedElement]) => {
        const isActive = key === cacheKey;
        return (
          <div
            key={key}
            style={{
              display: isActive ? 'block' : 'none',
              height: '100%',
              width: '100%',
            }}
          >
            {cachedElement}
          </div>
        );
      })}
      {!cacheRef.current.has(cacheKey) && element}
    </>
  );
};

export default KeepAliveRoutes;
