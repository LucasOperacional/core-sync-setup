import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Só pré-carrega quando o ponteiro fica parado no link: passar o mouse pelo
    // menu deixa de disparar o carregamento de dezenas de telas ao mesmo tempo.
    defaultPreloadDelay: 250,
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
