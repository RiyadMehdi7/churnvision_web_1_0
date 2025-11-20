import React, { createContext, useContext, useState, useEffect } from 'react';

interface ProjectContextType {
    projectId: string;
    projectName: string;
    setProjectId: (id: string) => void;
    setProjectName: (name: string) => void;
    isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [projectId, setProjectId] = useState<string>('default-project');
    const [projectName, setProjectName] = useState<string>('ChurnVision Enterprise');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Simulate loading project data
    useEffect(() => {
        setIsLoading(true);
        // In a real app, we would fetch project data here
        setTimeout(() => {
            setIsLoading(false);
        }, 500);
    }, [projectId]);

    return (
        <ProjectContext.Provider value={{ projectId, projectName, setProjectId, setProjectName, isLoading }}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
