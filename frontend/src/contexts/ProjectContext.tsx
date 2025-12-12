/* @refresh reload */
import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo, useCallback, useRef } from 'react';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { logger } from '@/utils/clientLogger';
import api from '@/services/api';
import { authService } from '@/services/authService';

// Define the interface for the project data
interface ActiveProject {
    id: string;
    name: string;
    created_at?: string;
    updated_at?: string;
    dbPath?: string; // Legacy support
    path?: string;   // Legacy support
    active?: boolean; // Needed for /data-management/projects response
}

// Define the context type
interface ProjectContextType {
    activeProject: ActiveProject | null;
    isLoadingProject: boolean;
    refreshProjects: () => Promise<void>;
    setActiveProject: (project: ActiveProject | null) => void;
}

// Create the context
const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// Define props for the provider
interface ProjectProviderProps {
    children: ReactNode;
}

// Create the Provider component
export function ProjectProvider({ children }: ProjectProviderProps): JSX.Element {
    const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(null);
    const [isLoadingProject, setIsLoadingProject] = useState(true);
    const resetGlobalCache = useGlobalDataCache(state => state.resetCache);

    // Function to refresh projects
    const refreshProjects = useCallback(async () => {
        if (!authService.isAuthenticated()) {
            logger.project.warn('refreshProjects skipped: no access token present (user not authenticated).');
            setActiveProjectState(null);
            setIsLoadingProject(false);
            return;
        }

        logger.project.info('Attempting to refresh projects list...');
        try {
            const response = await api.get('/data-management/projects');
            logger.project.info('Projects list refreshed successfully');

            // Prefer project marked active; otherwise pick first
            const projects: ActiveProject[] = response.data || [];
            const active = projects.find(p => p.active);
            if (projects.length > 0 && (!activeProject || active)) {
                setActiveProjectState(active || projects[0]);
            }
        } catch (error) {
            logger.project.error('Error refreshing projects list', error);
        }
    // Stable; don't depend on activeProject to avoid effect loops
    }, []);

    // Function to set active project
    const setActiveProject = useCallback((project: ActiveProject | null) => {
        setActiveProjectState(project);
        if (project) {
            localStorage.setItem('activeProjectId', project.id);
        } else {
            localStorage.removeItem('activeProjectId');
            resetGlobalCache();
        }
    }, [resetGlobalCache]);

    const initializedRef = useRef(false);

    useEffect(() => {
        if (initializedRef.current) return; // Prevent double init (StrictMode/hot reload)
        initializedRef.current = true;
        const getInitialProject = async () => {
            setIsLoadingProject(true);
            logger.project.info('Attempting to fetch initial active project...');

            if (!authService.isAuthenticated()) {
                logger.project.warn('Skipping initial project fetch: no access token present (user not authenticated).');
                setActiveProjectState(null);
                resetGlobalCache();
                setIsLoadingProject(false);
                return;
            }

            try {
                // Check if there's a saved project ID in localStorage
                const savedProjectId = localStorage.getItem('activeProjectId');

                const response = await api.get('/data-management/projects');
                const projects: ActiveProject[] = response.data || [];

                // If we have a saved id, try to use it; otherwise prefer active flag then first
                if (savedProjectId) {
                    const saved = projects.find(p => p.id === savedProjectId);
                    if (saved) {
                        logger.project.info('Setting initial active project', { projectName: saved.name });
                        setActiveProjectState(saved);
                    } else {
                        logger.project.warn('Saved project not found, selecting first available');
                        localStorage.removeItem('activeProjectId');
                        const fallback = projects.find(p => p.active) || projects[0] || null;
                        setActiveProjectState(fallback ?? null);
                    }
                } else {
                    const fallback = projects.find(p => p.active) || projects[0] || null;
                    setActiveProjectState(fallback ?? null);
                }
            } catch (error) {
                logger.project.error('Error fetching initial active project:', error);
                setActiveProjectState(null);
                resetGlobalCache();
            } finally {
                logger.project.info('Finished fetching initial project.');
                setIsLoadingProject(false);
            }
        };

        getInitialProject();
    }, [resetGlobalCache]);

    // Memoize context value
    const contextValue = useMemo(() => ({
        activeProject,
        isLoadingProject,
        refreshProjects,
        setActiveProject
    }), [activeProject, isLoadingProject, refreshProjects, setActiveProject]);

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
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
}
