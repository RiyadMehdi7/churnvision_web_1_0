/**
 * @deprecated This file is deprecated. Use '@/utils/clientLogger' instead.
 *
 * This file now re-exports from clientLogger.ts for backwards compatibility.
 * All new code should import directly from '@/utils/clientLogger'.
 *
 * Migration guide:
 *   Before: import { logger, appLogger, uiLogger } from '@/utils/logger';
 *   After:  import { logger, appLogger, uiLogger } from '@/utils/clientLogger';
 */

export { logger, appLogger, uiLogger } from './clientLogger';
export { default } from './clientLogger';
