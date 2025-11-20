/* @refresh reload */
import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo } from 'react';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache'; // Use alias path, should work within frontend
import { logger } from '@/utils/clientLogger';

// Define the interface for the project data
// Ensure this matches the structure returned by electronApi.projects.getActive()
interface ActiveProject {
  name: string;
  dbPath: string;
  path: string; // Ensure path is included
}

// Define the context type
interface ProjectContextType {
  activeProject: ActiveProject | null;
  // Removed setActiveProjectDirectly as it wasn't used and context manages internally
  isLoadingProject: boolean;
  refreshProjects?: () => Promise<void>; // Added for import functionality
}

// Create the context
const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// Define props for the provider
interface ProjectProviderProps {
  children: ReactNode;
}

// Create the Provider component
export function ProjectProvider({ children }: ProjectProviderProps): JSX.Element {
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const resetGlobalCache = useGlobalDataCache(state => state.resetCache);
  const electronApi = typeof window !== 'undefined' ? (window as any).electronApi : undefined;
  const hasProjectsApi = Boolean(electronApi?.projects);

  // Function to refresh projects (conceptual, assumes an API method exists)
  const refreshProjects = async () => {
    logger.project.info('Attempting to refresh projects list...');
    if (electronApi?.projects?.getAll) { // Assuming an API like projects.getAll exists
      try {
        // Potentially, this function might just trigger a re-fetch or a notification
        // to the main process to update its internal list and re-broadcast.
        // For now, let's assume it can re-fetch and update projects if needed.
        // Or, it might simply re-trigger getInitialProject logic if that handles project list updates.
        // This is a placeholder for however your app manages the overall project list.
        await electronApi.projects.getAll(); // Example: re-fetch all projects
        // Potentially re-set active project if the list change affects it
        // This part depends heavily on your app's specific logic for managing project lists.
        logger.project.info('Projects list refreshed successfully');
        // You might need to update activeProject or other state here based on the new list
      } catch (error) {
        logger.project.error('Error refreshing projects list', error);
      }
    } else {
      logger.project.warn('electronApi.projects.getAll is not available for refreshing');
    }
  };

  useEffect(() => {
    logger.project.debug('ProjectProvider useEffect triggered', { electronApiFound: !!electronApi, hasProjectsApi });

    if (!hasProjectsApi) {
      logger.project.warn('electronApi.projects not found. Skipping project initialization for non-Electron environment.');
      setActiveProject(null);
      resetGlobalCache();
      setIsLoadingProject(false);
      return;
    }

    const getInitialProject = async () => {
      setIsLoadingProject(true);
      logger.project.info('Attempting to fetch initial active project...');
      try {
        if (!electronApi?.projects?.getActive) {
          logger.project.warn('electronApi.projects.getActive is not available. Defaulting active project to null.');
          setActiveProject(null);
          resetGlobalCache();
          return;
        }
        logger.project.debug('Invoking projects.getActive...');
        const initialProject = await electronApi.projects.getActive();

        logger.project.debug('Received initial active project response', { initialProject });
        // Validate the structure slightly more robustly
        if (initialProject && typeof initialProject.name === 'string' && typeof initialProject.dbPath === 'string' && typeof initialProject.path === 'string') {
           logger.project.info('Setting initial active project', { projectName: initialProject.name });
           setActiveProject(initialProject);
        } else {
           logger.project.info('No active project found, attempting to open the most recent project...');
           
           // Try to get all projects and open the most recent one
           try {
             if (electronApi?.projects?.getAll) {
               const allProjects = await electronApi.projects.getAll();
               console.log('[FE ProjectProvider] Found projects:', allProjects);
               
               if (allProjects && allProjects.length > 0) {
                 // Get the most recent project (assuming they are ordered by recency)
                 const mostRecentProject = allProjects[0];
                 console.log('[FE ProjectProvider] Attempting to open most recent project:', mostRecentProject);
                 
                 if (electronApi?.projects?.setActive) {
                   await electronApi.projects.setActive(mostRecentProject.path);
                   console.log('[FE ProjectProvider] Successfully set most recent project as active');
                   setActiveProject(mostRecentProject);
                 } else {
                   console.warn('[FE ProjectProvider] electronApi.projects.setActive not available');
                   setActiveProject(null);
                   resetGlobalCache();
                 }
               } else {
                 console.log('[FE ProjectProvider] No projects found, setting to null.');
                 setActiveProject(null);
                 resetGlobalCache();
               }
             } else {
               console.warn('[FE ProjectProvider] electronApi.projects.getAll not available');
               setActiveProject(null);
               resetGlobalCache();
             }
           } catch (autoOpenError) {
             console.error('[FE ProjectProvider] Error auto-opening most recent project:', autoOpenError);
             setActiveProject(null);
             resetGlobalCache();
           }
        }
      } catch (error) {
        console.error('[FE ProjectProvider] Error fetching initial active project via API:', error);
        setActiveProject(null);
        console.log('[FE ProjectProvider] Error fetching initial project, resetting global data cache.');
        resetGlobalCache(); // Reset cache on error
      } finally {
        console.log('[FE ProjectProvider] Finished fetching initial project.');
        setIsLoadingProject(false);
      }
    };

    let unsubscribe: (() => void) | undefined;

    if (electronApi?.projects) {
      getInitialProject(); // Fetch initial state

      // Setup listener only if API is available
      if (electronApi.projects?.onActiveChange) {
        const handleProjectUpdate = (projectInfo: ActiveProject | null) => {
            console.log('[FE ProjectProvider] received active-project-changed via onActiveChange:', projectInfo);
            // Validate only the properties confirmed to be sent by the event
            const isValidProject = projectInfo && 
                                   typeof projectInfo.name === 'string' && 
                                   typeof projectInfo.dbPath === 'string';
            const newProjectState = isValidProject ? projectInfo : null;

            // Add log to see validation result
            console.log(`[FE ProjectProvider] Validation result: isValidProject=${isValidProject}, newProjectState=`, newProjectState);

            setActiveProject(newProjectState);
            setIsLoadingProject(false); // Ensure loading is false after update

            if (newProjectState === null) {
                console.log('[FE ProjectProvider] Active project set to null via listener (or invalid data received), resetting global data cache.');
                resetGlobalCache(); // Reset cache if project becomes null
            }
        };

        console.log('[FE ProjectProvider] Setting up active-project-changed listener...');
        unsubscribe = electronApi.projects.onActiveChange(handleProjectUpdate);

      } else {
        console.error('[FE ProjectProvider] electronApi.projects.onActiveChange is not available! Cannot listen for project changes.');
        setIsLoadingProject(false); // Still need to set loading false if listener fails
      }
    }
    // Cleanup listener on component unmount
    return () => {
      if (unsubscribe) {
        console.log('[FE ProjectProvider] Cleaning up listener via returned function.');
        unsubscribe();
      }
    };
    // resetGlobalCache is stable from Zustand, electronApi reference is stable
  }, [electronApi, hasProjectsApi, resetGlobalCache]);

  // Memoize context value
  const contextValue = useMemo(() => ({
    activeProject,
    isLoadingProject,
    refreshProjects
  }), [activeProject, isLoadingProject, refreshProjects]);

  // Render the provider with the calculated value
  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
}

// Create and export the hook to use the context
export function useProject(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    // This error means a component tried to use the context
    // without being wrapped in the ProjectProvider
    throw new Error('useProject must be used within a ProjectProvider (frontend/src/contexts)');
  }
  return context;
}