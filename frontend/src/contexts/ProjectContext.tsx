/* @refresh reload */
import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo } from 'react';
import { useGlobalDataCache } from '@/hooks/useGlobalDataCache';
import { logger } from '@/utils/clientLogger';
import api from '@/services/api';

// Define the interface for the project data
interface ActiveProject {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    dbPath?: string; // Legacy support
    path?: string;   // Legacy support
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
    const refreshProjects = async () => {
        logger.project.info('Attempting to refresh projects list...');
        try {
            const response = await api.get('/projects');
            logger.project.info('Projects list refreshed successfully');
            // You might need to update activeProject based on the response
            if (response.data.length > 0 && !activeProject) {
                setActiveProjectState(response.data[0]);
            }
        } catch (error) {
            logger.project.error('Error refreshing projects list', error);
        }
    };

    // Function to set active project
    const setActiveProject = (project: ActiveProject | null) => {
        setActiveProjectState(project);
        if (project) {
            localStorage.setItem('activeProjectId', project.id);
        } else {
            localStorage.removeItem('activeProjectId');
            resetGlobalCache();
        }
    };

    useEffect(() => {
        const getInitialProject = async () => {
            setIsLoadingProject(true);
            logger.project.info('Attempting to fetch initial active project...');

            try {
                // Check if there's a saved project ID in localStorage
                const savedProjectId = localStorage.getItem('activeProjectId');

                if (savedProjectId) {
                    // Fetch the specific project
                    try {
                        const response = await api.get(`/projects/${savedProjectId}`);
                        logger.project.info('Setting initial active project', { projectName: response.data.name });
                        setActiveProjectState(response.data);
                    } catch (error) {
                        // Project not found, fetch all and use first
                        logger.project.warn('Saved project not found, fetching all projects');
                        localStorage.removeItem('activeProjectId');
                        await refreshProjects();
                    }
                } else {
                    // No saved project, fetch all and use first
                    await refreshProjects();
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
    }), [activeProject, isLoadingProject]);

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
