import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { ProjectProvider } from "./contexts/ProjectContext";
import { LicenseProvider } from "./providers/LicenseProvider";
import { Toaster } from "./components/ui/toaster";

// Create a client
const queryClient = new QueryClient();

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>
        <LicenseProvider>
          <RouterProvider router={router} />
          <Toaster />
        </LicenseProvider>
      </ProjectProvider>
    </QueryClientProvider>
  );
}

export default App;
